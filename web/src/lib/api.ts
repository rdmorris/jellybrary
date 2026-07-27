export interface JellyfinItem {
  Id: string
  Name: string
  Type: string
  CollectionType?: string
  ProductionYear?: number
  RunTimeTicks?: number
  Overview?: string
  ImageTags?: Record<string, string>
  SeriesName?: string
  ParentIndexNumber?: number
  IndexNumber?: number
  ChildCount?: number
  RecursiveItemCount?: number
  MediaSources?: { Size?: number; Container?: string }[]
  UserData?: { Played?: boolean; UnplayedItemCount?: number }
  CommunityRating?: number
  OfficialRating?: string
  Genres?: string[]
}

export interface ItemsResult {
  Items: JellyfinItem[]
  TotalRecordCount: number
}

export interface Settings {
  'primary.url': string | null
  'primary.apiKey': string | null
  'primary.userId': string | null
  'mobile.url': string | null
  'mobile.apiKey': string | null
  'mobile.userId': string | null
  'mobile.moviesDir': string | null
  'mobile.showsDir': string | null
  'transfer.concurrency': string | null
  'transfer.minFreeGB': string | null
}

export interface SyncSummary {
  ranAt: string
  checked: number
  matched: number
  pushedPlayed: number
  pushedPosition: number
  errors: string[]
}

export interface TestResult {
  ok: boolean
  serverName?: string
  version?: string
  users?: { id: string; name: string; admin: boolean }[]
  error?: string
}

export interface Checkout {
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
  local_path: string | null
  error: string | null
  mobile_played: number
  mobile_position: number
  created_at: string
  updated_at: string
}

export interface CheckoutsResult {
  checkouts: Checkout[]
  checkedOutIds: string[]
}

export interface DeviceSpace {
  configured: boolean
  freeBytes?: number
  totalBytes?: number
}

export interface TranscodeProfile {
  label: string
  maxHeight: number
  videoBitRate: number
  audioBitRate: number
}

export function estimateBytes(spec: TranscodeProfile, runTimeTicks?: number): number {
  if (!runTimeTicks) return 0
  return Math.round(((spec.videoBitRate + spec.audioBitRate) / 8) * (runTimeTicks / 10_000_000))
}

export class ApiError extends Error {
  code: string

  constructor(message: string, code: string) {
    super(message)
    this.code = code
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new ApiError(data.message ?? data.error ?? `HTTP ${res.status}`, data.error ?? 'http_error')
  }
  return data as T
}

export const api = {
  settings: () => req<Settings>('GET', '/api/settings'),
  saveSettings: (patch: Partial<Settings>) => req<{ ok: true }>('PUT', '/api/settings', patch),
  testServer: (url: string, apiKey: string) =>
    req<TestResult>('POST', '/api/settings/test', { url, apiKey }),
  views: () => req<JellyfinItem[]>('GET', '/api/browse/views'),
  items: (params: Record<string, string | number | boolean | undefined>) => {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v))
    return req<ItemsResult>('GET', `/api/browse/items?${qs}`)
  },
  item: (id: string) => req<JellyfinItem>('GET', `/api/browse/items/${id}`),
  profiles: () => req<Record<string, TranscodeProfile>>('GET', '/api/profiles'),
  checkOut: (itemId: string, profile = 'original', mode = 'all', count?: number) =>
    req<{ queued: number; skipped: number }>('POST', '/api/checkouts', { itemId, profile, mode, count }),
  sync: () => req<SyncSummary>('POST', '/api/sync'),
  lastSync: () => req<SyncSummary | null>('GET', '/api/sync'),
  checkouts: () => req<CheckoutsResult>('GET', '/api/checkouts'),
  cancelCheckout: (id: number) => req<{ ok: true }>('DELETE', `/api/checkouts/${id}`),
  retryCheckout: (id: number) => req<{ ok: true }>('POST', `/api/checkouts/${id}/retry`),
  deviceSpace: () => req<DeviceSpace>('GET', '/api/device/space'),
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log2(bytes) / 10))
  const v = bytes / 2 ** (10 * i)
  return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[i]}`
}

export function imageUrl(item: JellyfinItem, maxWidth = 320): string | null {
  const tag = item.ImageTags?.Primary
  if (!tag) return null
  return `/api/image/${item.Id}?type=Primary&tag=${tag}&maxWidth=${maxWidth}`
}

export function runtime(ticks?: number): string {
  if (!ticks) return ''
  const mins = Math.round(ticks / 600_000_000)
  return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`
}

export function fileSize(item: JellyfinItem): string {
  const bytes = item.MediaSources?.[0]?.Size
  if (!bytes) return ''
  const gb = bytes / 1024 ** 3
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / 1024 ** 2).toFixed(0)} MB`
}
