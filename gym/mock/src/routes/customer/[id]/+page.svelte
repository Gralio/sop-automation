<script lang="ts">
  import { goto } from '$app/navigation';

  let { data } = $props();

  function createSalesOrder() {
    goto(`/salesorder/new?entity=${encodeURIComponent(data.id)}`);
  }
</script>

<svelte:head><title>{data.display}</title></svelte:head>

<h1 class="ns-title">{data.display}</h1>
<div class="ns-subtitle">Customer · {data.kind} · Terms {data.terms}</div>

<div class="ns-toolbar">
  <button class="ns-btn primary" name="createSalesOrder" onclick={createSalesOrder}>Create Sales Order</button>
  <button class="ns-btn">Edit</button>
  <button class="ns-btn">Actions</button>
</div>

<section class="ns-section">
  <h3>Primary Information</h3>
  <div class="ns-kv">
    <span class="k">Account id</span><span>{data.id}</span>
    <span class="k">Name</span><span>{data.name}</span>
    <span class="k">Email</span><span>{data.email}</span>
    <span class="k">Terms</span><span>{data.terms}</span>
    <span class="k">Balance</span><span>{data.balance.toFixed(2)}</span>
    <span class="k">Credit Limit</span><span>{data.creditLimit.toFixed(2)}</span>
    <span class="k">Days Overdue</span><span>{data.daysOverdue}</span>
  </div>
</section>

<section class="ns-section">
  <h3>Sales Orders</h3>
  <table class="ns-sublist">
    <thead>
      <tr><th>Sales Order</th><th>Status</th><th style="width:110px">Total</th></tr>
    </thead>
    <tbody>
      {#each data.salesOrders as so (so.id)}
        <tr class="line-row">
          <td><a href="/salesorder/{so.id}">{so.id}</a></td>
          <td>{so.status}</td>
          <td>{so.total.toFixed(2)}</td>
        </tr>
      {/each}
      {#if data.salesOrders.length === 0}
        <tr class="line-row"><td colspan="3" class="ns-muted">No sales orders.</td></tr>
      {/if}
    </tbody>
  </table>
</section>

<section class="ns-section">
  <h3>Invoices</h3>
  <table class="ns-sublist">
    <thead>
      <tr><th>Invoice</th><th>Status</th><th style="width:110px">Total</th></tr>
    </thead>
    <tbody>
      {#each data.invoices as inv (inv.id)}
        <tr class="line-row">
          <td><a href="/invoice/{inv.id}">{inv.id}</a></td>
          <td>{inv.status}</td>
          <td>{inv.total.toFixed(2)}</td>
        </tr>
      {/each}
      {#if data.invoices.length === 0}
        <tr class="line-row"><td colspan="3" class="ns-muted">No invoices.</td></tr>
      {/if}
    </tbody>
  </table>
</section>
