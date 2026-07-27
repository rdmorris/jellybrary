import { db } from './db.ts'

export interface CheckoutRow {
  id: number
  item_id: string
  kind: 'Movie' | 'Episode'
  title: string
  year: number | null
  series_name: string | null
  season: number | null
  episode: number | null
  profile: string
  status: 'queued' | 'transferring' | 'on_device' | 'error'
  bytes_total: number
  bytes_done: number
  source_name: string | null
  local_path: string | null
  error: string | null
  retries: number
  next_retry_at: number | null
  created_at: string
  updated_at: string
}

export interface NewCheckout {
  item_id: string
  kind: 'Movie' | 'Episode'
  title: string
  year?: number | null
  series_name?: string | null
  season?: number | null
  episode?: number | null
  bytes_total?: number
  source_name?: string | null
}

const insertStmt = db.prepare(`
  INSERT INTO checkouts (item_id, kind, title, year, series_name, season, episode, bytes_total, source_name)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(item_id) DO NOTHING
`)

export function addCheckout(c: NewCheckout): boolean {
  const res = insertStmt.run(
    c.item_id,
    c.kind,
    c.title,
    c.year ?? null,
    c.series_name ?? null,
    c.season ?? null,
    c.episode ?? null,
    c.bytes_total ?? 0,
    c.source_name ?? null,
  )
  return res.changes > 0
}

export function listCheckouts(statuses?: string[]): CheckoutRow[] {
  if (statuses?.length) {
    const marks = statuses.map(() => '?').join(',')
    return db
      .prepare(`SELECT * FROM checkouts WHERE status IN (${marks}) ORDER BY id`)
      .all(...statuses) as unknown as CheckoutRow[]
  }
  return db.prepare('SELECT * FROM checkouts ORDER BY id').all() as unknown as CheckoutRow[]
}

export function getCheckout(id: number): CheckoutRow | undefined {
  return db.prepare('SELECT * FROM checkouts WHERE id = ?').get(id) as CheckoutRow | undefined
}

export function checkedOutItemIds(): Set<string> {
  const rows = db.prepare('SELECT item_id FROM checkouts').all() as unknown as { item_id: string }[]
  return new Set(rows.map((r) => r.item_id))
}

export function updateCheckout(id: number, patch: Partial<CheckoutRow>): void {
  const keys = Object.keys(patch) as (keyof CheckoutRow)[]
  if (!keys.length) return
  const sets = keys.map((k) => `${String(k)} = ?`).join(', ')
  db.prepare(`UPDATE checkouts SET ${sets}, updated_at = datetime('now') WHERE id = ?`).run(
    ...keys.map((k) => patch[k] as never),
    id,
  )
}

export function deleteCheckout(id: number): void {
  db.prepare('DELETE FROM checkouts WHERE id = ?').run(id)
}

/** Next queued item, respecting the concurrency limit. */
export function nextQueued(maxActive: number): CheckoutRow | undefined {
  const active = (
    db.prepare(`SELECT COUNT(*) AS n FROM checkouts WHERE status = 'transferring'`).get() as { n: number }
  ).n
  if (active >= maxActive) return undefined
  return db
    .prepare(
      `SELECT * FROM checkouts
       WHERE status = 'queued' AND (next_retry_at IS NULL OR next_retry_at <= ?)
       ORDER BY id LIMIT 1`,
    )
    .get(Date.now()) as CheckoutRow | undefined
}
