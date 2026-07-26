// Tiny mock of the Jellyfin API surface Cloud Clone uses, for dev without a real server.
//   node tools/mock-jellyfin.mjs [port]   (default 8097; API key is "mock")
import http from 'node:http'

const PORT = Number(process.argv[2] ?? 8097)
const API_KEY = 'mock'

const GENRES = ['Action', 'Drama', 'Comedy', 'Sci-Fi', 'Thriller', 'Documentary', 'Adventure']

const MOVIE_NAMES = [
  'The Long Haul', 'Desert Static', 'Northbound', 'Signal Lost', 'Ridge Runner',
  'Two-Lane Sky', 'The Waypoint', 'Idle Hours', 'Black Mesa Morning', 'Gravel & Grit',
  'The Last Campground', 'Solar Flare', 'Off the Grid', 'Mile Marker Zero', 'Canyon Echo',
  'The Overlander', 'Storm Cell', 'Dry County', 'High Desert Drifter', 'The Switchback',
  'Cold Start', 'Boondock Nights', 'The Detour', 'Freewheeling', 'Starlink Down',
  'Range Anxiety', 'The Pull-Through', 'Wanderlust Protocol', 'Dust Devil', 'The Honey Wagon',
]

const SERIES_NAMES = [
  'Parked', 'Truck Stop Confidential', 'The Dispersed', 'Watts & Volts',
  'Roadhouse Rules', 'Deadhead Miles', 'The Full Hookup', 'Winter Texans',
  'Ham Radio Heroes', 'Grey Water',
]

function hash(s) {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0
  return Math.abs(h)
}

const movies = MOVIE_NAMES.map((name, i) => ({
  Id: `movie-${i}`,
  Name: name,
  Type: 'Movie',
  ProductionYear: 1995 + (hash(name) % 30),
  RunTimeTicks: (80 + (hash(name) % 70)) * 60 * 10_000_000,
  Overview: `${name} (mock) — a perfectly serviceable film about ${GENRES[hash(name) % GENRES.length].toLowerCase()} things, ideal for a night off-grid.`,
  Genres: [GENRES[hash(name) % GENRES.length], GENRES[(hash(name) + 3) % GENRES.length]],
  CommunityRating: 5 + (hash(name) % 45) / 10,
  OfficialRating: ['G', 'PG', 'PG-13', 'R'][hash(name) % 4],
  ImageTags: { Primary: `tag${i}` },
  ProviderIds: { Tmdb: String(100000 + i) },
  MediaSources: [{ Size: (2 + (hash(name) % 30)) * 1024 ** 3 / 2, Container: 'mkv' }],
  UserData: { Played: hash(name) % 3 === 0 },
}))

const series = SERIES_NAMES.map((name, i) => ({
  Id: `series-${i}`,
  Name: name,
  Type: 'Series',
  ProductionYear: 2005 + (hash(name) % 20),
  Overview: `${name} (mock) — the acclaimed series everyone at the campground is talking about.`,
  Genres: [GENRES[hash(name) % GENRES.length]],
  CommunityRating: 6 + (hash(name) % 35) / 10,
  OfficialRating: 'TV-14',
  ImageTags: { Primary: `tag-s${i}` },
  ProviderIds: { Tvdb: String(200000 + i) },
  ChildCount: 2 + (hash(name) % 4),
  RecursiveItemCount: 12 + (hash(name) % 40),
  UserData: { Played: false, UnplayedItemCount: 5 + (hash(name) % 20) },
}))

const views = [
  { Id: 'lib-movies', Name: 'Movies', Type: 'CollectionFolder', CollectionType: 'movies' },
  { Id: 'lib-shows', Name: 'Shows', Type: 'CollectionFolder', CollectionType: 'tvshows' },
]

const all = [...movies, ...series]

const xmlEscape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function poster(item) {
  const hue = hash(item.Name) % 360
  const words = xmlEscape(item.Name).split(' ')
  const lines = words.length > 2
    ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')]
    : [xmlEscape(item.Name)]
  const text = lines
    .map((l, i) => `<text x="150" y="${210 + i * 34}" font-size="26" font-family="Georgia" fill="#fff" text-anchor="middle">${l}</text>`)
    .join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},45%,32%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},50%,16%)"/>
    </linearGradient></defs>
    <rect width="300" height="450" fill="url(#g)"/>
    <circle cx="150" cy="120" r="46" fill="hsla(0,0%,100%,0.15)"/>
    ${text}
    <text x="150" y="420" font-size="15" font-family="Georgia" fill="hsla(0,0%,100%,0.55)" text-anchor="middle">${item.ProductionYear ?? ''}</text>
  </svg>`
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  const q = url.searchParams
  const send = (code, body, type = 'application/json') => {
    res.writeHead(code, { 'content-type': type })
    res.end(type === 'application/json' ? JSON.stringify(body) : body)
  }

  const auth = (req.headers.authorization ?? '') + (req.headers['x-emby-token'] ?? '')
  if (!auth.includes(API_KEY)) return send(401, { error: 'Unauthorized' })

  const imageMatch = url.pathname.match(/^\/Items\/([^/]+)\/Images\//)
  const itemMatch = url.pathname.match(/^\/Users\/[^/]+\/Items\/([^/]+)$/)

  if (url.pathname === '/System/Info') {
    return send(200, { ServerName: 'Mock Primary', Version: '10.10.0', Id: 'mock-server-1' })
  }
  if (url.pathname === '/Users') {
    return send(200, [
      { Id: 'user-roger', Name: 'roger', Policy: { IsAdministrator: true } },
      { Id: 'user-guest', Name: 'guest', Policy: { IsAdministrator: false } },
    ])
  }
  if (url.pathname === '/UserViews') {
    return send(200, { Items: views, TotalRecordCount: views.length })
  }
  if (url.pathname === '/Items') {
    let items = all
    const parentId = q.get('parentId')
    if (parentId === 'lib-movies') items = movies
    else if (parentId === 'lib-shows') items = series
    const types = q.get('includeItemTypes')
    if (types) items = items.filter((i) => types.split(',').includes(i.Type))
    const term = q.get('searchTerm')?.toLowerCase()
    if (term) items = items.filter((i) => i.Name.toLowerCase().includes(term))
    items = [...items].sort((a, b) => a.Name.localeCompare(b.Name))
    const start = Number(q.get('startIndex') ?? 0)
    const limit = Number(q.get('limit') ?? 60)
    return send(200, { Items: items.slice(start, start + limit), TotalRecordCount: items.length })
  }
  if (itemMatch) {
    const item = all.find((i) => i.Id === itemMatch[1])
    return item ? send(200, item) : send(404, { error: 'not found' })
  }
  if (imageMatch) {
    const item = all.find((i) => i.Id === imageMatch[1])
    if (!item) return send(404, { error: 'not found' })
    return send(200, poster(item), 'image/svg+xml')
  }
  return send(404, { error: `no mock for ${url.pathname}` })
})

server.listen(PORT, () => console.log(`Mock Jellyfin on http://localhost:${PORT} (API key: "${API_KEY}")`))
