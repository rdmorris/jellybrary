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
] as const

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
