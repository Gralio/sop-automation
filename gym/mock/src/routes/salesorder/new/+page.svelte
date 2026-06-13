<script lang="ts">
  import { goto } from '$app/navigation';
  import { FORMS, SOURCES, LOCATIONS, ORDER_STATUSES, PRICE_LEVELS, isSpecialOrder } from '$lib/vocab';

  let { data } = $props();

  type ItemData = {
    sku: string;
    name: string;
    display: string;
    basePrice: number;
    available: Record<string, number>;
    priceLevels: Record<string, Record<string, number>>;
    isService: boolean;
  };
  const items = data.items as ItemData[];
  const itemBySku = new Map(items.map((i) => [i.sku, i]));

  type Line = {
    sku: string;
    description: string;
    qty: number;
    priceLevel: string;
    rate: number;
    amount: number;
    imprintText: string;
    imprintColor: string;
  };

  // header
  let form = $state('AC Sales Order');
  let orderPlacedBy = $state('');
  let source = $state('CSR - E-mail from Customer');
  let location = $state('Main Warehouse');
  let poRef = $state('');
  let memo = $state('');
  let status = $state('Pending Approval');

  // lines + add row
  let lines = $state<Line[]>([]);
  let addSku = $state('');
  let addQty = $state<number>(1);
  let addPriceLevel = $state('10_Retail');
  let addRate = $state<number>(0);
  let addImprintText = $state('');
  let addImprintColor = $state('');
  let itemSuggest = $state<ItemData[]>([]);
  let showItemSuggest = $state(false);

  // modals / toast
  type Warn = { title: string; msg: string };
  let warnings = $state<Warn[]>([]);
  let pendingLine = $state<Line | null>(null);
  let pendingWarn = $state<Warn | null>(null);
  let toast = $state<{ kind: 'err' | 'ok'; msg: string } | null>(null);
  let saving = $state(false);
  const formToken = crypto.randomUUID();

  $effect(() => {
    // On mount, queue the credit/overdue warnings (NetSuite shows these on open).
    const c = data.customer;
    if (!c) return;
    const w: Warn[] = [];
    if (c.daysOverdue > 0) w.push({ title: 'Warning', msg: `Customer is ${c.daysOverdue} days overdue` });
    if (c.balance > c.creditLimit)
      w.push({
        title: 'Warning',
        msg: `Customer balance of ${c.balance.toFixed(2)} exceeds credit limit of ${c.creditLimit.toFixed(2)}.`,
      });
    warnings = w;
  });

  function rateFor(sku: string, level: string, qty: number): number {
    const it = itemBySku.get(sku);
    if (!it) return 0;
    if (level === 'Custom') return addRate;
    const table = it.priceLevels[level];
    if (!table) return it.basePrice;
    const ths = Object.keys(table)
      .map(Number)
      .sort((a, b) => a - b);
    let price = table[String(ths[0] ?? 0)] ?? it.basePrice;
    for (const t of ths) if (qty >= t) price = table[String(t)] ?? price;
    return price;
  }

  function onItemInput() {
    const term = addSku.toLowerCase().trim();
    if (!term) {
      itemSuggest = [];
      showItemSuggest = false;
      return;
    }
    itemSuggest = items
      .filter((i) => i.sku.toLowerCase().includes(term) || i.name.toLowerCase().includes(term))
      .slice(0, 6);
    showItemSuggest = itemSuggest.length > 0;
  }

  function pickItem(it: ItemData) {
    addSku = it.sku;
    showItemSuggest = false;
    if (addPriceLevel !== 'Custom') addRate = rateFor(it.sku, addPriceLevel, addQty);
  }

  const dismissWarn = () => {
    warnings = warnings.slice(1);
  };

  function makeLine(): Line | null {
    const it = itemBySku.get(addSku.trim());
    if (!it) {
      toast = { kind: 'err', msg: `No item matches "${addSku}".` };
      return null;
    }
    const rate = addPriceLevel === 'Custom' ? Number(addRate) : rateFor(it.sku, addPriceLevel, addQty);
    return {
      sku: it.sku,
      description: it.name,
      qty: Number(addQty),
      priceLevel: addPriceLevel,
      rate: round2(rate),
      amount: round2(rate * Number(addQty)),
      imprintText: addImprintText,
      imprintColor: addImprintColor,
    };
  }

  function addLine() {
    const line = makeLine();
    if (!line) return;
    const it = itemBySku.get(line.sku)!;
    const avail = it.available[location] ?? 0;
    if (!it.isService && line.qty > avail) {
      // NetSuite-style availability warning; OK acknowledges and adds anyway.
      pendingLine = line;
      pendingWarn = { title: 'Warning', msg: `${it.sku} ${it.name}: You have only ${avail} available` };
      return;
    }
    commitLine(line);
  }

  function commitLine(line: Line) {
    lines = [...lines, line];
    addSku = '';
    addQty = 1;
    addRate = 0;
    addImprintText = '';
    addImprintColor = '';
    itemSuggest = [];
    showItemSuggest = false;
  }

  function acceptPendingWarn() {
    if (pendingLine) commitLine(pendingLine);
    pendingLine = null;
    pendingWarn = null;
  }

  function removeLine(i: number) {
    lines = lines.filter((_, idx) => idx !== i);
  }

  function round2(n: number): number {
    return Math.round(n * 100) / 100;
  }
  const subtotal = $derived(round2(lines.reduce((s, l) => s + l.amount, 0)));

  async function save() {
    if (!data.customer) {
      toast = { kind: 'err', msg: 'No customer on this order.' };
      return;
    }
    if (lines.length === 0) {
      toast = { kind: 'err', msg: 'Add at least one item line.' };
      return;
    }
    saving = true;
    toast = null;
    try {
      const res = await fetch('/api/salesorders', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          formToken,
          input: {
            customerId: data.customer.id,
            form,
            orderPlacedBy,
            poRef,
            source,
            location,
            memo,
            status,
            lines: lines.map((l) => ({
              sku: l.sku,
              qty: l.qty,
              priceLevel: l.priceLevel,
              rate: l.rate,
              description: l.description,
              imprintText: l.imprintText || undefined,
              imprintColor: l.imprintColor || undefined,
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
      await goto(`/salesorder/${out.salesOrder.id}`);
    } catch (e) {
      toast = { kind: 'err', msg: (e as Error).message };
      saving = false;
    }
  }
</script>

<svelte:head><title>Sales Order — To Be Generated</title></svelte:head>

<h1 class="ns-title">Sales Order <span class="ns-muted">To Be Generated</span></h1>
{#if data.customer}
  <div class="ns-subtitle">Customer: <strong>{data.customer.display}</strong> · Terms {data.customer.terms}</div>
{:else}
  <div class="ns-banner">No customer selected. Open a customer record and click “Create Sales Order”.</div>
{/if}

<div class="ns-toolbar">
  <button class="ns-btn primary" onclick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
  <button class="ns-btn" onclick={() => history.back()}>Cancel</button>
  <button class="ns-btn" onclick={() => (toast = { kind: 'ok', msg: 'Tax calculated.' })}>Calculate Tax</button>
  <button class="ns-btn">Validate Bill To Address</button>
  <button class="ns-btn">Validate Ship To Address</button>
</div>

<div class="ns-summary-wrap">
  <div style="flex:1">
    <section class="ns-section">
      <h3>Primary Information</h3>
      <div class="ns-grid">
        <div class="ns-field">
          <span class="ns-label">Custom Form</span>
          <select class="ns-select" name="form" bind:value={form}>
            {#each FORMS as f (f)}<option>{f}</option>{/each}
          </select>
        </div>
        <div class="ns-field">
          <span class="ns-label">Order Placed By</span>
          <input class="ns-input" name="orderPlacedBy" bind:value={orderPlacedBy} />
        </div>
        <div class="ns-field">
          <span class="ns-label">PO # / Ref</span>
          <input class="ns-input" name="poRef" bind:value={poRef} />
        </div>
        <div class="ns-field">
          <span class="ns-label">Source</span>
          <select class="ns-select" name="source" bind:value={source}>
            {#each SOURCES as s (s)}<option>{s}</option>{/each}
          </select>
        </div>
        <div class="ns-field">
          <span class="ns-label">Location</span>
          <select class="ns-select" name="location" bind:value={location}>
            {#each LOCATIONS as l (l)}<option>{l}</option>{/each}
          </select>
        </div>
        <div class="ns-field">
          <span class="ns-label">Order Status</span>
          <select class="ns-select" name="status" bind:value={status}>
            {#each ORDER_STATUSES as s (s)}<option>{s}</option>{/each}
          </select>
        </div>
        <div class="ns-field wide">
          <span class="ns-label">Memo</span>
          <textarea class="ns-textarea" name="memo" bind:value={memo}></textarea>
        </div>
      </div>
    </section>

    <section class="ns-section">
      <h3>Items</h3>
      <table class="ns-sublist">
        <thead>
          <tr>
            <th style="width:30px"></th>
            <th>Item</th>
            <th style="width:80px">Qty</th>
            <th style="width:130px">Price Level</th>
            <th style="width:90px">Rate</th>
            <th style="width:100px">Amount</th>
            {#if isSpecialOrder(form)}<th>Imprint Text</th><th style="width:110px">Imprint Color</th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each lines as l, i (i)}
            <tr class="line-row">
              <td><button class="ns-btn" onclick={() => removeLine(i)} title="Remove">✕</button></td>
              <td>{l.sku} : {l.description}</td>
              <td>{l.qty}</td>
              <td>{l.priceLevel}</td>
              <td>{l.rate.toFixed(2)}</td>
              <td>{l.amount.toFixed(2)}</td>
              {#if isSpecialOrder(form)}<td>{l.imprintText}</td><td>{l.imprintColor}</td>{/if}
            </tr>
          {/each}
          <tr class="addrow">
            <td></td>
            <td style="position:relative">
              <input
                class="ns-input"
                name="addItem"
                placeholder="Type SKU or name"
                bind:value={addSku}
                oninput={onItemInput}
                autocomplete="off"
              />
              {#if showItemSuggest}
                <div class="ns-suggest">
                  {#each itemSuggest as it (it.sku)}
                    <div class="row" role="button" tabindex="0" onclick={() => pickItem(it)}>
                      <span>{it.display}</span>
                    </div>
                  {/each}
                </div>
              {/if}
            </td>
            <td><input class="ns-input" name="addQty" type="number" min="1" bind:value={addQty} onfocus={(e) => e.currentTarget.select()} /></td>
            <td>
              <select class="ns-select" name="addPriceLevel" bind:value={addPriceLevel}>
                {#each PRICE_LEVELS as p (p)}<option>{p}</option>{/each}
              </select>
            </td>
            <td>
              <input
                class="ns-input"
                name="addRate"
                type="number"
                step="0.0001"
                bind:value={addRate}
                readonly={addPriceLevel !== 'Custom'}
                placeholder={addPriceLevel === 'Custom' ? 'enter' : 'auto'}
                onfocus={(e) => e.currentTarget.select()}
              />
            </td>
            <td></td>
            {#if isSpecialOrder(form)}
              <td><input class="ns-input" name="addImprintText" bind:value={addImprintText} /></td>
              <td><input class="ns-input" name="addImprintColor" bind:value={addImprintColor} /></td>
            {/if}
          </tr>
          <tr>
            <td colspan={isSpecialOrder(form) ? 8 : 6}>
              <button class="ns-btn" name="addLine" onclick={addLine}>Add</button>
              <span class="ns-muted">Set Price Level to “Custom” to type your own rate (e.g. $0.00).</span>
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>

  <aside class="ns-summary">
    <h3>Summary</h3>
    <div class="row"><span>SUBTOTAL</span><span>{subtotal.toFixed(2)}</span></div>
    <div class="row"><span>DISCOUNT</span><span>0.00</span></div>
    <div class="row"><span>TAX TOTAL</span><span>0.00</span></div>
    <div class="row total"><span>TOTAL</span><span>{subtotal.toFixed(2)}</span></div>
  </aside>
</div>

{#if warnings.length > 0}
  <div class="ns-modal-overlay">
    <div class="ns-modal">
      <h4>{warnings[0].title}</h4>
      <div class="msg">{warnings[0].msg}</div>
      <div class="actions"><button class="ns-btn primary" onclick={dismissWarn}>OK</button></div>
    </div>
  </div>
{/if}

{#if pendingWarn}
  <div class="ns-modal-overlay">
    <div class="ns-modal">
      <h4>{pendingWarn.title}</h4>
      <div class="msg">{pendingWarn.msg}</div>
      <div class="actions"><button class="ns-btn primary" onclick={acceptPendingWarn}>OK</button></div>
    </div>
  </div>
{/if}

{#if toast}
  <div class="ns-toast {toast.kind === 'ok' ? 'ok' : ''}" role="alert" onclick={() => (toast = null)}>
    {toast.msg}
  </div>
{/if}
