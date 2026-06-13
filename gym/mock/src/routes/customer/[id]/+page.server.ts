import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getStore } from '$lib/server/store';

export const load: PageServerLoad = async ({ params }) => {
  const store = getStore();
  const customer = store.customers.get(params.id);
  if (!customer) throw error(404, 'Customer not found');

  const salesOrders = [...store.salesOrders.values()]
    .filter((so) => so.customerId === customer.id)
    .map((so) => ({ id: so.id, status: so.status, total: so.total }));

  const invoices = [...store.invoices.values()]
    .filter((inv) => inv.customerId === customer.id)
    .map((inv) => ({ id: inv.id, total: inv.total, status: inv.status }));

  return {
    id: customer.id,
    display: customer.display,
    name: customer.name,
    email: customer.email,
    terms: customer.terms,
    balance: customer.balance,
    creditLimit: customer.creditLimit,
    daysOverdue: customer.daysOverdue,
    kind: customer.kind ?? 'standard',
    salesOrders,
    invoices,
  };
};
