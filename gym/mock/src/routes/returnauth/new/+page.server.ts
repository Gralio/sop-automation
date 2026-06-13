import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getStore } from '$lib/server/store';

export const load: PageServerLoad = async ({ url }) => {
  const fromSO = url.searchParams.get('fromSO');
  const store = getStore();

  if (!fromSO) {
    return { fromSO: null, customer: null, lines: [] };
  }

  const so = store.salesOrders.get(fromSO);
  if (!so) throw error(404, 'Sales order not found');

  const customer = store.customers.get(so.customerId);

  return {
    fromSO: so.id,
    customer: customer
      ? { id: customer.id, display: customer.display }
      : { id: so.customerId, display: so.customerId },
    lines: so.lines.map((l) => ({
      sku: l.sku,
      description: l.description,
      qty: l.qty,
      rate: l.rate,
      amount: l.amount,
      priceLevel: l.priceLevel,
    })),
  };
};
