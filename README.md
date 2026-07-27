# Jellybrary

A bookmobile for your Jellyfin server: browse your primary (home) server, check media
out to a secondary mobile Jellyfin server (truck/RV) for off-grid use, and return it
when done. See [PLAN.md](PLAN.md) for the full design.

*Jellybrary is a community project, not affiliated with or endorsed by the
[Jellyfin](https://jellyfin.org) project.*

![Browsing the primary library in Jellybrary](docs/screenshot-browse.png)
*(shown with the bundled mock library — your real posters appear with a real server)*

**Status: milestone 4 — feature complete for v0.1.** Browse the primary library; check
out movies, whole series, or the **next N unwatched episodes** at original quality or
as a 1080p/720p HEVC transcode (with size estimates); watch transfers with
progress/resume; and return items — individually, per show, or **everything you've
watched** in one click. **Watch-state sync** pushes played status and resume positions
from the mobile server back to the primary (matched by provider IDs, filename
fallback), so Continue Watching survives a trip; it runs every 10 minutes and on
demand. A **disk-space floor** (default 2 GB, Settings → Library paths) keeps
transfers from filling the truck drive. Set the Library paths and a mobile
watch-state user in Settings to enable everything.

Transcodes are performed by the *primary* Jellyfin server via its stream API, using
whatever hardware acceleration it has configured (Dashboard → Playback). Enable
"Allow encoding in HEVC format" there, or Jellyfin will fall back to H.264. Transcode
transfers are not resumable — an interrupted one restarts from zero.

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

## Run (Docker — the intended deployment)

Jellybrary runs on the **mobile** machine — a truck/RV server, or just a laptop you
travel with. Two compose files, pick one:

- **Already run Jellyfin on that machine?** Use [docker-compose.yml](docker-compose.yml)
  — Jellybrary only. Mount your Jellyfin library folder and point the Settings paths
  at it.

  ```sh
  docker compose up -d --build   # UI + API on :3131
  ```

- **Fresh machine, no Jellyfin yet?** Use
  [docker-compose.with-jellyfin.yml](docker-compose.with-jellyfin.yml) — brings up
  Jellyfin (linuxserver.io image) and Jellybrary together with a shared `./media`
  folder, pre-wired so the library paths match in both containers. First-run steps are
  in the file's header comment.

  ```sh
  docker compose -f docker-compose.with-jellyfin.yml up -d --build
  ```

Settings persist in `./data` (bind-mounted to `/data`). Both containers run as
uid 1000, so make sure `./data` and `./media` are writable by that uid.

## Run (production-ish, no Docker)

```sh
npm run build      # builds web/dist, typechecks server
npm start          # serves API + built UI on :3131
```

Config lives in `data/jellybrary.db` (SQLite). Env vars: `JELLYBRARY_PORT`,
`JELLYBRARY_HOST`, `JELLYBRARY_DATA`.

## Layout

- `server/` — Fastify API: settings, Jellyfin proxy (browse, images)
- `web/` — Svelte 5 + Vite single-page UI
- `tools/mock-jellyfin.mjs` — tiny fake Jellyfin for development
