<script lang="ts">
  import { api, formatBytes, type Checkout, type DeviceSpace } from '../lib/api'

  let checkouts = $state<Checkout[]>([])
  let space = $state<DeviceSpace | null>(null)
  let loaded = $state(false)
  let returning = $state<Set<number>>(new Set())

  async function refresh() {
    const [res, sp] = await Promise.all([api.checkouts(), api.deviceSpace()])
    checkouts = res.checkouts
    space = sp
    loaded = true
  }

  $effect(() => {
    void refresh()
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

<h1>On Device</h1>

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
              <div class="title">{c.title}{c.year ? ` (${c.year})` : ''}</div>
              <div class="sub muted">{formatBytes(c.bytes_total)} · {c.local_path}</div>
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
              <div class="title">{epLabel(c)}</div>
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
