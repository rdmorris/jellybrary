import { DatabaseSync } from 'node:sqlite'
import { existsSync, renameSync } from 'node:fs'
import path from 'node:path'
import { DATA_DIR } from './config.ts'

const DB_PATH = path.join(DATA_DIR, 'jellybrary.db')
const LEGACY_DB_PATH = path.join(DATA_DIR, 'cloud-clone.db')
// Migrate databases created before the rename to Jellybrary. The DB runs in WAL mode,
// so checkpoint the legacy WAL into the main file first — renaming only the .db would
// orphan the -wal file and silently lose recent writes.
if (!existsSync(DB_PATH) && existsSync(LEGACY_DB_PATH)) {
  const legacy = new DatabaseSync(LEGACY_DB_PATH)
  legacy.exec('PRAGMA wal_checkpoint(TRUNCATE)')
  legacy.close()
  renameSync(LEGACY_DB_PATH, DB_PATH)
}

export const db = new DatabaseSync(DB_PATH)

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS checkouts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id     TEXT NOT NULL UNIQUE,
    kind        TEXT NOT NULL,             -- 'Movie' | 'Episode'
    title       TEXT NOT NULL,
    year        INTEGER,
    series_name TEXT,
    season      INTEGER,
    episode     INTEGER,
    profile     TEXT NOT NULL DEFAULT 'original',
    status      TEXT NOT NULL DEFAULT 'queued',  -- queued | transferring | on_device | error
    bytes_total INTEGER NOT NULL DEFAULT 0,
    bytes_done  INTEGER NOT NULL DEFAULT 0,
    source_name TEXT,                      -- original filename on the primary
    local_path  TEXT,
    error       TEXT,
    retries     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

// Lightweight migrations: add columns that older databases lack.
const checkoutCols = new Set(
  (db.prepare(`PRAGMA table_info(checkouts)`).all() as unknown as { name: string }[]).map((c) => c.name),
)
const addColumn = (name: string, ddl: string) => {
  if (!checkoutCols.has(name)) db.exec(`ALTER TABLE checkouts ADD COLUMN ${name} ${ddl}`)
}
addColumn('next_retry_at', 'INTEGER') // ms epoch; NULL = ready now
addColumn('provider_ids', 'TEXT') // JSON, e.g. {"Tmdb":"123","Imdb":"tt..."}
addColumn('mobile_played', 'INTEGER NOT NULL DEFAULT 0') // watch state observed on the mobile server
addColumn('mobile_position', 'INTEGER NOT NULL DEFAULT 0') // PlaybackPositionTicks on mobile
addColumn('synced_played', 'INTEGER NOT NULL DEFAULT 0') // last state pushed to the primary
addColumn('synced_position', 'INTEGER NOT NULL DEFAULT 0')

const getStmt = db.prepare('SELECT value FROM settings WHERE key = ?')
const setStmt = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
)
const delStmt = db.prepare('DELETE FROM settings WHERE key = ?')

export function getSetting(key: string): string | null {
  const row = getStmt.get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string | null): void {
  if (value === null || value === '') delStmt.run(key)
  else setStmt.run(key, value)
}
