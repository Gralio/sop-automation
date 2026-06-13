<script lang="ts">
  import type { SearchHit } from '$lib/server/queries';

  let { data } = $props();

  const hits = data.hits as SearchHit[];

  // Group hits by type, preserving the order types first appear.
  const groups = $derived.by(() => {
    const map = new Map<string, SearchHit[]>();
    for (const h of hits) {
      const arr = map.get(h.type) ?? [];
      arr.push(h);
      map.set(h.type, arr);
    }
    return [...map.entries()];
  });
</script>

<svelte:head><title>Search Results</title></svelte:head>

<h1 class="ns-title">Search Results</h1>
<div class="ns-subtitle">Query: <strong>{data.q}</strong></div>

{#if hits.length === 0}
  <div class="ns-banner">No results found.</div>
{:else}
  {#each groups as [type, items] (type)}
    <section class="ns-section">
      <h3>{type}</h3>
      <table class="ns-sublist">
        <tbody>
          {#each items as hit (hit.type + hit.id)}
            <tr class="line-row"><td><a href={hit.href}>{hit.label}</a></td></tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/each}
{/if}
