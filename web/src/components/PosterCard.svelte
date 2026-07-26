<script lang="ts">
  import { imageUrl, type JellyfinItem } from '../lib/api'

  let { item, onclick }: { item: JellyfinItem; onclick: () => void } = $props()

  const poster = imageUrl(item, 320)
</script>

<button class="poster-card" {onclick} title={item.Name}>
  <div class="poster">
    {#if poster}
      <img src={poster} alt={item.Name} loading="lazy" />
    {:else}
      <div class="no-art">{item.Name}</div>
    {/if}
    {#if item.UserData?.Played}
      <span class="badge played" title="Watched">✓</span>
    {/if}
  </div>
  <div class="meta">
    <div class="name">{item.Name}</div>
    <div class="sub muted">
      {item.ProductionYear ?? ''}
      {#if item.Type === 'Series' && item.RecursiveItemCount}
        · {item.RecursiveItemCount} eps
      {/if}
    </div>
  </div>
</button>

<style>
  .poster-card {
    all: unset;
    cursor: pointer;
    display: block;
  }

  .poster {
    position: relative;
    aspect-ratio: 2 / 3;
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    transition: transform 0.12s ease, border-color 0.12s ease;
  }

  .poster-card:hover .poster,
  .poster-card:focus-visible .poster {
    transform: scale(1.03);
    border-color: var(--accent);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .no-art {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 12px;
    text-align: center;
    color: var(--text-dim);
    font-size: 13px;
  }

  .badge.played {
    position: absolute;
    top: 8px;
    right: 8px;
    background: var(--accent-strong);
    color: #04131f;
    border-radius: 999px;
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
  }

  .meta {
    padding: 8px 2px 0;
  }

  .name {
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sub {
    font-size: 12px;
  }
</style>
