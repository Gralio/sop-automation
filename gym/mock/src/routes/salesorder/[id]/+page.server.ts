import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getStore } from '$lib/server/store';

export const load: PageServerLoad = async ({ params }) => {
  const store = getStore();
  const so = store.salesOrders.get(params.id);
  if (!so) throw error(404, 'Sales order not found');

  const customer = store.customers.get(so.customerId);

  const fulfillments = [...store.fulfillments.values()]
    .filter((f) => f.salesOrderId === so.id)
    .map((f) => ({
      id: f.id,
      status: f.status,
      trackingNumber: f.trackingNumber ?? '',
      packageWeight: f.packageWeight ?? '',
    }));

  const invoices = [...store.invoices.values()]
    .filter((inv) => inv.salesOrderId === so.id)
    .map((inv) => ({ id: inv.id, total: inv.total, status: inv.status }));

  return {
    id: so.id,
    customerId: so.customerId,
    customerDisplay: customer ? customer.display : so.customerId,
    form: so.form,
    orderPlacedBy: so.orderPlacedBy,
    poRef: so.poRef,
    source: so.source,
    location: so.location,
    memo: so.memo,
    status: so.status,
    lines: so.lines.map((l) => ({
      sku: l.sku,
      description: l.description,
      qty: l.qty,
      rate: l.rate,
      amount: l.amount,
      imprintText: l.imprintText ?? '',
      imprintColor: l.imprintColor ?? '',
    })),
    subtotal: so.subtotal,
    total: so.total,
    fulfillments,
    invoices,
  };
};
