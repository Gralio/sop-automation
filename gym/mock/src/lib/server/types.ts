/** Domain types for the mock NetSuite store. Authentic vocabulary derived from
 * the transcript corpus (see gym/REFERENCE.md). */

export type Location =
  | 'Main Warehouse'
  | 'Vista'
  | 'Marlow'
  | 'Mount Pleasant'
  | 'Fort Worth'
  | 'Carlsbad';

export type PriceLevelName =
  | '1_Wholesale'
  | '3_Gold'
  | '4_Platinum'
  | '10_Retail'
  | 'Custom';

/** Quantity-break pricing: qty threshold -> unit price. */
export type PriceBreaks = Record<string, number>;

export interface Item {
  sku: string;
  name: string;
  /** "13828 : Site Placard Token - Gold/Zinc" — how it reads in the item field. */
  display: string;
  basePrice: number;
  /** Per-location available quantity. */
  available: Partial<Record<Location, number>>;
  /** Price level -> qty-break table. */
  priceLevels: Partial<Record<PriceLevelName, PriceBreaks>>;
  /** Setup/charge/labor lines have no inventory and a flat price. */
  isService?: boolean;
  /** Matrix items must be updated via the Update Matrix mass action. */
  isMatrix?: boolean;
}

export interface CustomerAddress {
  label: string;
  addressee: string;
  line1: string;
  city: string;
  state: string;
  zip: string;
}

export interface Customer {
  /** Account id, e.g. "5129", "1302-013", "21159". */
  id: string;
  /** Display name without the account id. */
  name: string;
  /** "5129 THE Builders OF NEVADA" — how it reads everywhere. */
  display: string;
  email: string;
  terms: string;
  balance: number;
  creditLimit: number;
  daysOverdue: number;
  addresses: CustomerAddress[];
  /** Warranty / consolidated marketplace accounts behave specially per the SOPs. */
  kind?: 'standard' | 'warranty' | 'marketplace';
}

export interface OrderLine {
  sku: string;
  description: string;
  qty: number;
  rate: number;
  amount: number;
  priceLevel: PriceLevelName;
  imprintText?: string;
  imprintColor?: string;
}

export type SalesOrderStatus =
  | 'Pending Approval'
  | 'Pending Fulfillment'
  | 'Partially Fulfilled'
  | 'Awaiting Info/Artwork from Vendor/Graphics'
  | 'Awaiting Info/Approval from Customer/Rep'
  | 'In Production'
  | 'Shipped'
  | 'Billed'
  | 'Cancelled';

export interface SalesOrder {
  id: string;
  customerId: string;
  form: string;
  orderPlacedBy: string;
  poRef: string;
  source: string;
  location: Location;
  memo: string;
  status: SalesOrderStatus;
  lines: OrderLine[];
  subtotal: number;
  total: number;
  createdAt: string;
}

export interface ReturnAuthorization {
  id: string;
  fromSalesOrder?: string;
  customerId: string;
  reason: string;
  returnType: string;
  comments: string;
  lines: OrderLine[];
  status: 'To Be Generated' | 'Pending Receipt' | 'Received' | 'Refunded';
  subtotal: number;
  total: number;
  itemReceiptId?: string;
  creditMemoId?: string;
  createdAt: string;
}

export interface ItemFulfillment {
  id: string;
  salesOrderId: string;
  status: 'Picked' | 'Packed' | 'Shipped';
  trackingNumber?: string;
  packageWeight?: string;
  createdAt: string;
}

export interface Invoice {
  id: string;
  salesOrderId: string;
  customerId: string;
  total: number;
  status: 'Open' | 'Paid';
  createdAt: string;
}

export interface CreditMemo {
  id: string;
  rmaId: string;
  customerId: string;
  total: number;
  createdAt: string;
}

/** Knobs for the (hidden) adversarial layer. Tests tune these; the worker
 * never sees them. */
export interface AdversarialConfig {
  enabled: boolean;
  seed: number;
  /** ms latency range applied to mutations + searches. */
  latencyMinMs: number;
  latencyMaxMs: number;
  /** Probability the FIRST save attempt of a given form fails transiently. */
  saveFailRate: number;
}
