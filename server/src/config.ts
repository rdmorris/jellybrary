import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export const DATA_DIR =
  process.env.JELLYBRARY_DATA ?? process.env.CLOUD_CLONE_DATA ?? path.join(repoRoot, 'data')
export const PORT = Number(process.env.JELLYBRARY_PORT ?? process.env.CLOUD_CLONE_PORT ?? 3131)
export const HOST = process.env.JELLYBRARY_HOST ?? process.env.CLOUD_CLONE_HOST ?? '0.0.0.0'
export const WEB_DIST = path.join(repoRoot, 'web/dist')

mkdirSync(DATA_DIR, { recursive: true })
