<script lang="ts">
  let { data } = $props();

  const LEVELS = ['1_Wholesale', '3_Gold', '4_Platinum', '10_Retail'];
  const QTYS = ['0', '5', '50'];

  const existing = data.priceLevels as Record<string, Record<string, number>>;

  // Nested editable structure: prices[level][qty] -> string (input value).
  // Prefilled from item.priceLevels; fallback to basePrice for the 0 break,
  // else ''.
  function initPrices(): Record<string, Record<string, string>> {
    const out: Record<string, Record<string, string>> = {};
    for (const lvl of LEVELS) {
      out[lvl] = {};
      for (const q of QTYS) {
        const v = existing[lvl]?.[q];
        if (v !== undefined) out[lvl][q] = String(v);
        else if (q === '0') out[lvl][q] = String(data.basePrice);
        else out[lvl][q] = '';
      }
    }
    return out;
  }

  let prices = $state<Record<string, Record<string, string>>>(initPrices());

  let toast = $state<{ kind: 'err' | 'ok'; msg: string } | null>(null);
  let busy = $state(false);
  let showActions = $state(false);
  let showConfirm = $state(false);
  const formToken = crypto.randomUUID();

  // Convert the string grid into the numeric, sparse priceLevels payload.
  function buildPayload(): Record<string, Record<string, number>> {
    const out: Record<string, Record<string, number>> = {};
    for (const lvl of LEVELS) {
      const table: Record<string, number> = {};
      for (const q of QTYS) {
        const raw = prices[lvl]?.[q];
        if (raw !== undefined && raw !== '') table[q] = Number(raw);
      }
      if (Object.keys(table).length > 0) out[lvl] = table;
    }
    return out;
  }

  async function postPricing(matrix: boolean) {
    const res = await fetch(`/api/items/${encodeURIComponent(data.sku)}/pricing`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ formToken, priceLevels: buildPayload(), matrix }),
    });
    return res.json();
  }

  async function save() {
    busy = true;
    toast = null;
    try {
      const out = await postPricing(false);
      if (!out.ok) {
        toast = { kind: 'err', msg: out.error ?? 'Save failed.' };
        return;
      }
      toast = { kind: 'ok', msg: 'Saved.' };
    } catch (e) {
      toast = { kind: 'err', msg: (e as Error).message };
    } finally {
      busy = false;
    }
  }

  async function updateMatrix() {
    showActions = false;
    busy = true;
    toast = null;
    try {
      const out = await postPricing(true);
      if (!out.ok) {
        toast = { kind: 'err', msg: out.error ?? 'Update failed.' };
        return;
      }
      showConfirm = true;
    } catch (e) {
      toast = { kind: 'err', msg: (e as Error).message };
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Edit — {data.display}</title></svelte:head>

<h1 class="ns-title">Edit <span class="ns-muted">{data.display}</span></h1>

<div class="ns-toolbar">
  <button class="ns-btn primary" name="save" onclick={save} disabled={busy}>Save</button>
  <div style="position:relative; display:inline-block">
    <button
      class="ns-btn"
      name="actions"
      onclick={() => (showActions = !showActions)}
      disabled={busy}>Actions ▾</button
    >
    {#if showActions}
      <div class="ns-suggest" style="min-width:160px">
        <div class="row" role="button" tabindex="0" onclick={updateMatrix}>
          <span>Update Matrix</span>
        </div>
      </div>
    {/if}
  </div>
  <button class="ns-btn" name="cancel" onclick={() => history.back()}>Cancel</button>
</div>

{#if data.isMatrix}
  <div class="ns-banner">This is a matrix item — use Actions ▸ Update Matrix to save pricing.</div>
{/if}

<section class="ns-section">
  <h3>Sales / Pricing</h3>
  <table class="ns-sublist">
    <thead>
      <tr>
        <th>Price Level</th>
        {#each QTYS as q (q)}<th style="width:120px">Qty {q}</th>{/each}
      </tr>
    </thead>
    <tbody>
      {#each LEVELS as lvl (lvl)}
        <tr class="line-row">
          <td>{lvl}</td>
          {#each QTYS as q (q)}
            <td>
              <input
                class="ns-input"
                name="price_{lvl}_{q}"
                type="number"
                step="0.0001"
                bind:value={prices[lvl][q]}
                onfocus={(e) => e.currentTarget.select()}
              />
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</section>

{#if showConfirm}
  <div class="ns-modal-overlay">
    <div class="ns-modal">
      <h4>Confirmation</h4>
      <div class="msg">Mass Update Performed</div>
      <div class="actions">
        <button class="ns-btn primary" name="ok" onclick={() => (showConfirm = false)}>OK</button>
      </div>
    </div>
  </div>
{/if}

{#if toast}
  <div
    class="ns-toast {toast.kind === 'ok' ? 'ok' : ''}"
    role="alert"
    onclick={() => (toast = null)}
  >
    {toast.msg}
  </div>
{/if}
