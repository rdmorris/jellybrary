// Tiny mock of the Jellyfin API surface Cloud Clone uses, for dev without a real server.
//   node tools/mock-jellyfin.mjs [port]   (default 8097; API key is "mock")
import http from 'node:http'

const PORT = Number(process.argv[2] ?? 8097)
const API_KEY = 'mock'
const CHUNK_DELAY_MS = Number(process.env.MOCK_CHUNK_DELAY ?? 15)

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

// Fake file size: 4-24 MB so transfers are fast but progress is observable.
const fakeSize = (name) => (4 + (hash(name) % 21)) * 1024 * 1024

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
  Path: `/library/movies/${name} (${1995 + (hash(name) % 30)})/${name.replaceAll(' ', '.')}.mkv`,
  MediaSources: [
    {
      Size: fakeSize(name),
      Container: 'mkv',
      Path: `/library/movies/${name} (${1995 + (hash(name) % 30)})/${name.replaceAll(' ', '.')}.mkv`,
    },
  ],
  UserData: { Played: hash(name) % 3 === 0 },
}))

const episodes = SERIES_NAMES.flatMap((seriesName, si) =>
  Array.from({ length: 2 }, (_, season) =>
    Array.from({ length: 4 }, (_, ep) => {
      const name = `${seriesName} S${season + 1}E${ep + 1}`
      return {
        Id: `ep-${si}-${season + 1}-${ep + 1}`,
        Name: `Episode ${ep + 1}`,
        Type: 'Episode',
        SeriesName: seriesName,
        SeriesId: `series-${si}`,
        ParentIndexNumber: season + 1,
        IndexNumber: ep + 1,
        ProductionYear: 2005 + (hash(seriesName) % 20),
        Path: `/library/shows/${seriesName}/Season ${String(season + 1).padStart(2, '0')}/${seriesName.replaceAll(' ', '.')}.S0${season + 1}E0${ep + 1}.mkv`,
        MediaSources: [{ Size: fakeSize(name), Container: 'mkv' }],
        UserData: { Played: false },
      }
    }),
  ).flat(),
)

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

const all = [...movies, ...series, ...episodes]

// Deterministic pseudo-random content so resumed downloads produce identical bytes.
function fileChunk(itemId, start, end) {
  const buf = Buffer.alloc(end - start)
  const seed = hash(itemId)
  for (let i = 0; i < buf.length; i++) buf[i] = (seed + start + i) % 256
  return buf
}

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
  const downloadMatch = url.pathname.match(/^\/Items\/([^/]+)\/Download$/)
  const episodesMatch = url.pathname.match(/^\/Shows\/([^/]+)\/Episodes$/)

  if (downloadMatch) {
    const item = all.find((i) => i.Id === downloadMatch[1])
    if (!item) return send(404, { error: 'not found' })
    const size = item.MediaSources[0].Size
    const range = req.headers.range?.match(/bytes=(\d+)-/)
    const start = range ? Number(range[1]) : 0
    const headers = {
      'content-type': 'video/x-matroska',
      'content-length': String(size - start),
      ...(range ? { 'content-range': `bytes ${start}-${size - 1}/${size}` } : {}),
    }
    res.writeHead(range ? 206 : 200, headers)
    // Stream in ~256KB chunks with tiny delays so progress is visible in the UI.
    let sent = start
    const pump = () => {
      if (sent >= size) return res.end()
      const end = Math.min(sent + 256 * 1024, size)
      res.write(fileChunk(item.Id, sent, end))
      sent = end
      setTimeout(pump, CHUNK_DELAY_MS)
    }
    return pump()
  }

  if (episodesMatch) {
    const eps = episodes.filter((e) => e.SeriesId === episodesMatch[1])
    return send(200, { Items: eps, TotalRecordCount: eps.length })
  }

  if (url.pathname === '/Library/Refresh') {
    console.log('mock: /Library/Refresh called')
    res.writeHead(204)
    return res.end()
  }

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
