<script lang="ts">
  import { goto } from '$app/navigation';
  import { RETURN_REASONS, RETURN_TYPES } from '$lib/vocab';

  let { data } = $props();

  type Line = {
    sku: string;
    description: string;
    qty: number;
    rate: number;
    amount: number;
    priceLevel: string;
  };

  let reason = $state(RETURN_REASONS[0]);
  let returnType = $state(RETURN_TYPES[0]);
  let comments = $state('');
  let lines = $state<Line[]>((data.lines as Line[]).map((l) => ({ ...l })));

  let toast = $state<{ kind: 'err' | 'ok'; msg: string } | null>(null);
  let saving = $state(false);
  const formToken = crypto.randomUUID();

  function round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  function recalc(l: Line) {
    l.amount = round2(l.rate * Number(l.qty));
  }

  const subtotal = $derived(round2(lines.reduce((s, l) => s + l.amount, 0)));

  async function save() {
    if (!data.customer || !data.fromSO) {
      toast = { kind: 'err', msg: 'No customer or sales order on this return.' };
      return;
    }
    saving = true;
    toast = null;
    try {
      const res = await fetch('/api/rmas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          formToken,
          input: {
            customerId: data.customer.id,
            fromSalesOrder: data.fromSO,
            reason,
            returnType,
            comments,
            lines: lines.map((l) => ({
              sku: l.sku,
              description: l.description,
              qty: Number(l.qty),
              rate: l.rate,
              amount: l.amount,
              priceLevel: l.priceLevel,
            })),
          },
        }),
      });
      const out = await res.json();
      if (!out.ok) {
        toast = { kind: 'err', msg: out.error ?? 'Save failed.' };
        saving = false;
        return;
      }
      await goto(`/returnauth/${out.rma.id}`);
    } catch (e) {
      toast = { kind: 'err', msg: (e as Error).message };
      saving = false;
    }
  }
</script>

<svelte:head><title>Return Authorization — To Be Generated</title></svelte:head>

<h1 class="ns-title">Return Authorization <span class="ns-muted">To Be Generated</span></h1>

{#if !data.customer || !data.fromSO}
  <div class="ns-banner">
    No sales order selected. Open a sales order and click “Authorize Return” to create a return
    authorization.
  </div>
{/if}

<div class="ns-toolbar">
  <button
    class="ns-btn primary"
    name="save"
    onclick={save}
    disabled={saving || !data.customer || !data.fromSO}
  >
    {saving ? 'Saving…' : 'Save'}
  </button>
  <button class="ns-btn" name="cancel" onclick={() => history.back()}>Cancel</button>
</div>

<section class="ns-section">
  <h3>Primary Information</h3>
  <div class="ns-kv">
    <span class="k">Customer</span><span>{data.customer ? data.customer.display : '—'}</span>
    <span class="k">Created From</span><span>{data.fromSO ?? '—'}</span>
  </div>
  <div class="ns-grid">
    <div class="ns-field">
      <span class="ns-label">Return Reason</span>
      <select class="ns-select" name="reason" bind:value={reason}>
        {#each RETURN_REASONS as r (r)}<option>{r}</option>{/each}
      </select>
    </div>
    <div class="ns-field">
      <span class="ns-label">Return Type</span>
      <select class="ns-select" name="returnType" bind:value={returnType}>
        {#each RETURN_TYPES as t (t)}<option>{t}</option>{/each}
      </select>
    </div>
    <div class="ns-field wide">
      <span class="ns-label">Return Comments</span>
      <textarea class="ns-textarea" name="comments" bind:value={comments}></textarea>
    </div>
  </div>
</section>

<div class="ns-summary-wrap">
  <div style="flex:1">
    <section class="ns-section">
      <h3>Items</h3>
      <table class="ns-sublist">
        <thead>
          <tr>
            <th>Item</th>
            <th style="width:80px">Qty</th>
            <th style="width:90px">Rate</th>
            <th style="width:100px">Amount</th>
          </tr>
        </thead>
        <tbody>
          {#each lines as l, i (i)}
            <tr class="line-row">
              <td>{l.sku} : {l.description}</td>
              <td>
                <input
                  class="ns-input"
                  name="qty_{l.sku}"
                  type="number"
                  min="0"
                  bind:value={l.qty}
                  oninput={() => recalc(l)}
                />
              </td>
              <td>{l.rate.toFixed(2)}</td>
              <td>{l.amount.toFixed(2)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  </div>

  <aside class="ns-summary">
    <h3>Summary</h3>
    <div class="row"><span>SUBTOTAL</span><span>{subtotal.toFixed(2)}</span></div>
    <div class="row total"><span>TOTAL</span><span>{subtotal.toFixed(2)}</span></div>
  </aside>
</div>

{#if toast}
  <div
    class="ns-toast {toast.kind === 'ok' ? 'ok' : ''}"
    role="alert"
    onclick={() => (toast = null)}
  >
    {toast.msg}
  </div>
{/if}
