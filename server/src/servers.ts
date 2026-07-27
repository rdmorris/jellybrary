// Access to the two configured Jellyfin servers ("primary" at home, "mobile" in the truck).
import { getSetting } from './db.ts'
import { JellyfinClient } from './jellyfin.ts'

export type ServerKey = 'primary' | 'mobile'

export const SETTING_KEYS = [
  'primary.url',
  'primary.apiKey',
  'primary.userId',
  'mobile.url',
  'mobile.apiKey',
  'mobile.userId',
  'mobile.moviesDir',
  'mobile.showsDir',
  'transfer.concurrency',
  'transfer.minFreeGB',
] as const

export function libraryDirs() {
  return {
    moviesDir: getSetting('mobile.moviesDir'),
    showsDir: getSetting('mobile.showsDir'),
  }
}

export function transferConcurrency(): number {
  const n = Number(getSetting('transfer.concurrency') ?? 2)
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 8) : 2
}

export function serverConfig(key: ServerKey) {
  return {
    url: getSetting(`${key}.url`),
    apiKey: getSetting(`${key}.apiKey`),
    userId: getSetting(`${key}.userId`),
  }
}

/** Client for a configured server, or null if it isn't configured yet. */
export function client(key: ServerKey): JellyfinClient | null {
  const cfg = serverConfig(key)
  if (!cfg.url || !cfg.apiKey) return null
  return new JellyfinClient(cfg.url, cfg.apiKey)
}

export function primaryContext(): { client: JellyfinClient; userId: string } | null {
  const cfg = serverConfig('primary')
  if (!cfg.url || !cfg.apiKey || !cfg.userId) return null
  return { client: new JellyfinClient(cfg.url, cfg.apiKey), userId: cfg.userId }
}

export function mobileContext(): { client: JellyfinClient; userId: string } | null {
  const cfg = serverConfig('mobile')
  if (!cfg.url || !cfg.apiKey || !cfg.userId) return null
  return { client: new JellyfinClient(cfg.url, cfg.apiKey), userId: cfg.userId }
}

export function minFreeBytes(): number {
  const gb = Number(getSetting('transfer.minFreeGB') ?? 2)
  return (Number.isFinite(gb) && gb >= 0 ? gb : 2) * 1024 ** 3
}
