<script lang="ts">
  import Browse from './pages/Browse.svelte'
  import OnDevice from './pages/OnDevice.svelte'
  import Settings from './pages/Settings.svelte'
  import Transfers from './pages/Transfers.svelte'

  type Page = 'browse' | 'transfers' | 'device' | 'settings'

  function pageFromHash(): Page {
    const h = location.hash.replace(/^#\/?/, '')
    return (['browse', 'transfers', 'device', 'settings'].includes(h) ? h : 'browse') as Page
  }

  let page = $state<Page>(pageFromHash())

  $effect(() => {
    const onHash = () => (page = pageFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  })

  const tabs: { id: Page; label: string }[] = [
    { id: 'browse', label: 'Browse' },
    { id: 'transfers', label: 'Transfers' },
    { id: 'device', label: 'On Device' },
    { id: 'settings', label: 'Settings' },
  ]
</script>

<header>
  <a class="brand" href="#/browse">
    <img src="/favicon.svg" alt="" width="26" height="26" />
    <span>Cloud Clone</span>
  </a>
  <nav>
    {#each tabs as tab (tab.id)}
      <a href={`#/${tab.id}`} class:active={page === tab.id}>{tab.label}</a>
    {/each}
  </nav>
</header>

<main>
  {#if page === 'browse'}
    <Browse />
  {:else if page === 'transfers'}
    <Transfers />
  {:else if page === 'device'}
    <OnDevice />
  {:else}
    <Settings />
  {/if}
</main>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 28px;
    padding: 14px 24px;
    border-bottom: 1px solid var(--border);
    background: var(--bg-raised);
    position: sticky;
    top: 0;
    z-index: 10;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 700;
    font-size: 17px;
    color: var(--text);
    text-decoration: none;
  }

  nav {
    display: flex;
    gap: 6px;
  }

  nav a {
    color: var(--text-dim);
    text-decoration: none;
    padding: 6px 14px;
    border-radius: 8px;
  }

  nav a:hover {
    color: var(--text);
    background: var(--bg-hover);
  }

  nav a.active {
    color: var(--text);
    background: var(--bg-hover);
  }

  main {
    max-width: 1280px;
    margin: 0 auto;
    padding: 24px;
  }
</style>
