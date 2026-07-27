<script lang="ts">
  import { api, type TestResult } from '../lib/api'

  interface ServerForm {
    url: string
    apiKey: string
    testing: boolean
    saving: boolean
    test: TestResult | null
    saved: boolean
  }

  function emptyForm(): ServerForm {
    return { url: '', apiKey: '', testing: false, saving: false, test: null, saved: false }
  }

  let primary = $state<ServerForm>(emptyForm())
  let mobile = $state<ServerForm>(emptyForm())
  let primaryUserId = $state('')
  let mobileUserId = $state('')
  let moviesDir = $state('')
  let showsDir = $state('')
  let minFreeGB = $state('2')
  let pathsSaving = $state(false)
  let pathsSaved = $state(false)
  let loading = $state(true)
  let loadError = $state('')

  $effect(() => {
    api
      .settings()
      .then((s) => {
        primary.url = s['primary.url'] ?? ''
        primary.apiKey = s['primary.apiKey'] ?? ''
        primaryUserId = s['primary.userId'] ?? ''
        mobile.url = s['mobile.url'] ?? ''
        mobile.apiKey = s['mobile.apiKey'] ?? ''
        mobileUserId = s['mobile.userId'] ?? ''
        moviesDir = s['mobile.moviesDir'] ?? ''
        showsDir = s['mobile.showsDir'] ?? ''
        minFreeGB = s['transfer.minFreeGB'] ?? '2'
        loading = false
      })
      .catch((e) => {
        loadError = e.message
        loading = false
      })
  })

  async function test(form: ServerForm) {
    form.testing = true
    form.test = null
    try {
      form.test = await api.testServer(form.url.trim(), form.apiKey.trim())
    } catch (e) {
      form.test = { ok: false, error: (e as Error).message }
    } finally {
      form.testing = false
    }
  }

  async function savePrimary() {
    primary.saving = true
    primary.saved = false
    try {
      await api.saveSettings({
        'primary.url': primary.url.trim() || null,
        'primary.apiKey': primary.apiKey.trim() || null,
        'primary.userId': primaryUserId || null,
      })
      primary.saved = true
    } finally {
      primary.saving = false
    }
  }

  async function savePaths() {
    pathsSaving = true
    pathsSaved = false
    try {
      await api.saveSettings({
        'mobile.moviesDir': moviesDir.trim() || null,
        'mobile.showsDir': showsDir.trim() || null,
        'transfer.minFreeGB': minFreeGB.trim() || null,
      })
      pathsSaved = true
    } finally {
      pathsSaving = false
    }
  }

  async function saveMobile() {
    mobile.saving = true
    mobile.saved = false
    try {
      await api.saveSettings({
        'mobile.url': mobile.url.trim() || null,
        'mobile.apiKey': mobile.apiKey.trim() || null,
        'mobile.userId': mobileUserId || null,
      })
      mobile.saved = true
    } finally {
      mobile.saving = false
    }
  }
</script>

<h1>Settings</h1>

{#if loading}
  <p class="muted">Loading…</p>
{:else if loadError}
  <p class="error-text">Failed to load settings: {loadError}</p>
{:else}
  <div class="grid">
    <section class="card">
      <h2>Primary server <span class="muted">(home)</span></h2>
      <p class="muted">
        The Jellyfin server you check media out <em>from</em>. Create an API key under
        Dashboard → API Keys.
      </p>
      <label>
        Server URL
        <input type="url" bind:value={primary.url} placeholder="http://192.168.1.10:8096" />
      </label>
      <label>
        API key
        <input type="password" bind:value={primary.apiKey} placeholder="Jellyfin API key" />
      </label>

      <div class="row">
        <button onclick={() => test(primary)} disabled={primary.testing || !primary.url || !primary.apiKey}>
          {primary.testing ? 'Testing…' : 'Test connection'}
        </button>
        {#if primary.test?.ok}
          <span class="ok-text">✓ {primary.test.serverName} (Jellyfin {primary.test.version})</span>
        {:else if primary.test}
          <span class="error-text">✗ {primary.test.error}</span>
        {/if}
      </div>

      {#if primary.test?.ok && primary.test.users?.length}
        <label>
          Browse as user
          <select bind:value={primaryUserId}>
            <option value="" disabled>Select a user…</option>
            {#each primary.test.users as u (u.id)}
              <option value={u.id}>{u.name}{u.admin ? ' (admin)' : ''}</option>
            {/each}
          </select>
        </label>
      {/if}

      <div class="row">
        <button
          class="primary"
          onclick={savePrimary}
          disabled={primary.saving || !primary.url || !primary.apiKey || !primaryUserId}
        >
          {primary.saving ? 'Saving…' : 'Save primary'}
        </button>
        {#if primary.saved}<span class="ok-text">Saved ✓</span>{/if}
      </div>
      {#if !primaryUserId}
        <p class="muted"><small>Test the connection, then pick a user to enable saving.</small></p>
      {/if}
    </section>

    <section class="card">
      <h2>Mobile server <span class="muted">(truck / RV)</span></h2>
      <p class="muted">
        The Jellyfin server media gets checked out <em>to</em>. Optional for now — needed once
        transfers land in milestone 2.
      </p>
      <label>
        Server URL
        <input type="url" bind:value={mobile.url} placeholder="http://localhost:8096" />
      </label>
      <label>
        API key
        <input type="password" bind:value={mobile.apiKey} placeholder="Jellyfin API key" />
      </label>

      <div class="row">
        <button onclick={() => test(mobile)} disabled={mobile.testing || !mobile.url || !mobile.apiKey}>
          {mobile.testing ? 'Testing…' : 'Test connection'}
        </button>
        {#if mobile.test?.ok}
          <span class="ok-text">✓ {mobile.test.serverName} (Jellyfin {mobile.test.version})</span>
        {:else if mobile.test}
          <span class="error-text">✗ {mobile.test.error}</span>
        {/if}
      </div>

      {#if mobile.test?.ok && mobile.test.users?.length}
        <label>
          Watch-state user <span class="muted">(whose viewing gets synced home)</span>
          <select bind:value={mobileUserId}>
            <option value="">Not set — skip watch-state sync</option>
            {#each mobile.test.users as u (u.id)}
              <option value={u.id}>{u.name}{u.admin ? ' (admin)' : ''}</option>
            {/each}
          </select>
        </label>
      {/if}

      <div class="row">
        <button class="primary" onclick={saveMobile} disabled={mobile.saving}>
          {mobile.saving ? 'Saving…' : 'Save mobile'}
        </button>
        {#if mobile.saved}<span class="ok-text">Saved ✓</span>{/if}
      </div>
    </section>

    <section class="card">
      <h2>Library paths <span class="muted">(where checkouts land)</span></h2>
      <p class="muted">
        Folders on <em>this</em> machine that the mobile Jellyfin watches. Checked-out media is
        placed here with Jellyfin naming (<code>Title (Year)/…</code>, <code>Show/Season 01/…</code>).
      </p>
      <label>
        Movies folder
        <input type="text" bind:value={moviesDir} placeholder="/media/movies" />
      </label>
      <label>
        Shows folder
        <input type="text" bind:value={showsDir} placeholder="/media/shows" />
      </label>
      <label>
        Keep at least this much disk free (GB)
        <input type="number" min="0" bind:value={minFreeGB} placeholder="2" />
      </label>
      <div class="row">
        <button class="primary" onclick={savePaths} disabled={pathsSaving}>
          {pathsSaving ? 'Saving…' : 'Save paths'}
        </button>
        {#if pathsSaved}<span class="ok-text">Saved ✓</span>{/if}
      </div>
    </section>
  </div>
{/if}

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
    gap: 20px;
  }

  h2 {
    margin-top: 0;
  }

  label {
    display: block;
    margin: 14px 0;
    color: var(--text-dim);
    font-size: 13px;
  }

  label input,
  label select {
    margin-top: 6px;
    font-size: 15px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 14px 0 0;
    flex-wrap: wrap;
  }
</style>
