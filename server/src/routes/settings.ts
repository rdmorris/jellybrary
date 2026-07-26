import type { FastifyInstance } from 'fastify'
import { getSetting, setSetting } from '../db.ts'
import { JellyfinClient, JellyfinError } from '../jellyfin.ts'
import { SETTING_KEYS } from '../servers.ts'

export function settingsRoutes(app: FastifyInstance) {
  app.get('/api/settings', async () => {
    const out: Record<string, string | null> = {}
    for (const key of SETTING_KEYS) out[key] = getSetting(key)
    return out
  })

  app.put<{ Body: Record<string, string | null> }>('/api/settings', async (req, reply) => {
    const allowed = new Set<string>(SETTING_KEYS)
    for (const [key, value] of Object.entries(req.body ?? {})) {
      if (!allowed.has(key)) {
        return reply.code(400).send({ error: `unknown setting: ${key}` })
      }
      setSetting(key, value)
    }
    return { ok: true }
  })

  // Test a connection with as-yet-unsaved credentials; returns server info + users
  // so the UI can offer a user picker for the primary.
  app.post<{ Body: { url?: string; apiKey?: string } }>('/api/settings/test', async (req, reply) => {
    const { url, apiKey } = req.body ?? {}
    if (!url || !apiKey) return reply.code(400).send({ error: 'url and apiKey are required' })
    const jf = new JellyfinClient(url, apiKey)
    try {
      const info = await jf.systemInfo()
      const users = await jf.users()
      return {
        ok: true,
        serverName: info.ServerName,
        version: info.Version,
        users: users.map((u) => ({ id: u.Id, name: u.Name, admin: u.Policy?.IsAdministrator ?? false })),
      }
    } catch (err) {
      if (err instanceof JellyfinError) {
        const hint = err.status === 401 ? 'API key rejected' : err.message
        return reply.code(502).send({ ok: false, error: hint })
      }
      throw err
    }
  })
}
