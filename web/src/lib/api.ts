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
}

export interface TestResult {
  ok: boolean
  serverName?: string
  version?: string
  users?: { id: string; name: string; admin: boolean }[]
  error?: string
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
