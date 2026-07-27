import type { FastifyInstance } from 'fastify'
import { rm } from 'node:fs/promises'
import { statfs } from 'node:fs/promises'
import path from 'node:path'
import {
  addCheckout,
  checkedOutItemIds,
  deleteCheckout,
  getCheckout,
  listCheckouts,
  updateCheckout,
  type NewCheckout,
} from '../checkouts.ts'
import type { JellyfinItem } from '../jellyfin.ts'
import { TRANSCODE_PROFILES, estimateBytes, isValidProfile } from '../profiles.ts'
import { client, libraryDirs, primaryContext } from '../servers.ts'
import { getSetting } from '../db.ts'
import { syncWatchState } from '../sync.ts'
import { abortTransfer, partialPath, wake } from '../worker.ts'

function toNewCheckout(item: JellyfinItem, profile: string): NewCheckout {
  const source = item.MediaSources?.[0]
  return {
    item_id: item.Id,
    kind: item.Type === 'Episode' ? 'Episode' : 'Movie',
    title: item.Name,
    year: item.ProductionYear ?? null,
    series_name: item.SeriesName ?? null,
    season: item.ParentIndexNumber ?? null,
    episode: item.IndexNumber ?? null,
    profile,
    bytes_total:
      profile === 'original' ? source?.Size ?? 0 : estimateBytes(profile, item.RunTimeTicks),
    source_name: item.Path ? path.basename(item.Path) : source?.Path ? path.basename(source.Path) : null,
    provider_ids: item.ProviderIds && Object.keys(item.ProviderIds).length ? JSON.stringify(item.ProviderIds) : null,
  }
}

function episodeOrder(a: JellyfinItem, b: JellyfinItem): number {
  return (a.ParentIndexNumber ?? 0) - (b.ParentIndexNumber ?? 0) || (a.IndexNumber ?? 0) - (b.IndexNumber ?? 0)
}

export function transferRoutes(app: FastifyInstance) {
  app.get('/api/profiles', async () => TRANSCODE_PROFILES)

  // Queue a checkout. Movies/episodes queue directly; series/seasons expand to episodes.
  app.post<{ Body: { itemId?: string; profile?: string; mode?: string; count?: number } }>(
    '/api/checkouts',
    async (req, reply) => {
      const ctx = primaryContext()
      if (!ctx) return reply.code(409).send({ error: 'not_configured' })
      const itemId = req.body?.itemId
      if (!itemId) return reply.code(400).send({ error: 'itemId required' })
      const profile = req.body?.profile ?? 'original'
      if (!isValidProfile(profile)) return reply.code(400).send({ error: `unknown profile: ${profile}` })
      const mode = req.body?.mode ?? 'all' // 'all' | 'unwatched'
      const count = req.body?.count // with mode=unwatched: only the next N

      const item = await ctx.client.item(ctx.userId, itemId)
      let queued = 0
      let skipped = 0

      if (item.Type === 'Movie' || item.Type === 'Episode') {
        addCheckout(toNewCheckout(item, profile)) ? queued++ : skipped++
      } else if (item.Type === 'Series' || item.Type === 'Season') {
        const seriesId = item.Type === 'Season' ? (item as { SeriesId?: string }).SeriesId ?? itemId : itemId
        const eps = await ctx.client.episodes(ctx.userId, seriesId)
        let wanted = (
          item.Type === 'Season'
            ? eps.Items.filter((e) => e.ParentIndexNumber === item.IndexNumber)
            : eps.Items
        )
          // Skip specials/virtual items with no file behind them.
          .filter((ep) => ep.Path || ep.MediaSources?.[0]?.Path)
          .sort(episodeOrder)
        if (mode === 'unwatched') {
          wanted = wanted.filter((ep) => !ep.UserData?.Played)
          if (count && count > 0) wanted = wanted.slice(0, count)
        }
        for (const ep of wanted) {
          addCheckout(toNewCheckout(ep, profile)) ? queued++ : skipped++
        }
      } else {
        return reply.code(400).send({ error: `cannot check out item type ${item.Type}` })
      }

      wake()
      return { queued, skipped }
    },
  )

  // Watch-state sync: mobile → primary. Manual trigger + last-run summary.
  app.post('/api/sync', async () => syncWatchState((m) => app.log.info(m)))
  app.get('/api/sync', async () => {
    const last = getSetting('sync.last')
    return last ? JSON.parse(last) : null
  })

  app.get('/api/checkouts', async () => {
    return { checkouts: listCheckouts(), checkedOutIds: [...checkedOutItemIds()] }
  })

  // Cancel a queued/transferring/errored checkout, or return an on-device item.
  app.delete<{ Params: { id: string } }>('/api/checkouts/:id', async (req, reply) => {
    const id = Number(req.params.id)
    const row = getCheckout(id)
    if (!row) return reply.code(404).send({ error: 'not_found' })

    if (row.status === 'transferring') abortTransfer(id)
    if (row.local_path) {
      await rm(row.local_path, { force: true })
      // Prune the now-empty movie folder (not the shared season/show folders).
      if (row.kind === 'Movie') await rm(path.dirname(row.local_path), { recursive: true, force: true })
    }
    await rm(partialPath(id), { force: true })
    const wasOnDevice = row.status === 'on_device'
    deleteCheckout(id)

    if (wasOnDevice) {
      try {
        await client('mobile')?.refreshLibrary()
      } catch {
        /* non-fatal */
      }
    }
    return { ok: true }
  })

  app.post<{ Params: { id: string } }>('/api/checkouts/:id/retry', async (req, reply) => {
    const id = Number(req.params.id)
    const row = getCheckout(id)
    if (!row) return reply.code(404).send({ error: 'not_found' })
    if (row.status !== 'error') return reply.code(400).send({ error: 'not in error state' })
    updateCheckout(id, { status: 'queued', retries: 0, error: null, next_retry_at: null })
    wake()
    return { ok: true }
  })

  // Disk usage of the mobile library volume, for the space meter.
  app.get('/api/device/space', async () => {
    const { moviesDir } = libraryDirs()
    if (!moviesDir) return { configured: false }
    try {
      const s = await statfs(moviesDir)
      return {
        configured: true,
        freeBytes: s.bavail * s.bsize,
        totalBytes: s.blocks * s.bsize,
      }
    } catch {
      return { configured: false }
    }
  })
}
