<script lang="ts">
  import { api, formatBytes, type Checkout } from '../lib/api'

  let checkouts = $state<Checkout[]>([])
  let loaded = $state(false)
  // Speed estimation from successive polls: id → [bytes, timestamp]
  let lastSample = new Map<number, [number, number]>()
  let speeds = $state<Record<number, number>>({})

  $effect(() => {
    let stop = false
    async function poll() {
      while (!stop) {
        try {
          const res = await api.checkouts()
          const now = Date.now()
          const next: Record<number, number> = {}
          for (const c of res.checkouts) {
            if (c.status === 'transferring') {
              const prev = lastSample.get(c.id)
              if (prev && c.bytes_done > prev[0]) {
                next[c.id] = ((c.bytes_done - prev[0]) / (now - prev[1])) * 1000
              }
              lastSample.set(c.id, [c.bytes_done, now])
            } else {
              lastSample.delete(c.id)
            }
          }
          speeds = next
          checkouts = res.checkouts
          loaded = true
        } catch {
          /* server restarting; keep polling */
        }
        await new Promise((r) => setTimeout(r, 1500))
      }
    }
    void poll()
    return () => (stop = true)
  })

  const active = $derived(checkouts.filter((c) => c.status !== 'on_device'))

  function label(c: Checkout): string {
    if (c.kind === 'Episode' && c.series_name) {
      const se = `S${String(c.season ?? 0).padStart(2, '0')}E${String(c.episode ?? 0).padStart(2, '0')}`
      return `${c.series_name} ${se} · ${c.title}`
    }
    return c.year ? `${c.title} (${c.year})` : c.title
  }

  function pct(c: Checkout): number {
    return c.bytes_total > 0 ? Math.min(100, (c.bytes_done / c.bytes_total) * 100) : 0
  }

  function eta(c: Checkout): string {
    const speed = speeds[c.id]
    if (!speed || !c.bytes_total) return ''
    const secs = (c.bytes_total - c.bytes_done) / speed
    if (secs < 90) return `${Math.round(secs)}s left`
    if (secs < 5400) return `${Math.round(secs / 60)}m left`
    return `${(secs / 3600).toFixed(1)}h left`
  }

  async function cancel(c: Checkout) {
    await api.cancelCheckout(c.id)
    checkouts = checkouts.filter((x) => x.id !== c.id)
  }

  async function retry(c: Checkout) {
    await api.retryCheckout(c.id)
  }
</script>

<h1>Transfers</h1>

{#if !loaded}
  <p class="muted">Loading…</p>
{:else if active.length === 0}
  <div class="card empty">
    <p class="muted">No active transfers. Check something out from <a href="#/browse">Browse</a> —
    it will queue here and transfer whenever the primary server is reachable.</p>
  </div>
{:else}
  <div class="list">
    {#each active as c (c.id)}
      <div class="card row">
        <div class="info">
          <div class="title">{label(c)}</div>
          <div class="sub muted">
            {#if c.status === 'transferring'}
              {formatBytes(c.bytes_done)} of {formatBytes(c.bytes_total)}
              {#if speeds[c.id]}· {formatBytes(speeds[c.id])}/s · {eta(c)}{/if}
            {:else if c.status === 'queued'}
              Queued{c.bytes_total ? ` · ${formatBytes(c.bytes_total)}` : ''}
              {#if c.error}<span class="error-text"> · retrying after: {c.error}</span>{/if}
            {:else if c.status === 'error'}
              <span class="error-text">Failed: {c.error}</span>
            {/if}
          </div>
          {#if c.status === 'transferring'}
            <div class="bar"><div class="fill" style={`width:${pct(c)}%`}></div></div>
          {/if}
        </div>
        <div class="actions">
          {#if c.status === 'error'}
            <button onclick={() => retry(c)}>Retry</button>
          {/if}
          <button onclick={() => cancel(c)}>Cancel</button>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px 18px;
  }

  .info {
    flex: 1;
    min-width: 0;
  }

  .title {
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sub {
    font-size: 13px;
    margin: 2px 0 8px;
  }

  .bar {
    height: 6px;
    border-radius: 3px;
    background: var(--bg-hover);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    background: var(--accent);
    border-radius: 3px;
    transition: width 0.6s linear;
  }

  .actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .empty {
    text-align: center;
    padding: 40px;
  }
</style>
