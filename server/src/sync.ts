// Watch-state sync: read played/position for on-device items from the MOBILE Jellyfin
// and push changes to the PRIMARY, so Continue Watching survives a trip. One-way,
// mobile → primary, with per-item snapshots so we only push what changed on the road.
import path from 'node:path'
import { listCheckouts, updateCheckout, type CheckoutRow } from './checkouts.ts'
import type { JellyfinClient, JellyfinItem } from './jellyfin.ts'
import { setSetting } from './db.ts'
import { mobileContext, primaryContext } from './servers.ts'

export interface SyncSummary {
  ranAt: string
  checked: number
  matched: number
  pushedPlayed: number
  pushedPosition: number
  errors: string[]
}

const MIN_POSITION_DELTA_TICKS = 60 * 10_000_000 // ignore <60s scrub noise

async function findOnMobile(
  mobile: { client: JellyfinClient; userId: string },
  row: CheckoutRow,
): Promise<JellyfinItem | null> {
  const providers = row.provider_ids ? (JSON.parse(row.provider_ids) as Record<string, string>) : {}
  if (Object.keys(providers).length) {
    const hits = await mobile.client.itemsByProviderIds(mobile.userId, providers)
    const typed = hits.filter((h) => h.Type === row.kind)
    if (typed.length === 1) return typed[0]
    if (typed.length > 1 && row.kind === 'Episode') {
      // Series-level provider IDs can match many episodes; pin by S/E numbers.
      const exact = typed.find(
        (h) => h.ParentIndexNumber === row.season && h.IndexNumber === row.episode,
      )
      if (exact) return exact
    } else if (typed.length > 1) {
      return typed[0]
    }
  }
  // Fallback: search by title and compare the file name we placed.
  if (!row.local_path) return null
  const base = path.basename(row.local_path)
  const term = row.kind === 'Episode' ? row.series_name ?? row.title : row.title
  const hits = await mobile.client.searchItems(mobile.userId, term, row.kind)
  return hits.find((h) => h.Path && path.basename(h.Path) === base) ?? null
}

export async function syncWatchState(log: (msg: string) => void): Promise<SyncSummary> {
  const summary: SyncSummary = {
    ranAt: new Date().toISOString(),
    checked: 0,
    matched: 0,
    pushedPlayed: 0,
    pushedPosition: 0,
    errors: [],
  }
  const primary = primaryContext()
  const mobile = mobileContext()
  if (!primary) {
    summary.errors.push('Primary server not configured')
    return summary
  }
  if (!mobile) {
    summary.errors.push('Mobile server not configured (URL, API key, and user required)')
    return summary
  }

  for (const row of listCheckouts(['on_device'])) {
    summary.checked++
    try {
      const item = await findOnMobile(mobile, row)
      if (!item) continue
      summary.matched++

      const played = item.UserData?.Played ? 1 : 0
      const position = item.UserData?.PlaybackPositionTicks ?? 0
      updateCheckout(row.id, { mobile_played: played, mobile_position: position })

      if (played && !row.synced_played) {
        await primary.client.setPlayed(primary.userId, row.item_id, true)
        updateCheckout(row.id, { synced_played: 1 })
        summary.pushedPlayed++
        log(`sync: marked played on primary — ${row.series_name ?? ''} ${row.title}`)
      } else if (
        !played &&
        position > 0 &&
        Math.abs(position - row.synced_position) > MIN_POSITION_DELTA_TICKS
      ) {
        await primary.client.setPosition(primary.userId, row.item_id, position)
        updateCheckout(row.id, { synced_position: position })
        summary.pushedPosition++
        log(`sync: pushed resume position — ${row.series_name ?? ''} ${row.title}`)
      }
    } catch (err) {
      summary.errors.push(`${row.title}: ${(err as Error).message}`)
    }
  }

  setSetting('sync.last', JSON.stringify(summary))
  return summary
}

export function startSyncLoop(log: (msg: string) => void, intervalMs = 10 * 60_000): void {
  setInterval(() => {
    syncWatchState(log).catch((err) => log(`sync loop error: ${(err as Error).message}`))
  }, intervalMs).unref()
}
