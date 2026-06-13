<script lang="ts">
  import { goto } from '$app/navigation';

  let { data } = $props();

  // Live status so the page updates after an action without a reload.
  let status = $state(data.status);

  type Fulfillment = { id: string; status: string; trackingNumber: string; packageWeight: string };
  type Invoice = { id: string; total: number; status: string };
  let fulfillments = $state<Fulfillment[]>(data.fulfillments as Fulfillment[]);
  let invoices = $state<Invoice[]>(data.invoices as Invoice[]);

  const hasImprint = data.lines.some((l) => l.imprintText || l.imprintColor);

  // Fulfill panel inputs.
  let showFulfill = $state(false);
  let trackingNumber = $state('');
  let packageWeight = $state('');

  let toast = $state<{ kind: 'err' | 'ok'; msg: string } | null>(null);
  let busy = $state(false);
  const formToken = crypto.randomUUID();

  async function approve() {
    busy = true;
    toast = null;
    try {
      const res = await fetch(`/api/salesorders/${data.id}/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ formToken }),
      });
      const out = await res.json();
      if (!out.ok) {
        toast = { kind: 'err', msg: out.error ?? 'Approve failed.' };
        return;
      }
      status = out.salesOrder.status;
      toast = { kind: 'ok', msg: 'Approved. Status: Pending Fulfillment' };
    } catch (e) {
      toast = { kind: 'err', msg: (e as Error).message };
    } finally {
      busy = false;
    }
  }

  async function saveFulfillment() {
    busy = true;
    toast = null;
    try {
      const res = await fetch(`/api/salesorders/${data.id}/fulfill`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trackingNumber, packageWeight, formToken }),
      });
      const out = await res.json();
      if (!out.ok) {
        toast = { kind: 'err', msg: out.error ?? 'Fulfillment failed.' };
        return;
      }
      status = 'Shipped';
      fulfillments = [
        ...fulfillments,
        {
          id: out.fulfillment.id,
          status: out.fulfillment.status,
          trackingNumber: out.fulfillment.trackingNumber ?? '',
          packageWeight: out.fulfillment.packageWeight ?? '',
        },
      ];
      showFulfill = false;
      toast = { kind: 'ok', msg: `Fulfilled. Fulfillment ${out.fulfillment.id}` };
    } catch (e) {
      toast = { kind: 'err', msg: (e as Error).message };
    } finally {
      busy = false;
    }
  }

  async function bill() {
    busy = true;
    toast = null;
    try {
      const res = await fetch(`/api/salesorders/${data.id}/bill`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ formToken }),
      });
      const out = await res.json();
      if (!out.ok) {
        toast = { kind: 'err', msg: out.error ?? 'Bill failed.' };
        return;
      }
      status = 'Billed';
      invoices = [
        ...invoices,
        { id: out.invoice.id, total: out.invoice.total, status: out.invoice.status },
      ];
      toast = { kind: 'ok', msg: `Billed. Invoice ${out.invoice.id}` };
    } catch (e) {
      toast = { kind: 'err', msg: (e as Error).message };
    } finally {
      busy = false;
    }
  }

  function authorizeReturn() {
    goto('/returnauth/new?fromSO=' + data.id);
  }
</script>

<svelte:head><title>Sales Order {data.id}</title></svelte:head>

<h1 class="ns-title">Sales Order {data.id}</h1>
<div class="ns-subtitle"><span class="ns-status">{status}</span></div>

<div class="ns-toolbar">
  <button class="ns-btn" name="edit" onclick={() => goto('/salesorder/new?entity=' + data.customerId)}>Edit</button>
  {#if status === 'Pending Approval'}
    <button class="ns-btn primary" name="approve" onclick={approve} disabled={busy}>Approve</button>
  {/if}
  {#if status === 'Pending Fulfillment'}
    <button class="ns-btn primary" name="fulfill" onclick={() => (showFulfill = true)} disabled={busy}>Fulfill</button>
  {/if}
  {#if status === 'Pending Fulfillment' || status === 'Shipped'}
    <button class="ns-btn" name="bill" onclick={bill} disabled={busy}>Bill</button>
  {/if}
  <button class="ns-btn" name="authorizeReturn" onclick={authorizeReturn}>Authorize Return</button>
</div>

<section class="ns-section">
  <h3>Primary Information</h3>
  <div class="ns-kv">
    <span class="k">Customer</span><span><a href="/customer/{data.customerId}">{data.customerDisplay}</a></span>
    <span class="k">Order Placed By</span><span>{data.orderPlacedBy}</span>
    <span class="k">PO # / Ref</span><span>{data.poRef}</span>
    <span class="k">Source</span><span>{data.source}</span>
    <span class="k">Location</span><span>{data.location}</span>
    <span class="k">Memo</span><span>{data.memo}</span>
    <span class="k">Form</span><span>{data.form}</span>
  </div>
</section>

{#if showFulfill}
  <section class="ns-section">
    <h3>Item Fulfillment</h3>
    <div class="ns-grid">
      <div class="ns-field">
        <span class="ns-label">Tracking Number</span>
        <input class="ns-input" name="trackingNumber" bind:value={trackingNumber} />
      </div>
      <div class="ns-field">
        <span class="ns-label">Package Weight</span>
        <input class="ns-input" name="packageWeight" bind:value={packageWeight} />
      </div>
      <div class="ns-field">
        <span class="ns-label">&nbsp;</span>
        <button class="ns-btn primary" name="saveFulfillment" onclick={saveFulfillment} disabled={busy}>
          Save Fulfillment
        </button>
      </div>
    </div>
  </section>
{/if}

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
            {#if hasImprint}<th>Imprint Text</th><th style="width:110px">Imprint Color</th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each data.lines as l, i (i)}
            <tr class="line-row">
              <td>{l.sku} : {l.description}</td>
              <td>{l.qty}</td>
              <td>{l.rate.toFixed(2)}</td>
              <td>{l.amount.toFixed(2)}</td>
              {#if hasImprint}<td>{l.imprintText}</td><td>{l.imprintColor}</td>{/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </section>

    {#if fulfillments.length > 0}
      <section class="ns-section">
        <h3>Fulfillments</h3>
        <table class="ns-sublist">
          <thead>
            <tr><th>Fulfillment</th><th>Status</th><th>Tracking #</th><th>Package Weight</th></tr>
          </thead>
          <tbody>
            {#each fulfillments as f (f.id)}
              <tr class="line-row">
                <td>{f.id}</td>
                <td>{f.status}</td>
                <td>{f.trackingNumber}</td>
                <td>{f.packageWeight}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}

    {#if invoices.length > 0}
      <section class="ns-section">
        <h3>Invoices</h3>
        <table class="ns-sublist">
          <thead>
            <tr><th>Invoice</th><th>Status</th><th style="width:110px">Total</th></tr>
          </thead>
          <tbody>
            {#each invoices as inv (inv.id)}
              <tr class="line-row">
                <td><a href="/invoice/{inv.id}">{inv.id}</a></td>
                <td>{inv.status}</td>
                <td>{inv.total.toFixed(2)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
    {/if}
  </div>

  <aside class="ns-summary">
    <h3>Summary</h3>
    <div class="row"><span>SUBTOTAL</span><span>{data.subtotal.toFixed(2)}</span></div>
    <div class="row"><span>DISCOUNT</span><span>0.00</span></div>
    <div class="row"><span>TAX TOTAL</span><span>0.00</span></div>
    <div class="row total"><span>TOTAL</span><span>{data.total.toFixed(2)}</span></div>
  </aside>
</div>

{#if toast}
  <div class="ns-toast {toast.kind === 'ok' ? 'ok' : ''}" role="alert" onclick={() => (toast = null)}>
    {toast.msg}
  </div>
{/if}
