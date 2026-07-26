import type { FastifyInstance } from 'fastify'
import { JellyfinError } from '../jellyfin.ts'
import { primaryContext } from '../servers.ts'

function requirePrimary(reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
  const ctx = primaryContext()
  if (!ctx) {
    reply.code(409).send({ error: 'not_configured', message: 'Primary server is not configured yet' })
    return null
  }
  return ctx
}

export function browseRoutes(app: FastifyInstance) {
  app.setErrorHandler((err: unknown, _req, reply) => {
    if (err instanceof JellyfinError) {
      return reply.code(502).send({ error: 'jellyfin_unreachable', message: err.message })
    }
    app.log.error(err)
    const message = err instanceof Error ? err.message : String(err)
    return reply.code(500).send({ error: 'internal', message })
  })

  app.get('/api/browse/views', async (req, reply) => {
    const ctx = requirePrimary(reply)
    if (!ctx) return
    const views = await ctx.client.views(ctx.userId)
    return views.filter((v) => ['movies', 'tvshows'].includes(v.CollectionType ?? ''))
  })

  app.get<{
    Querystring: {
      parentId?: string
      search?: string
      types?: string
      recursive?: string
      sortBy?: string
      sortOrder?: string
      start?: string
      limit?: string
    }
  }>('/api/browse/items', async (req, reply) => {
    const ctx = requirePrimary(reply)
    if (!ctx) return
    const q = req.query
    return ctx.client.items({
      userId: ctx.userId,
      parentId: q.parentId,
      searchTerm: q.search,
      includeItemTypes: q.types ?? (q.search ? 'Movie,Series' : undefined),
      recursive: q.recursive ? q.recursive === 'true' : Boolean(q.search) || undefined,
      sortBy: q.sortBy,
      sortOrder: q.sortOrder,
      startIndex: q.start ? Number(q.start) : undefined,
      limit: q.limit ? Number(q.limit) : undefined,
    })
  })

  app.get<{ Params: { id: string } }>('/api/browse/items/:id', async (req, reply) => {
    const ctx = requirePrimary(reply)
    if (!ctx) return
    return ctx.client.item(ctx.userId, req.params.id)
  })

  // Poster/backdrop proxy so the browser never needs the Jellyfin API key.
  app.get<{
    Params: { id: string }
    Querystring: { type?: string; tag?: string; maxWidth?: string }
  }>('/api/image/:id', async (req, reply) => {
    const ctx = requirePrimary(reply)
    if (!ctx) return
    const { type, tag, maxWidth } = req.query
    const res = await ctx.client.image(req.params.id, type ?? 'Primary', {
      tag,
      maxWidth: maxWidth ? Number(maxWidth) : 400,
    })
    reply
      .header('content-type', res.headers.get('content-type') ?? 'image/jpeg')
      .header('cache-control', 'public, max-age=86400')
    return reply.send(Buffer.from(await res.arrayBuffer()))
  })
}
