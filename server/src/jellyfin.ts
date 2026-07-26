// Minimal Jellyfin HTTP API client — just the surface Cloud Clone needs.

export interface JellyfinSystemInfo {
  ServerName: string
  Version: string
  Id: string
}

export interface JellyfinUser {
  Id: string
  Name: string
  Policy?: { IsAdministrator?: boolean }
}

export interface JellyfinItem {
  Id: string
  Name: string
  Type: string // 'Movie' | 'Series' | 'Season' | 'Episode' | 'CollectionFolder' | ...
  CollectionType?: string // 'movies' | 'tvshows' | ...
  ProductionYear?: number
  RunTimeTicks?: number
  Overview?: string
  ImageTags?: Record<string, string>
  BackdropImageTags?: string[]
  SeriesName?: string
  SeriesId?: string
  ParentIndexNumber?: number
  IndexNumber?: number
  ChildCount?: number
  RecursiveItemCount?: number
  ProviderIds?: Record<string, string>
  MediaSources?: { Size?: number; Container?: string }[]
  UserData?: { Played?: boolean; PlaybackPositionTicks?: number; UnplayedItemCount?: number }
  CommunityRating?: number
  OfficialRating?: string
  Genres?: string[]
}

export interface JellyfinItemsResult {
  Items: JellyfinItem[]
  TotalRecordCount: number
}

export class JellyfinError extends Error {
  status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.status = status
  }
}

export class JellyfinClient {
  private baseUrl: string
  private apiKey: string

  constructor(url: string, apiKey: string) {
    this.baseUrl = url.replace(/\/+$/, '')
    this.apiKey = apiKey
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `MediaBrowser Client="CloudClone", Device="CloudClone", DeviceId="cloud-clone", Version="0.1.0", Token="${this.apiKey}"`,
    }
  }

  private async request(pathname: string, params?: Record<string, string | number | boolean | undefined>): Promise<Response> {
    const url = new URL(this.baseUrl + pathname)
    for (const [k, v] of Object.entries(params ?? {})) {
      if (v !== undefined) url.searchParams.set(k, String(v))
    }
    let res: Response
    try {
      res = await fetch(url, { headers: this.headers(), signal: AbortSignal.timeout(15_000) })
    } catch (err) {
      throw new JellyfinError(`Cannot reach Jellyfin at ${this.baseUrl}: ${(err as Error).message}`)
    }
    if (!res.ok) {
      throw new JellyfinError(`Jellyfin returned ${res.status} for ${pathname}`, res.status)
    }
    return res
  }

  private async getJson<T>(pathname: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    return (await this.request(pathname, params)).json() as Promise<T>
  }

  systemInfo(): Promise<JellyfinSystemInfo> {
    return this.getJson('/System/Info')
  }

  users(): Promise<JellyfinUser[]> {
    return this.getJson('/Users')
  }

  /** Top-level library views (Movies, Shows, ...) for a user. */
  async views(userId: string): Promise<JellyfinItem[]> {
    const res = await this.getJson<JellyfinItemsResult>('/UserViews', { userId })
    return res.Items
  }

  items(opts: {
    userId: string
    parentId?: string
    includeItemTypes?: string
    searchTerm?: string
    recursive?: boolean
    sortBy?: string
    sortOrder?: string
    startIndex?: number
    limit?: number
  }): Promise<JellyfinItemsResult> {
    return this.getJson('/Items', {
      userId: opts.userId,
      parentId: opts.parentId,
      includeItemTypes: opts.includeItemTypes,
      searchTerm: opts.searchTerm,
      recursive: opts.recursive,
      sortBy: opts.sortBy ?? 'SortName',
      sortOrder: opts.sortOrder ?? 'Ascending',
      startIndex: opts.startIndex ?? 0,
      limit: opts.limit ?? 60,
      fields: 'PrimaryImageAspectRatio,ProductionYear,Overview,ProviderIds,MediaSources,ChildCount,RecursiveItemCount',
      imageTypeLimit: 1,
      enableImageTypes: 'Primary,Backdrop',
    })
  }

  item(userId: string, itemId: string): Promise<JellyfinItem> {
    return this.getJson(`/Users/${userId}/Items/${itemId}`)
  }

  /** Raw image response, for proxying to the browser without exposing the API key. */
  image(itemId: string, type: string, params: { tag?: string; maxWidth?: number }): Promise<Response> {
    return this.request(`/Items/${itemId}/Images/${type}`, {
      tag: params.tag,
      maxWidth: params.maxWidth,
      quality: 90,
    })
  }
}
