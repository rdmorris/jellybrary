import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'
import { HOST, PORT, WEB_DIST } from './config.ts'
import { settingsRoutes } from './routes/settings.ts'
import { browseRoutes } from './routes/browse.ts'
import { transferRoutes } from './routes/transfers.ts'
import { startWorker } from './worker.ts'

const app = Fastify({ logger: { level: 'info' } })

app.get('/api/health', async () => ({ ok: true, name: 'jellybrary', version: '0.1.0' }))

settingsRoutes(app)
browseRoutes(app)
transferRoutes(app)

startWorker((msg) => app.log.info(msg))

// In production the built Svelte app is served from web/dist; in dev, Vite serves it.
if (existsSync(WEB_DIST)) {
  await app.register(fastifyStatic, { root: WEB_DIST })
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not_found' })
    return reply.sendFile('index.html')
  })
}

await app.listen({ port: PORT, host: HOST })
