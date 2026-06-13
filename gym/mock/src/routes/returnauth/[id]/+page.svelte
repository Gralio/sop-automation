<script lang="ts">
  let { data } = $props();

  // Live status so the page updates after an action without a reload.
  let status = $state(data.status);
  let creditMemoId = $state<string | null>(data.creditMemoId);

  let toast = $state<{ kind: 'err' | 'ok'; msg: string } | null>(null);
  let busy = $state(false);
  const formToken = crypto.randomUUID();

  async function receive() {
    busy = true;
    toast = null;
    try {
      const res = await fetch(`/api/rmas/${data.id}/receive`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ formToken }),
      });
      const out = await res.json();
      if (!out.ok) {
        toast = { kind: 'err', msg: out.error ?? 'Receive failed.' };
        return;
      }
      status = 'Received';
      toast = { kind: 'ok', msg: 'Received.' };
    } catch (e) {
      toast = { kind: 'err', msg: (e as Error).message };
    } finally {
      busy = false;
    }
  }

  async function refund() {
    busy = true;
    toast = null;
    try {
      const res = await fetch(`/api/rmas/${data.id}/refund`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ formToken }),
      });
      const out = await res.json();
      if (!out.ok) {
        toast = { kind: 'err', msg: out.error ?? 'Refund failed.' };
        return;
      }
      status = 'Refunded';
      creditMemoId = out.creditMemo.id;
      toast = { kind: 'ok', msg: `Refunded. Credit Memo ${out.creditMemo.id}` };
    } catch (e) {
      toast = { kind: 'err', msg: (e as Error).message };
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Return Authorization {data.id}</title></svelte:head>

<h1 class="ns-title">Return Authorization {data.id}</h1>
<div class="ns-subtitle"><span class="ns-status">{status}</span></div>

<div class="ns-toolbar">
  {#if status === 'Pending Receipt'}
    <button class="ns-btn primary" name="receive" onclick={receive} disabled={busy}>Receive</button>
  {/if}
  {#if status === 'Pending Receipt' || status === 'Received'}
    <button class="ns-btn" name="refund" onclick={refund} disabled={busy}>Refund</button>
  {/if}
</div>

<section class="ns-section">
  <h3>Primary Information</h3>
  <div class="ns-kv">
    <span class="k">Customer</span><span
      ><a href="/customer/{data.customerId}">{data.customerDisplay}</a></span
    >
    {#if data.fromSalesOrder}
      <span class="k">Created From</span><span
        ><a href="/salesorder/{data.fromSalesOrder}">{data.fromSalesOrder}</a></span
      >
    {/if}
    <span class="k">Reason</span><span>{data.reason}</span>
    <span class="k">Return Type</span><span>{data.returnType}</span>
    <span class="k">Comments</span><span>{data.comments}</span>
    {#if creditMemoId}
      <span class="k">Credit Memo</span><span
        ><a href="/invoice/{creditMemoId}">{creditMemoId}</a></span
      >
    {/if}
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
          {#each data.lines as l, i (i)}
            <tr class="line-row">
              <td>{l.sku} : {l.description}</td>
              <td>{l.qty}</td>
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
    <div class="row"><span>SUBTOTAL</span><span>{data.subtotal.toFixed(2)}</span></div>
    <div class="row total"><span>TOTAL</span><span>{data.total.toFixed(2)}</span></div>
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
