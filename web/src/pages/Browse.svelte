<script lang="ts">
  import { api, ApiError, type ItemsResult, type JellyfinItem } from '../lib/api'
  import PosterCard from '../components/PosterCard.svelte'
  import ItemDetail from '../components/ItemDetail.svelte'

  const PAGE_SIZE = 60

  let views = $state<JellyfinItem[]>([])
  let activeViewId = $state('')
  let items = $state<JellyfinItem[]>([])
  let total = $state(0)
  let search = $state('')
  let loading = $state(true)
  let loadingMore = $state(false)
  let notConfigured = $state(false)
  let error = $state('')
  let selected = $state<JellyfinItem | null>(null)

  let searchTimer: ReturnType<typeof setTimeout> | undefined

  $effect(() => {
    api
      .views()
      .then((v) => {
        views = v
        if (v.length) activeViewId = v[0].Id
        else {
          loading = false
          error = 'No movie or show libraries found on the primary server.'
        }
      })
      .catch((e) => {
        loading = false
        if (e instanceof ApiError && e.code === 'not_configured') notConfigured = true
        else error = e.message
      })
  })

  // Reload the grid whenever the active library or (debounced) search changes.
  $effect(() => {
    if (!activeViewId && !search.trim()) return
    const viewId = activeViewId
    const term = search.trim()
    clearTimeout(searchTimer)
    searchTimer = setTimeout(() => void load(viewId, term), term ? 300 : 0)
  })

  function queryParams(viewId: string, term: string) {
    return term
      ? { search: term, recursive: true, limit: PAGE_SIZE }
      : { parentId: viewId, recursive: true, types: typesFor(viewId), limit: PAGE_SIZE }
  }

  async function load(viewId: string, term: string) {
    loading = true
    error = ''
    try {
      const res: ItemsResult = await api.items(queryParams(viewId, term))
      items = res.Items
      total = res.TotalRecordCount
    } catch (e) {
      error = (e as Error).message
      items = []
      total = 0
    } finally {
      loading = false
    }
  }

  async function loadMore() {
    loadingMore = true
    try {
      const res = await api.items({ ...queryParams(activeViewId, search.trim()), start: items.length })
      items = [...items, ...res.Items]
      total = res.TotalRecordCount
    } catch (e) {
      error = (e as Error).message
    } finally {
      loadingMore = false
    }
  }

  function typesFor(viewId: string): string | undefined {
    const view = views.find((v) => v.Id === viewId)
    if (view?.CollectionType === 'movies') return 'Movie'
    if (view?.CollectionType === 'tvshows') return 'Series'
    return undefined
  }
</script>

{#if notConfigured}
  <div class="card empty">
    <h2>Welcome to Jellybrary</h2>
    <p class="muted">
      Connect your primary Jellyfin server to start browsing your library, then check media out to
      your mobile server for the road.
    </p>
    <a href="#/settings"><button class="primary">Set up servers</button></a>
  </div>
{:else}
  <div class="toolbar">
    <div class="tabs">
      {#each views as view (view.Id)}
        <button
          class:active={activeViewId === view.Id && !search.trim()}
          onclick={() => {
            search = ''
            activeViewId = view.Id
          }}
        >
          {view.Name}
        </button>
      {/each}
    </div>
    <input class="search" type="search" bind:value={search} placeholder="Search movies & shows…" />
  </div>

  {#if error}
    <p class="error-text">{error}</p>
  {:else if loading}
    <div class="grid">
      {#each Array(12) as _, i (i)}
        <div class="skeleton"></div>
      {/each}
    </div>
  {:else if items.length === 0}
    <p class="muted center">Nothing found{search ? ` for “${search}”` : ''}.</p>
  {:else}
    <p class="muted count">{total.toLocaleString()} items</p>
    <div class="grid">
      {#each items as item (item.Id)}
        <PosterCard {item} onclick={() => (selected = item)} />
      {/each}
    </div>
    {#if items.length < total}
      <div class="center">
        <button onclick={loadMore} disabled={loadingMore}>
          {loadingMore ? 'Loading…' : `Load more (${items.length} of ${total.toLocaleString()})`}
        </button>
      </div>
    {/if}
  {/if}
{/if}

{#if selected}
  <ItemDetail item={selected} onclose={() => (selected = null)} />
{/if}

<style>
  .toolbar {
    display: flex;
    gap: 16px;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .tabs {
    display: flex;
    gap: 8px;
  }

  .tabs button.active {
    border-color: var(--accent);
    color: var(--accent);
  }

  .search {
    max-width: 320px;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 18px;
  }

  .skeleton {
    aspect-ratio: 2 / 3;
    border-radius: var(--radius);
    background: linear-gradient(110deg, var(--bg-raised) 40%, var(--bg-hover) 50%, var(--bg-raised) 60%);
    background-size: 200% 100%;
    animation: shimmer 1.4s infinite;
  }

  @keyframes shimmer {
    to {
      background-position-x: -200%;
    }
  }

  .center {
    text-align: center;
    margin: 24px 0;
  }

  .count {
    font-size: 13px;
    margin: 0 0 12px;
  }

  .empty {
    max-width: 520px;
    margin: 80px auto;
    text-align: center;
    padding: 48px 32px;
  }
</style>
