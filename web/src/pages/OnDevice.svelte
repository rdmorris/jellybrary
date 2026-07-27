<script lang="ts">
  import { api, formatBytes, type Checkout, type DeviceSpace, type SyncSummary } from '../lib/api'

  let checkouts = $state<Checkout[]>([])
  let space = $state<DeviceSpace | null>(null)
  let loaded = $state(false)
  let returning = $state<Set<number>>(new Set())
  let syncing = $state(false)
  let lastSync = $state<SyncSummary | null>(null)

  async function runSync() {
    syncing = true
    try {
      lastSync = await api.sync()
      await refresh()
    } catch (e) {
      lastSync = {
        ranAt: new Date().toISOString(),
        checked: 0,
        matched: 0,
        pushedPlayed: 0,
        pushedPosition: 0,
        errors: [(e as Error).message],
      }
    } finally {
      syncing = false
    }
  }

  function syncLabel(s: SyncSummary): string {
    if (s.errors.length) return `Sync issues: ${s.errors[0]}`
    const parts = []
    if (s.pushedPlayed) parts.push(`${s.pushedPlayed} marked watched on primary`)
    if (s.pushedPosition) parts.push(`${s.pushedPosition} resume positions pushed`)
    return parts.length ? parts.join(', ') : `Up to date (${s.matched} of ${s.checked} matched)`
  }

  async function refresh() {
    const [res, sp] = await Promise.all([api.checkouts(), api.deviceSpace()])
    checkouts = res.checkouts
    space = sp
    loaded = true
  }

  $effect(() => {
    void refresh()
    api.lastSync().then((s) => (lastSync = s)).catch(() => {})
  })

  const onDevice = $derived(checkouts.filter((c) => c.status === 'on_device'))
  const movies = $derived(onDevice.filter((c) => c.kind === 'Movie'))
  const episodes = $derived(onDevice.filter((c) => c.kind === 'Episode'))
  const shows = $derived(
    [...new Set(episodes.map((e) => e.series_name ?? 'Unknown'))].map((name) => ({
      name,
      eps: episodes.filter((e) => (e.series_name ?? 'Unknown') === name),
    })),
  )
  const totalBytes = $derived(onDevice.reduce((sum, c) => sum + (c.bytes_total || 0), 0))
  const watched = $derived(onDevice.filter((c) => c.mobile_played))
  const usedPct = $derived(
    space?.configured && space.totalBytes ? (1 - (space.freeBytes ?? 0) / space.totalBytes) * 100 : 0,
  )

  async function giveBack(ids: number[]) {
    returning = new Set([...returning, ...ids])
    try {
      for (const id of ids) await api.cancelCheckout(id)
    } finally {
      returning = new Set([...returning].filter((id) => !ids.includes(id)))
      await refresh()
    }
  }

  function epLabel(c: Checkout): string {
    return `S${String(c.season ?? 0).padStart(2, '0')}E${String(c.episode ?? 0).padStart(2, '0')} · ${c.title}`
  }
</script>

<h1>
  On Device
  <span class="toolbar">
    <button onclick={runSync} disabled={syncing}>{syncing ? 'Syncing…' : '⟳ Sync watched'}</button>
    {#if watched.length}
      <button
        disabled={watched.some((c) => returning.has(c.id))}
        onclick={() => giveBack(watched.map((c) => c.id))}
      >
        Return all watched ({watched.length})
      </button>
    {/if}
  </span>
</h1>
{#if lastSync}
  <p class="muted sync-note">{syncLabel(lastSync)}</p>
{/if}

{#if !loaded}
  <p class="muted">Loading…</p>
{:else}
  {#if space?.configured}
    <div class="card meter-card">
      <div class="meter-line">
        <span>{formatBytes(space.freeBytes ?? 0)} free of {formatBytes(space.totalBytes ?? 0)}</span>
        <span class="muted">{onDevice.length} items checked out · {formatBytes(totalBytes)}</span>
      </div>
      <div class="bar"><div class="fill" style={`width:${usedPct}%`}></div></div>
    </div>
  {/if}

  {#if onDevice.length === 0}
    <div class="card empty">
      <p class="muted">Nothing on the mobile server yet. Completed checkouts appear here.</p>
    </div>
  {:else}
    {#if movies.length}
      <h2>Movies</h2>
      <div class="list">
        {#each movies as c (c.id)}
          <div class="card row">
            <div class="info">
              <div class="title">
                {c.title}{c.year ? ` (${c.year})` : ''}
                {#if c.mobile_played}<span class="watched" title="Watched on the road">✓ watched</span>{/if}
              </div>
              <div class="sub muted">
                {formatBytes(c.bytes_total)}{c.profile !== 'original' ? ` · ${c.profile}` : ''} · {c.local_path}
              </div>
            </div>
            <button disabled={returning.has(c.id)} onclick={() => giveBack([c.id])}>
              {returning.has(c.id) ? 'Returning…' : 'Return'}
            </button>
          </div>
        {/each}
      </div>
    {/if}

    {#each shows as show (show.name)}
      <h2>
        {show.name}
        <button
          class="return-all"
          disabled={show.eps.some((e) => returning.has(e.id))}
          onclick={() => giveBack(show.eps.map((e) => e.id))}
        >
          Return all {show.eps.length}
        </button>
      </h2>
      <div class="list">
        {#each show.eps as c (c.id)}
          <div class="card row">
            <div class="info">
              <div class="title">
                {epLabel(c)}
                {#if c.mobile_played}<span class="watched" title="Watched on the road">✓ watched</span>{/if}
              </div>
              <div class="sub muted">{formatBytes(c.bytes_total)}</div>
            </div>
            <button disabled={returning.has(c.id)} onclick={() => giveBack([c.id])}>
              {returning.has(c.id) ? 'Returning…' : 'Return'}
            </button>
          </div>
        {/each}
      </div>
    {/each}
  {/if}
{/if}

<style>
  h1 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  .toolbar {
    display: flex;
    gap: 10px;
  }

  .toolbar button {
    font-size: 14px;
  }

  .sync-note {
    font-size: 13px;
    margin: -8px 0 16px;
  }

  .watched {
    font-size: 11px;
    color: var(--ok);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 1px 8px;
    margin-left: 8px;
    vertical-align: 2px;
  }

  .meter-card {
    padding: 14px 18px;
    margin-bottom: 20px;
  }

  .meter-line {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    margin-bottom: 8px;
    flex-wrap: wrap;
    gap: 6px;
  }

  .bar {
    height: 8px;
    border-radius: 4px;
    background: var(--bg-hover);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: var(--accent-strong);
  }

  h2 {
    display: flex;
    align-items: center;
    gap: 14px;
    font-size: 17px;
    margin: 24px 0 10px;
  }

  .return-all {
    font-size: 12px;
    padding: 4px 10px;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 18px;
  }

  .info {
    flex: 1;
    min-width: 0;
  }

  .title {
    font-weight: 600;
  }

  .sub {
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .empty {
    text-align: center;
    padding: 40px;
  }
</style>
