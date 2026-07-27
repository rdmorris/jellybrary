# Jellybrary — Design & Implementation Plan

A "library checkout" system for media. Browse your primary Jellyfin library, check out
movies/shows to a secondary mobile Jellyfin server (truck/RV), watch off-grid, return
items to free space. Think Netflix downloads, but server-to-server and self-hosted.

## Deployment picture

```
 HOME                                      TRUCK / RV
┌──────────────────────────┐              ┌──────────────────────────────┐
│ Primary Jellyfin server  │   home LAN   │ Mobile server                │
│  - media library         │◄────────────►│  - Jellyfin (mobile library) │
│  - Jellyfin HTTP API     │  (when       │  - Jellybrary service  ◄────┼── web UI
│  - (no new software!)    │   parked)    │  - SQLite state              │
└──────────────────────────┘              └──────────────────────────────┘
```

**Key decision: Jellybrary runs only on the mobile server.** Nothing is installed on
the primary — everything it needs (browse, metadata, images, file download, and even
server-side transcoding) is available through the standard Jellyfin HTTP API. The mobile
node *pulls* when the primary is reachable, which is naturally correct for a vehicle
that comes and goes: transfers start when you park at home and resume where they left
off. Tailscale/VPN later requires zero code changes — it's just another route to the
primary.

## Core concepts

- **Checkout** — a request to place an item (movie, series, season, or episode range) on
  the mobile server, at a chosen quality profile.
- **Profile** — `original` (byte-for-byte copy) or a transcode preset (e.g.
  `1080p H.265`, `720p H.265`). Transcoding is done **by the primary Jellyfin server**
  via its stream API, so the (likely weaker) truck box never burns CPU on it.
- **Return** — delete the local copy, rescan the mobile library, free the space.
  Optionally push watch progress back to the primary first.

## How transfers work

- **Original quality:** `GET /Items/{id}/Download` from the primary, with HTTP `Range`
  resume support, saved to a temp dir, then moved into the mobile library with proper
  Jellyfin naming (`Movies/Title (Year)/…`, `Shows/Series/Season 01/…`) and a library
  scan is triggered on the mobile Jellyfin.
- **Transcoded:** request `GET /Videos/{id}/stream.mkv?videoCodec=hevc&maxHeight=1080…`
  — the primary transcodes server-side and we save the stream to disk. Not resumable
  mid-file (it's a live transcode), so on interruption the item restarts; fine for a
  parked-overnight workflow.
- Reachability probe on an interval; the transfer worker only runs while the primary
  answers. Configurable concurrency (default 2) and retry with backoff.
- Integrity: verify final size for originals; record source item ID + profile so we
  never re-download something already on device.

## Watch-state sync (the road-trip killer feature)

When back on the home LAN, reconcile playback between the two servers: anything watched
(or partially watched) on the truck gets its played status / resume position pushed to
the primary, so Continue Watching stays coherent. Items are matched by provider IDs
(TMDB/IMDB/TVDB) with filename fallback.

## Web UI (served by the Jellybrary service)

1. **Browse** — the primary library with posters, search, and filters, via the Jellyfin
   API. Badges show what's already checked out. Series pages support "whole series /
   season / next N unwatched" checkout.
2. **Transfers** — queue with per-item progress, speed, ETA, pause/cancel, reorder.
3. **On Device** — everything currently checked out, sizes, watched indicators,
   one-click Return (and "Return all watched").
4. **Settings** — server URLs + API keys, library paths, profiles, concurrency,
   disk-space floor.

A persistent header shows mobile disk usage and a "queue exceeds free space" warning
before you commit to a big checkout.

## Data model (SQLite)

- `checkouts` — id, jellyfin_item_id, kind (movie/episode), title, series/season info,
  profile, status (`queued → transferring → on_device → returning`), bytes_total,
  bytes_done, local_path, provider_ids (JSON), checked_out_at, error.
- `settings` — key/value (server URLs, API keys, paths, profiles).
- `sync_log` — watch-state reconciliation history.

## Stack

- **Runtime:** Node 24 + TypeScript (native type stripping — no build step for the
  server), single service, Docker Compose for the truck box.
- **API server:** Fastify. **Frontend:** Svelte 5 + Vite SPA, served by Fastify in prod.
- **DB:** built-in `node:sqlite` (no native modules, single file, trivial backup).
- **Jellyfin client:** small hand-rolled fetch client (`server/src/jellyfin.ts`).
- **Testing:** mock Jellyfin server (`tools/mock-jellyfin.mjs`) with Range-aware
  downloads and tunable stream speed.

## Milestones

1. ✅ **Skeleton + browse** — monorepo layout, config, connect to both Jellyfin servers
   with API keys, Browse UI over the primary library. *Proves the API integration.*
2. ✅ **Checkout + transfer (originals)** — queue, resumable downloads, correct library
   placement, mobile rescan, Return. *This is the usable MVP.*
3. ✅ **Transcode profiles** — profile picker, stream-transcode transfers, size estimates.
4. ✅ **Watch-state sync + polish** — reconciliation on reconnect, next-N-unwatched
   checkout, disk-space guard, "return all watched".

All four shipped 2026-07-26. Post-v0.1 ideas: web UI auth, checkout badges in Browse,
transfer scheduling/bandwidth limits, multi-select checkout.

## Distribution

Self-hosted open source, shipped as a Docker image (compose file in the repo, runs on
the mobile server). A hosted/SaaS control plane on Vercel was considered and rejected:
media transfers must stay direct between the user's own servers, and keeping API keys
on the user's hardware is a better security story than any cloud can offer.

## Open questions

- Auth for the web UI: probably a single shared password (it lives on a private LAN),
  unless you want Jellyfin-account login.
- Mobile server hardware/OS — affects Docker vs. bare-metal install docs, and whether
  H.265 playback is safe as the default transcode target for your truck clients.
- Where the mobile Jellyfin's library folders live (path Jellybrary writes into) —
  needs to be a volume both containers can see if everything is Dockerized.
