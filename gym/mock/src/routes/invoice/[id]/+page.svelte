<script lang="ts">
  let { data } = $props();
</script>

<svelte:head><title>Invoice {data.id}</title></svelte:head>

<h1 class="ns-title">Invoice {data.id}</h1>
<div class="ns-subtitle"><span class="ns-status">{data.status}</span></div>

<section class="ns-section">
  <h3>Primary Information</h3>
  <div class="ns-kv">
    <span class="k">Customer</span><span
      ><a href="/customer/{data.customerId}">{data.customerDisplay}</a></span
    >
    <span class="k">Created From SO</span><span
      ><a href="/salesorder/{data.salesOrderId}">{data.salesOrderId}</a></span
    >
    <span class="k">Total</span><span>{data.total.toFixed(2)}</span>
    <span class="k">Status</span><span>{data.status}</span>
  </div>
</section>
