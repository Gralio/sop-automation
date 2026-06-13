<script lang="ts">
  import '$lib/styles/netsuite.css';
  import { goto } from '$app/navigation';

  let { children } = $props();

  const TABS = [
    'Activities',
    'Apex/ProActive',
    'SPS Commerce',
    'Leads',
    'Opportunities',
    'Customers',
    'Forecast',
    'Reports',
    'Analytics',
    'Documents',
    'Setup',
    'Lookups',
    'Support',
  ];

  type Hit = { type: string; id: string; label: string; href: string };

  let q = $state('');
  let hits = $state<Hit[]>([]);
  let open = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  function onInput() {
    clearTimeout(timer);
    const term = q;
    if (term.trim().length < 2) {
      hits = [];
      open = false;
      return;
    }
    timer = setTimeout(async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
      const data = await res.json();
      hits = data.hits ?? [];
      open = true;
    }, 200);
  }

  function submit() {
    open = false;
    if (q.trim()) goto(`/search?q=${encodeURIComponent(q)}`);
  }

  function pick(h: Hit) {
    open = false;
    q = '';
    hits = [];
    goto(h.href);
  }
</script>

<div class="ns-oracle">
  <span><b>ORACLE</b> NetSuite</span>
  <span>apex-erp.internal</span>
</div>

<header class="ns-header">
  <a class="ns-logo" href="/">APEX</a>
  <div class="ns-search">
    <input
      type="text"
      placeholder="Search"
      aria-label="Global Search"
      bind:value={q}
      oninput={onInput}
      onkeydown={(e) => e.key === 'Enter' && submit()}
      onfocus={() => (open = hits.length > 0)}
    />
    {#if open && hits.length > 0}
      <div class="ns-suggest">
        {#each hits.slice(0, 7) as h (h.type + h.id)}
          <div class="row" onclick={() => pick(h)} role="button" tabindex="0">
            <span class="kind">{h.type}</span>
            <span>{h.label}</span>
          </div>
        {/each}
        {#if hits.length > 7}
          <div class="more" onclick={submit} role="button" tabindex="0">
            Show all {hits.length} results
          </div>
        {/if}
      </div>
    {/if}
  </div>
  <div class="ns-user">
    <div class="name">John Olufor</div>
    <div>Apex Construction Supply • Customer Service</div>
  </div>
</header>

<nav class="ns-nav">
  {#each TABS as t (t)}
    <a class="ns-tab" href="/">{t}</a>
  {/each}
</nav>

<main class="ns-body">
  {@render children()}
</main>
