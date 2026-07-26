import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { DATA_DIR } from './config.ts'

export const db = new DatabaseSync(path.join(DATA_DIR, 'cloud-clone.db'))

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`)

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
