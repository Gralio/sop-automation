<svelte:head><title>Home</title></svelte:head>

<h1 class="ns-title">Home</h1>
<div class="ns-subtitle">Apex Construction Supply · Customer Service Dashboard</div>

<div class="ns-summary-wrap">
  <div style="flex:1">
    <section class="ns-section">
      <h3>Reminders</h3>
      <table class="ns-sublist">
        <tbody>
          <tr class="line-row"><td>Orders to Approve</td><td style="width:60px">3</td></tr>
          <tr class="line-row"><td>Orders to Fulfill</td><td>5</td></tr>
          <tr class="line-row"><td>Open Return Authorizations</td><td>1</td></tr>
          <tr class="line-row"><td>Invoices to Bill</td><td>2</td></tr>
        </tbody>
      </table>
    </section>

    <section class="ns-section">
      <h3>Recent Records</h3>
      <table class="ns-sublist">
        <thead>
          <tr><th>Type</th><th>Record</th></tr>
        </thead>
        <tbody>
          <tr class="line-row"><td>Sales Order</td><td><a href="/salesorder/SO500123">SO500123</a></td></tr>
          <tr class="line-row"><td>Invoice</td><td><a href="/invoice/INV62210">INV62210</a></td></tr>
          <tr class="line-row"><td>Customer</td><td><a href="/customer/9098">9098 Mirage Springs Complex Casino</a></td></tr>
          <tr class="line-row"><td>Customer</td><td><a href="/customer/5129">5129 THE Builders OF NEVADA</a></td></tr>
        </tbody>
      </table>
    </section>
  </div>

  <aside class="ns-summary">
    <h3>Quick Links</h3>
    <div class="row"><a href="/salesorder/new">New Sales Order</a></div>
    <div class="row"><a href="/customer/5129">Customers</a></div>
    <div class="row"><a href="/search?q=SO">Search Orders</a></div>
  </aside>
</div>
