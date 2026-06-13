/** Search + record mutations over the store. Adversarial friction (latency,
 * transient save failure) is applied by the API endpoints, not here. */
import { getStore, nextId, round2 } from './store.js';
import type {
  CreditMemo,
  Invoice,
  ItemFulfillment,
  Location,
  OrderLine,
  PriceLevelName,
  ReturnAuthorization,
  SalesOrder,
  SalesOrderStatus,
} from './types.js';

export interface SearchHit {
  type: 'Customer' | 'Inventory Item' | 'Sales Order' | 'Invoice' | 'Return Authorization';
  id: string;
  label: string;
  href: string;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function search(q: string): SearchHit[] {
  const store = getStore();
  const query = norm(q);
  if (!query) return [];
  const hits: SearchHit[] = [];
  const tokens = query.split(' ').filter(Boolean);
  const matches = (hay: string) => {
    const h = norm(hay);
    return tokens.every((t) => h.includes(t));
  };

  for (const c of store.customers.values()) {
    if (matches(c.display) || matches(c.id) || matches(c.name)) {
      hits.push({ type: 'Customer', id: c.id, label: c.display, href: `/customer/${encodeURIComponent(c.id)}` });
    }
  }
  for (const it of store.items.values()) {
    if (matches(it.display) || matches(it.sku) || matches(it.name)) {
      hits.push({ type: 'Inventory Item', id: it.sku, label: it.display, href: `/item/${encodeURIComponent(it.sku)}` });
    }
  }
  for (const so of store.salesOrders.values()) {
    if (matches(so.id)) {
      hits.push({ type: 'Sales Order', id: so.id, label: `${so.id} (${so.status})`, href: `/salesorder/${so.id}` });
    }
  }
  for (const inv of store.invoices.values()) {
    if (matches(inv.id)) {
      hits.push({ type: 'Invoice', id: inv.id, label: inv.id, href: `/invoice/${inv.id}` });
    }
  }
  for (const rma of store.rmas.values()) {
    if (matches(rma.id)) {
      hits.push({ type: 'Return Authorization', id: rma.id, label: `${rma.id} (${rma.status})`, href: `/returnauth/${rma.id}` });
    }
  }
  return hits;
}

/** Resolve the unit rate for an item at a price level + quantity breakpoint. */
export function rateFor(sku: string, level: PriceLevelName, qty: number): number {
  const item = getStore().items.get(sku);
  if (!item) return 0;
  if (level === 'Custom') return 0;
  const table = item.priceLevels[level];
  if (!table) return item.basePrice;
  const thresholds = Object.keys(table)
    .map(Number)
    .sort((a, b) => a - b);
  let price = table[String(thresholds[0] ?? 0)] ?? item.basePrice;
  for (const t of thresholds) {
    if (qty >= t) price = table[String(t)] ?? price;
  }
  return price;
}

export interface NewLineInput {
  sku: string;
  qty: number;
  priceLevel: PriceLevelName;
  rate?: number; // required when priceLevel is Custom
  description?: string;
  imprintText?: string;
  imprintColor?: string;
}

export interface NewSalesOrderInput {
  customerId: string;
  form: string;
  orderPlacedBy: string;
  poRef: string;
  source: string;
  location: Location;
  memo: string;
  status?: SalesOrderStatus;
  lines: NewLineInput[];
}

export function buildLines(lines: NewLineInput[]): OrderLine[] {
  const store = getStore();
  return lines.map((l) => {
    const item = store.items.get(l.sku);
    const rate = l.priceLevel === 'Custom' ? round2(l.rate ?? 0) : round2(rateFor(l.sku, l.priceLevel, l.qty));
    return {
      sku: l.sku,
      description: l.description || item?.name || l.sku,
      qty: l.qty,
      rate,
      amount: round2(rate * l.qty),
      priceLevel: l.priceLevel,
      imprintText: l.imprintText,
      imprintColor: l.imprintColor,
    };
  });
}

export function createSalesOrder(input: NewSalesOrderInput): SalesOrder {
  const store = getStore();
  const lines = buildLines(input.lines);
  const subtotal = round2(lines.reduce((s, l) => s + l.amount, 0));
  const so: SalesOrder = {
    id: nextId('SO'),
    customerId: input.customerId,
    form: input.form,
    orderPlacedBy: input.orderPlacedBy,
    poRef: input.poRef,
    source: input.source,
    location: input.location,
    memo: input.memo,
    status: input.status ?? 'Pending Approval',
    lines,
    subtotal,
    total: subtotal,
    createdAt: new Date().toISOString(),
  };
  store.salesOrders.set(so.id, so);
  return so;
}

export function approveSalesOrder(id: string): SalesOrder | undefined {
  const so = getStore().salesOrders.get(id);
  if (!so) return undefined;
  if (so.status === 'Pending Approval') so.status = 'Pending Fulfillment';
  return so;
}

export function fulfillSalesOrder(id: string, trackingNumber?: string, packageWeight?: string): ItemFulfillment | undefined {
  const store = getStore();
  const so = store.salesOrders.get(id);
  if (!so) return undefined;
  const f: ItemFulfillment = {
    id: nextId('IF'),
    salesOrderId: id,
    status: 'Packed',
    trackingNumber,
    packageWeight,
    createdAt: new Date().toISOString(),
  };
  store.fulfillments.set(f.id, f);
  so.status = 'Shipped';
  return f;
}

export function billSalesOrder(id: string): Invoice | undefined {
  const store = getStore();
  const so = store.salesOrders.get(id);
  if (!so) return undefined;
  const inv: Invoice = {
    id: nextId('INV'),
    salesOrderId: id,
    customerId: so.customerId,
    total: so.total,
    status: 'Open',
    createdAt: new Date().toISOString(),
  };
  store.invoices.set(inv.id, inv);
  so.status = 'Billed';
  return inv;
}

export interface NewRmaInput {
  customerId: string;
  fromSalesOrder?: string;
  reason: string;
  returnType: string;
  comments: string;
  lines: OrderLine[];
}

export function createRma(input: NewRmaInput): ReturnAuthorization {
  const store = getStore();
  const subtotal = round2(input.lines.reduce((s, l) => s + l.amount, 0));
  const rma: ReturnAuthorization = {
    id: nextId('RMA'),
    fromSalesOrder: input.fromSalesOrder,
    customerId: input.customerId,
    reason: input.reason,
    returnType: input.returnType,
    comments: input.comments,
    lines: input.lines,
    status: 'Pending Receipt',
    subtotal,
    total: subtotal,
    createdAt: new Date().toISOString(),
  };
  store.rmas.set(rma.id, rma);
  return rma;
}

export function receiveRma(id: string): ReturnAuthorization | undefined {
  const rma = getStore().rmas.get(id);
  if (!rma) return undefined;
  rma.itemReceiptId = nextId('IF').replace('IF', 'ITR');
  rma.status = 'Received';
  return rma;
}

export function refundRma(id: string): { rma: ReturnAuthorization; creditMemo: CreditMemo } | undefined {
  const store = getStore();
  const rma = store.rmas.get(id);
  if (!rma) return undefined;
  const cm: CreditMemo = {
    id: nextId('CM'),
    rmaId: id,
    customerId: rma.customerId,
    total: rma.total,
    createdAt: new Date().toISOString(),
  };
  store.creditMemos.set(cm.id, cm);
  rma.creditMemoId = cm.id;
  rma.status = 'Refunded';
  return { rma, creditMemo: cm };
}

export function updateItemPricing(sku: string, priceLevels: Record<string, Record<string, number>>): boolean {
  const item = getStore().items.get(sku);
  if (!item) return false;
  for (const [lvl, table] of Object.entries(priceLevels)) {
    item.priceLevels[lvl as PriceLevelName] = Object.fromEntries(
      Object.entries(table).map(([qty, price]) => [qty, round2(Number(price))]),
    );
  }
  return true;
}
