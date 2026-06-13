/** Dropdown option vocabularies, shared by the UI. Authentic values from the
 * transcript corpus. */
export const FORMS = [
  'AC Sales Order',
  'AC Sales Order - Special Order',
  'AC Sales Order_web',
  'AC Sales Order_Reg',
];

export const SOURCES = [
  'CSR - E-mail from Customer',
  'CSR - Rep Order',
  'CSR - Customer Call In',
  'Web Order',
  'Sales Rep - Inbound from Customer',
  'Trade Show Giveaways',
];

export const LOCATIONS = [
  'Main Warehouse',
  'Vista',
  'Marlow',
  'Mount Pleasant',
  'Fort Worth',
  'Carlsbad',
];

export const ORDER_STATUSES = [
  'Pending Approval',
  'Pending Fulfillment',
  'Awaiting Info/Artwork from Vendor/Graphics',
  'Awaiting Info/Approval from Customer/Rep',
  'In Production',
  'Shipped',
];

export const PRICE_LEVELS = ['1_Wholesale', '3_Gold', '4_Platinum', '10_Retail', 'Custom'];

export const RETURN_REASONS = [
  'DEFECTIVE',
  'ENTRY ERROR',
  'CARRIER ERROR',
  'CUSTOMER ERROR',
  'CUSTOMER OVERSTOCK',
  'SHIPPING CREDIT',
  'PRODUCTION ERROR',
  'OTHER',
];

export const RETURN_TYPES = ['Back to Stock', 'Return to Vendor', 'Scrap'];

export function isSpecialOrder(form: string): boolean {
  return /special order/i.test(form);
}
