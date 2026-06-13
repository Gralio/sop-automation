/**
 * In-process mock NetSuite store: seed data, id generation, mutations, and the
 * (hidden) adversarial layer. Singleton for the dev server process.
 *
 * NOTE: the adversarial behavior here is intentionally undocumented to the
 * worker. The worker must cope with it generically (retry, dismiss, paginate,
 * disambiguate). Tests tune it via /api/__config; default is moderate.
 */
import type {
  AdversarialConfig,
  CreditMemo,
  Customer,
  Invoice,
  Item,
  ItemFulfillment,
  Location,
  PriceBreaks,
  PriceLevelName,
  ReturnAuthorization,
  SalesOrder,
} from './types.js';

interface Store {
  customers: Map<string, Customer>;
  items: Map<string, Item>;
  salesOrders: Map<string, SalesOrder>;
  rmas: Map<string, ReturnAuthorization>;
  fulfillments: Map<string, ItemFulfillment>;
  invoices: Map<string, Invoice>;
  creditMemos: Map<string, CreditMemo>;
  counters: Record<string, number>;
  adversarial: AdversarialConfig;
  rngState: number;
  /** form tokens that have already failed once (so a retry succeeds). */
  failedOnce: Set<string>;
  formAttempts: Map<string, number>;
}

// ---------- price helpers ----------
const TIER_FACTOR: Record<Exclude<PriceLevelName, 'Custom'>, number> = {
  '10_Retail': 1,
  '4_Platinum': 0.9,
  '3_Gold': 0.82,
  '1_Wholesale': 0.72,
};

function breaks(base: number, factor: number): PriceBreaks {
  // qty 0 / 5 / 50 breakpoints, mild volume discount
  return {
    '0': round2(base * factor),
    '5': round2(base * factor * 0.96),
    '50': round2(base * factor * 0.9),
  };
}

function levels(base: number): Item['priceLevels'] {
  const out: Item['priceLevels'] = {};
  (Object.keys(TIER_FACTOR) as Array<keyof typeof TIER_FACTOR>).forEach((lvl) => {
    out[lvl] = breaks(base, TIER_FACTOR[lvl]);
  });
  return out;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ---------- seed ----------
function inv(
  sku: string,
  name: string,
  basePrice: number,
  available: Partial<Record<Location, number>>,
  opts: Partial<Item> = {},
): Item {
  return {
    sku,
    name,
    display: `${sku} : ${name}`,
    basePrice,
    available,
    priceLevels: opts.isService ? {} : levels(basePrice),
    ...opts,
  };
}

function svc(sku: string, name: string, price: number): Item {
  return {
    sku,
    name,
    display: `${sku} : ${name}`,
    basePrice: price,
    available: {},
    priceLevels: {},
    isService: true,
  };
}

function cust(
  id: string,
  name: string,
  email: string,
  balance: number,
  creditLimit: number,
  daysOverdue: number,
  kind: Customer['kind'] = 'standard',
  terms = 'Net 30',
): Customer {
  return {
    id,
    name,
    display: `${id} ${name}`,
    email,
    terms,
    balance,
    creditLimit,
    daysOverdue,
    kind,
    addresses: [
      {
        label: 'Default',
        addressee: name,
        line1: '100 Jobsite Rd',
        city: 'Lubbock',
        state: 'TX',
        zip: '79401',
      },
    ],
  };
}

function seedCustomers(): Customer[] {
  return [
    cust('5129', 'THE Builders OF NEVADA', 'orders@buildersnv.example', 15337.67, 5000, 21),
    cust('9098', 'Mirage Springs Complex Casino', 'ap@miragesprings.example', 2234.0, 10000, 0),
    cust('1302-013', 'Silver Pine Club', 'po@silverpine.example', 868.5, 7500, 0),
    // near-duplicate pair — disambiguate by account id / exact name
    cust('1302-039', 'Willow Creek Club', 'buyer@willowcreekclub.example', 1645.0, 7500, 0),
    cust(
      '1302-111',
      'Willow Creek Construction Group',
      'orders@willowcreekcg.example',
      540.0,
      7500,
      0,
    ),
    cust('1043', 'MERIDIAN Construction Group - NV', 'po@meridian-nv.example', 11105.02, 5000, 120),
    cust('11584', 'Twilight Hills B.S.', 'orders@twilighthills.example', 320.0, 5000, 0),
    cust('3121', 'The Builders at Rancho Solano', 'ap@ranchosolano.example', 0, 10000, 0),
    cust('8278', 'Brandwell Builders Club', 'buyer@brandwell.example', 4860.0, 5000, 7),
    cust('9141', 'Canyon Falls Construction Group', 'po@canyonfalls.example', 1280.0, 8000, 0),
    cust('21159', 'Apex Consumer Warranty', 'warranty@apexsupply.example', 0, 0, 0, 'warranty'),
    cust('40837', 'Consumer - Shopify DuraForge', 'web@apexsupply.example', 0, 0, 0, 'marketplace'),
    cust(
      '7658',
      'Stratus Hotels and Complexs : Omni Harbor Island',
      'po@omniharbor.example',
      980.0,
      6000,
      0,
    ),
  ];
}

function seedItems(): Item[] {
  return [
    inv('13828', 'Site Placard Token - Gold/Zinc', 7.68, { 'Main Warehouse': 1200, Vista: 300 }),
    svc('13828-DIE', 'Site Placard Token Setup Charge', 45),
    inv('12110', 'Custom Site Placard - 100lb Uncoated', 0.0516, {
      'Main Warehouse': 50000,
      Marlow: 20000,
    }),
    inv('12103', 'Custom Site Placard - 80lb Matte', 0.0492, { Marlow: 26000 }),
    inv('13020', 'Custom Metal Layout Marker', 2.19, { 'Main Warehouse': 800 }),
    inv('13028', 'Metal Marking Flags', 1.95, { 'Main Warehouse': 5400, Vista: 1000 }),
    inv('19018', 'Handle Cutter', 30.0, { 'Main Warehouse': 0 }), // out of stock -> inventory warning
    inv('15049A', 'Timber Gear Tags', 3.4, { 'Main Warehouse': 640 }),
    inv('21801-EMB', 'Classic Towel - Embroidered', 21.5, { 'Main Warehouse': 220 }),
    inv('16497-GRN', 'GripFast Marker - Green', 2.05, { 'Main Warehouse': 900 }),
    inv('23196-RED', 'Survey Marker - Red', 0.42, { 'Main Warehouse': 12000 }),
    inv('23196-WHT', 'Survey Marker - White', 0.42, { 'Main Warehouse': 12000 }),
    inv('10509-PROMO', 'Promo Hard Hat Sticker', 0.85, { 'Main Warehouse': 8000 }),
    inv('QGB22-BLK', 'DuraForge Gear Bottle 22oz - Black', 18.0, { 'Mount Pleasant': 400 }),
    inv('QGB22-COP', 'DuraForge Gear Bottle 22oz - Copper', 18.0, { 'Mount Pleasant': 150 }),
    inv('QT20-NAVY', 'DuraForge Tumbler 20oz - Navy', 16.0, { 'Mount Pleasant': 500 }),
    inv('DF-CAP', 'DuraForge Cap (Matrix)', 12.0, { 'Mount Pleasant': 600 }, { isMatrix: true }),
    svc('LABOR-FF1', 'Warranty Labor / Replacement', 0),
    svc('TC-ENG1', 'Laser Engraving Charge', 6),
    svc('Rounded Corners - 1k', 'Rounded Corners (per 1k)', 5),
  ];
}

// ---------- store lifecycle ----------
function defaultAdversarial(): AdversarialConfig {
  return { enabled: true, seed: 1234567, latencyMinMs: 150, latencyMaxMs: 700, saveFailRate: 0.35 };
}

function build(adversarial: AdversarialConfig): Store {
  const s: Store = {
    customers: new Map(),
    items: new Map(),
    salesOrders: new Map(),
    rmas: new Map(),
    fulfillments: new Map(),
    invoices: new Map(),
    creditMemos: new Map(),
    counters: { SO: 527900, PO: 86100, INV: 62300, RMA: 9900, IF: 602800, CM: 2820000, CS: 6900 },
    adversarial,
    rngState: adversarial.seed >>> 0,
    failedOnce: new Set(),
    formAttempts: new Map(),
  };
  for (const c of seedCustomers()) s.customers.set(c.id, c);
  for (const it of seedItems()) s.items.set(it.sku, it);
  seedTransactions(s);
  return s;
}

/** A couple of pre-existing transactions so RMA/return scenarios have a target. */
function seedTransactions(s: Store): void {
  const so: SalesOrder = {
    id: 'SO500123',
    customerId: '9098',
    form: 'AC Sales Order',
    orderPlacedBy: 'Dana Whitlock',
    poRef: 'PO-9098-114',
    source: 'CSR - E-mail from Customer',
    location: 'Main Warehouse',
    memo: 'Original order.',
    status: 'Billed',
    lines: [
      {
        sku: '13028',
        description: 'Metal Marking Flags',
        qty: 200,
        rate: 1.95,
        amount: 390,
        priceLevel: '10_Retail',
      },
      {
        sku: '13020',
        description: 'Custom Metal Layout Marker',
        qty: 50,
        rate: 2.19,
        amount: 109.5,
        priceLevel: '10_Retail',
      },
    ],
    subtotal: 499.5,
    total: 499.5,
    createdAt: '2025-11-01T10:00:00.000Z',
  };
  s.salesOrders.set(so.id, so);
  const inv: Invoice = {
    id: 'INV62210',
    salesOrderId: so.id,
    customerId: so.customerId,
    total: so.total,
    status: 'Open',
    createdAt: '2025-11-02T10:00:00.000Z',
  };
  s.invoices.set(inv.id, inv);
}

let store: Store = build(defaultAdversarial());

export function getStore(): Store {
  return store;
}

export function resetStore(adversarial?: Partial<AdversarialConfig>): void {
  store = build({ ...defaultAdversarial(), ...adversarial });
}

export function setAdversarial(patch: Partial<AdversarialConfig>): void {
  store.adversarial = { ...store.adversarial, ...patch };
  if (patch.seed !== undefined) store.rngState = patch.seed >>> 0;
}

// ---------- rng + adversarial ----------
function nextRng(): number {
  // mulberry32
  store.rngState = (store.rngState + 0x6d2b79f5) >>> 0;
  let t = store.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Apply latency to any server action. */
export async function latency(): Promise<void> {
  const a = store.adversarial;
  if (!a.enabled) return;
  const span = a.latencyMaxMs - a.latencyMinMs;
  await sleep(a.latencyMinMs + Math.floor(nextRng() * Math.max(0, span)));
}

/**
 * Decide whether a save with the given form token should transiently fail.
 * First attempt for a token may fail (rate-driven); any retry succeeds.
 */
export function shouldTransientlyFail(formToken: string): boolean {
  const a = store.adversarial;
  if (!a.enabled || !formToken) return false;
  const attempts = store.formAttempts.get(formToken) ?? 0;
  store.formAttempts.set(formToken, attempts + 1);
  if (attempts > 0) return false; // retries always succeed
  if (store.failedOnce.has(formToken)) return false;
  const fail = nextRng() < a.saveFailRate;
  if (fail) store.failedOnce.add(formToken);
  return fail;
}

// ---------- id generation ----------
export function nextId(prefix: keyof Store['counters']): string {
  store.counters[prefix] += 1;
  return `${prefix}${store.counters[prefix]}`;
}
