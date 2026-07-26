# Cloud Clone

Library-checkout for Jellyfin: browse your primary (home) server, check media out to a
secondary mobile Jellyfin server (truck/RV) for off-grid use, and return it when done.
See [PLAN.md](PLAN.md) for the full design.

**Status: milestone 1** — browse the primary library (poster grid, search, detail view)
and configure both servers. Checkout/transfers land in milestone 2.

## Requirements

- Node ≥ 22.13 (uses built-in `node:sqlite` and native TypeScript execution)
- A Jellyfin server + API key (Dashboard → API Keys)

## Run (dev)

```sh
npm install
npm run dev        # API on :3131, web UI on :5173
```

Open http://localhost:5173, go to Settings, enter your primary server URL + API key,
test the connection, pick a user, save.

No Jellyfin handy? Run the mock: `node tools/mock-jellyfin.mjs` (URL
`http://localhost:8097`, API key `mock`).

## Run (production-ish)

```sh
npm run build      # builds web/dist, typechecks server
npm start          # serves API + built UI on :3131
```

Config lives in `data/cloud-clone.db` (SQLite). Env vars: `CLOUD_CLONE_PORT`,
`CLOUD_CLONE_HOST`, `CLOUD_CLONE_DATA`.

## Layout

- `server/` — Fastify API: settings, Jellyfin proxy (browse, images)
- `web/` — Svelte 5 + Vite single-page UI
- `tools/mock-jellyfin.mjs` — tiny fake Jellyfin for development
