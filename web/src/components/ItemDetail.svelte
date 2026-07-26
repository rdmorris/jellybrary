<script lang="ts">
  import { fileSize, imageUrl, runtime, type JellyfinItem } from '../lib/api'

  let { item, onclose }: { item: JellyfinItem; onclose: () => void } = $props()

  const poster = imageUrl(item, 480)

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
          <button class="primary" disabled title="Checkout lands in milestone 2">
            ⬇ Check out
          </button>
          <span class="muted"><small>Checkout arrives in milestone 2</small></span>
        </div>
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
