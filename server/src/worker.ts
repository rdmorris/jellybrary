// Transfer worker: pulls queued checkouts from the primary Jellyfin and places them
// in the mobile library. Resumes partial downloads via HTTP Range. Runs forever.
import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import path from 'node:path'
import { DATA_DIR } from './config.ts'
import { getCheckout, nextQueued, updateCheckout, type CheckoutRow } from './checkouts.ts'
import { TRANSCODE_PROFILES } from './profiles.ts'
import { client, libraryDirs, primaryContext, transferConcurrency } from './servers.ts'

const TICK_MS = 2000
const MAX_RETRIES = 5
const PARTIAL_DIR = path.join(DATA_DIR, 'partial')

const aborters = new Map<number, AbortController>()
let wakeMainLoop: (() => void) | null = null

/** Nudge the worker loop (called when new checkouts are queued). */
export function wake(): void {
  wakeMainLoop?.()
}

export function abortTransfer(id: number): void {
  aborters.get(id)?.abort()
}

export function partialPath(id: number): string {
  return path.join(PARTIAL_DIR, `${id}.partial`)
}

function sanitize(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim()
}

/** Destination path following Jellyfin naming conventions. */
export function destinationFor(row: CheckoutRow): string | null {
  const { moviesDir, showsDir } = libraryDirs()
  let fname = row.source_name ?? `${sanitize(row.title)}.mkv`
  // Transcodes are always remuxed into mkv, whatever the source container was.
  if (row.profile !== 'original') fname = fname.replace(/\.[^.]+$/, '') + '.mkv'
  if (row.kind === 'Movie') {
    if (!moviesDir) return null
    const folder = row.year ? `${sanitize(row.title)} (${row.year})` : sanitize(row.title)
    return path.join(moviesDir, folder, fname)
  }
  if (!showsDir || !row.series_name) return null
  const season = `Season ${String(row.season ?? 1).padStart(2, '0')}`
  return path.join(showsDir, sanitize(row.series_name), season, fname)
}

async function fileSizeOrZero(p: string): Promise<number> {
  try {
    return (await stat(p)).size
  } catch {
    return 0
  }
}

async function transfer(row: CheckoutRow, log: (msg: string) => void): Promise<void> {
  const ctx = primaryContext()
  if (!ctx) throw new Error('Primary server not configured')
  const dest = destinationFor(row)
  if (!dest) throw new Error('Mobile library folder not set (Settings → Library paths)')

  await mkdir(PARTIAL_DIR, { recursive: true })
  const partial = partialPath(row.id)
  const transcode = row.profile !== 'original' ? TRANSCODE_PROFILES[row.profile] : undefined
  if (row.profile !== 'original' && !transcode) throw new Error(`Unknown profile: ${row.profile}`)

  // Transcode streams are live encodes — no Range support, always start from zero.
  const offset = transcode ? 0 : await fileSizeOrZero(partial)

  const res = transcode
    ? await ctx.client.transcodeStream(row.item_id, transcode)
    : await ctx.client.download(row.item_id, offset)
  const resumed = res.status === 206
  const totalHeader = res.headers.get(resumed ? 'content-range' : 'content-length')
  // Transcodes are chunked with no length; keep the estimate stored at checkout time.
  const total = transcode
    ? row.bytes_total
    : resumed
      ? Number(totalHeader?.split('/')[1] ?? 0)
      : Number(totalHeader ?? 0)
  updateCheckout(row.id, {
    status: 'transferring',
    bytes_total: total || row.bytes_total,
    bytes_done: resumed ? offset : 0,
    error: null,
  })
  log(
    `transfer #${row.id} ${row.title}: ${resumed ? `resuming at ${offset}` : 'starting'}${transcode ? ` (${row.profile} transcode)` : ''}`,
  )

  const ac = new AbortController()
  aborters.set(row.id, ac)
  let done = resumed ? offset : 0
  let lastFlush = 0

  const counter = async function* (source: AsyncIterable<Uint8Array>) {
    for await (const chunk of source) {
      done += chunk.length
      const now = Date.now()
      if (now - lastFlush > 750) {
        lastFlush = now
        updateCheckout(row.id, { bytes_done: done })
      }
      yield chunk
    }
  }

  try {
    if (!res.body) throw new Error('Empty response body')
    await pipeline(
      Readable.fromWeb(res.body as import('node:stream/web').ReadableStream),
      counter,
      createWriteStream(partial, { flags: resumed ? 'a' : 'w' }),
      { signal: ac.signal },
    )
  } finally {
    aborters.delete(row.id)
  }

  // Originals have a known size to verify; transcodes only had an estimate, so the
  // final byte count becomes the recorded size instead.
  if (!transcode && total > 0) {
    const actual = await fileSizeOrZero(partial)
    if (actual !== total) throw new Error(`Size mismatch: got ${actual}, expected ${total}`)
  }

  await mkdir(path.dirname(dest), { recursive: true })
  await rename(partial, dest)
  updateCheckout(row.id, {
    status: 'on_device',
    bytes_done: done,
    bytes_total: transcode ? done : total || done,
    local_path: dest,
  })
  log(`transfer #${row.id} ${row.title}: done → ${dest}`)

  // Best-effort: ask the mobile Jellyfin to pick up the new file.
  try {
    await client('mobile')?.refreshLibrary()
  } catch (err) {
    log(`mobile library refresh failed (non-fatal): ${(err as Error).message}`)
  }
}

async function primaryReachable(): Promise<boolean> {
  const ctx = primaryContext()
  if (!ctx) return false
  try {
    await ctx.client.systemInfo()
    return true
  } catch {
    return false
  }
}

let reachableUntil = 0

export function startWorker(log: (msg: string) => void): void {
  void (async () => {
    log('transfer worker started')
    for (;;) {
      try {
        const row = nextQueued(transferConcurrency())
        if (row) {
          // Cache reachability briefly so a deep queue doesn't probe on every pick.
          if (Date.now() > reachableUntil) {
            if (await primaryReachable()) {
              reachableUntil = Date.now() + 30_000
            } else {
              log('primary unreachable; waiting')
              await interruptibleSleep(15_000)
              continue
            }
          }
          void runOne(row.id, log)
          continue // immediately look for more work up to the concurrency limit
        }
      } catch (err) {
        log(`worker loop error: ${(err as Error).message}`)
      }
      await interruptibleSleep(TICK_MS)
    }
  })()
}

/** Main-loop sleep that wake() can cut short (e.g. when a checkout is queued). */
function interruptibleSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const t = setTimeout(finish, ms)
    function finish() {
      if (wakeMainLoop === finish) wakeMainLoop = null
      clearTimeout(t)
      resolve()
    }
    wakeMainLoop = finish
  })
}

async function runOne(id: number, log: (msg: string) => void): Promise<void> {
  const row = getCheckout(id)
  if (!row || row.status !== 'queued') return
  updateCheckout(id, { status: 'transferring' })
  try {
    await transfer(row, log)
  } catch (err) {
    const fresh = getCheckout(id)
    if (!fresh) {
      // Cancelled: checkout row deleted mid-flight; clean up the partial.
      await rm(partialPath(id), { force: true })
      return
    }
    reachableUntil = 0 // failure may mean the primary just vanished; re-probe next pick
    const message = (err as Error).message
    const retries = fresh.retries + 1
    if (retries <= MAX_RETRIES) {
      const backoffMs = Math.min(120_000, 2 ** retries * 2000)
      log(`transfer #${id} failed (attempt ${retries}/${MAX_RETRIES}): ${message} — retry in ${backoffMs / 1000}s`)
      updateCheckout(id, { status: 'queued', retries, error: message, next_retry_at: Date.now() + backoffMs })
    } else {
      log(`transfer #${id} failed permanently: ${message}`)
      updateCheckout(id, { status: 'error', error: message })
    }
  }
}
