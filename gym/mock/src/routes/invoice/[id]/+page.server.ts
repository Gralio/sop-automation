import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getStore } from '$lib/server/store';

export const load: PageServerLoad = async ({ params }) => {
  const store = getStore();
  const invoice = store.invoices.get(params.id);
  if (!invoice) throw error(404, 'Invoice not found');

  const customer = store.customers.get(invoice.customerId);

  return {
    id: invoice.id,
    total: invoice.total,
    status: invoice.status,
    customerId: invoice.customerId,
    customerDisplay: customer ? customer.display : invoice.customerId,
    salesOrderId: invoice.salesOrderId,
  };
};
