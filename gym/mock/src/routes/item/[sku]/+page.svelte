<script lang="ts">
  import { goto } from '$app/navigation';

  let { data } = $props();

  const priceLevels = data.priceLevels as Record<string, Record<string, number>>;
  const available = data.available as Record<string, number>;

  const levelNames = Object.keys(priceLevels);
  const locations = Object.keys(available);

  // Union of qty breakpoints across all present price levels, sorted ascending.
  const qtyBreaks = $derived(
    [...new Set(levelNames.flatMap((lvl) => Object.keys(priceLevels[lvl] ?? {})))]
      .map(Number)
      .sort((a, b) => a - b)
      .map(String),
  );

  function edit() {
    goto(`/item/${encodeURIComponent(data.sku)}/edit`);
  }
</script>

<svelte:head><title>{data.display}</title></svelte:head>

<h1 class="ns-title">{data.display}</h1>

<div class="ns-toolbar">
  <button class="ns-btn primary" name="edit" onclick={edit}>Edit</button>
</div>

<section class="ns-section">
  <h3>Primary Information</h3>
  <div class="ns-kv">
    <span class="k">SKU</span><span>{data.sku}</span>
    <span class="k">Name</span><span>{data.name}</span>
    <span class="k">Base Price</span><span>{data.basePrice.toFixed(2)}</span>
    <span class="k">Matrix?</span><span>{data.isMatrix ? 'yes' : 'no'}</span>
  </div>
</section>

<section class="ns-section">
  <h3>Availability</h3>
  <div class="ns-kv">
    {#each locations as loc (loc)}
      <span class="k">{loc}</span><span>{available[loc]}</span>
    {/each}
  </div>
</section>

<section class="ns-section">
  <h3>Sales / Pricing</h3>
  <table class="ns-sublist">
    <thead>
      <tr>
        <th>Price Level</th>
        {#each qtyBreaks as q (q)}<th style="width:100px">Qty {q}</th>{/each}
      </tr>
    </thead>
    <tbody>
      {#each levelNames as lvl (lvl)}
        <tr class="line-row">
          <td>{lvl}</td>
          {#each qtyBreaks as q (q)}
            <td>{priceLevels[lvl]?.[q] !== undefined ? priceLevels[lvl][q].toFixed(4) : ''}</td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</section>
