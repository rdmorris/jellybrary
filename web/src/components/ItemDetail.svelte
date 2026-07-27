<script lang="ts">
  import {
    api,
    estimateBytes,
    fileSize,
    formatBytes,
    imageUrl,
    runtime,
    type JellyfinItem,
    type TranscodeProfile,
  } from '../lib/api'

  let { item, onclose }: { item: JellyfinItem; onclose: () => void } = $props()

  const poster = imageUrl(item, 480)

  let working = $state(false)
  let result = $state('')
  let profiles = $state<Record<string, TranscodeProfile>>({})
  let profile = $state('original')
  let scope = $state('all') // for series: all | unwatched | next5 | next10

  $effect(() => {
    api.profiles().then((p) => (profiles = p)).catch(() => {})
  })

  function optionLabel(name: string, spec?: TranscodeProfile): string {
    if (!spec) {
      const size = fileSize(item)
      return `Original${size ? ` (${size})` : ''}`
    }
    const est = estimateBytes(spec, item.RunTimeTicks)
    return `${spec.label}${est ? ` (~${formatBytes(est)})` : ''}`
  }

  async function checkOut() {
    working = true
    result = ''
    try {
      const mode = scope === 'all' ? 'all' : 'unwatched'
      const count = scope === 'next5' ? 5 : scope === 'next10' ? 10 : undefined
      const res = await api.checkOut(item.Id, profile, mode, count)
      if (res.queued === 0 && res.skipped > 0) result = 'Already checked out'
      else if (res.skipped > 0) result = `Queued ${res.queued} (${res.skipped} already on device)`
      else result = res.queued === 1 ? 'Queued ✓' : `Queued ${res.queued} episodes ✓`
    } catch (e) {
      result = `Failed: ${(e as Error).message}`
    } finally {
      working = false
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onclose()
  }
</script>

<svelte:window {onkeydown} />

<div class="backdrop" onclick={onclose} role="presentation">
  <div class="modal card" onclick={(e) => e.stopPropagation()} role="dialog" aria-label={item.Name}>
    <button class="close" onclick={onclose} aria-label="Close">✕</button>
    <div class="body">
      <div class="art">
        {#if poster}
          <img src={poster} alt={item.Name} />
        {/if}
      </div>
      <div class="info">
        <h2>{item.Name}</h2>
        <p class="muted sub">
          {[
            item.ProductionYear,
            item.Type === 'Movie' ? runtime(item.RunTimeTicks) : null,
            item.Type === 'Series' && item.RecursiveItemCount ? `${item.RecursiveItemCount} episodes` : null,
            item.OfficialRating,
            item.CommunityRating ? `★ ${item.CommunityRating.toFixed(1)}` : null,
            fileSize(item),
          ]
            .filter(Boolean)
            .join('  ·  ')}
        </p>
        {#if item.Genres?.length}
          <p class="muted genres">{item.Genres.join(', ')}</p>
        {/if}
        {#if item.Overview}
          <p class="overview">{item.Overview}</p>
        {/if}
        <div class="actions">
          {#if item.Type === 'Series' || item.Type === 'Season'}
            <select class="profile" bind:value={scope} title="Which episodes to check out">
              <option value="all">All episodes</option>
              <option value="unwatched">All unwatched</option>
              <option value="next5">Next 5 unwatched</option>
              <option value="next10">Next 10 unwatched</option>
            </select>
          {/if}
          <select class="profile" bind:value={profile} title="Quality — transcodes run on the primary server">
            <option value="original">{optionLabel('original')}</option>
            {#each Object.entries(profiles) as [name, spec] (name)}
              <option value={name}>{optionLabel(name, spec)}</option>
            {/each}
          </select>
          <button class="primary" disabled={working} onclick={checkOut}>
            {working ? 'Queuing…' : item.Type === 'Series' ? '⬇ Check out series' : '⬇ Check out'}
          </button>
          {#if result}
            <span class={result.startsWith('Failed') ? 'error-text' : 'ok-text'}>{result}</span>
          {/if}
        </div>
        {#if profile !== 'original'}
          <p class="muted"><small>Transcoded by the primary server{item.Type === 'Series' ? '; estimates vary per episode' : ''}. Not resumable — interrupted transfers restart.</small></p>
        {/if}
        {#if item.Type === 'Series'}
          <p class="muted"><small>Queues every episode. Season/episode selection is coming later.</small></p>
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    background: rgba(4, 8, 16, 0.75);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    z-index: 50;
  }

  .modal {
    position: relative;
    max-width: 720px;
    width: 100%;
    max-height: 85vh;
    overflow-y: auto;
  }

  .close {
    position: absolute;
    top: 12px;
    right: 12px;
    padding: 4px 10px;
  }

  .body {
    display: flex;
    gap: 24px;
  }

  .art {
    flex: 0 0 200px;
  }

  .art img {
    width: 100%;
    border-radius: var(--radius);
    display: block;
  }

  .info {
    flex: 1;
    min-width: 0;
  }

  h2 {
    margin: 0 0 6px;
    padding-right: 36px;
  }

  .sub {
    margin: 0 0 4px;
    font-size: 13px;
  }

  .genres {
    margin: 0 0 12px;
    font-size: 13px;
  }

  .overview {
    font-size: 14px;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: 18px;
    flex-wrap: wrap;
  }

  .profile {
    width: auto;
  }

  @media (max-width: 560px) {
    .body {
      flex-direction: column;
    }

    .art {
      flex-basis: auto;
      max-width: 200px;
    }
  }
</style>
