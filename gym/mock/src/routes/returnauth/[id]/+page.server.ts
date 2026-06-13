import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getStore } from '$lib/server/store';

export const load: PageServerLoad = async ({ params }) => {
  const store = getStore();
  const rma = store.rmas.get(params.id);
  if (!rma) throw error(404, 'Return authorization not found');

  const customer = store.customers.get(rma.customerId);

  return {
    id: rma.id,
    customerId: rma.customerId,
    customerDisplay: customer ? customer.display : rma.customerId,
    fromSalesOrder: rma.fromSalesOrder ?? null,
    reason: rma.reason,
    returnType: rma.returnType,
    comments: rma.comments,
    status: rma.status,
    creditMemoId: rma.creditMemoId ?? null,
    lines: rma.lines.map((l) => ({
      sku: l.sku,
      description: l.description,
      qty: l.qty,
      rate: l.rate,
      amount: l.amount,
    })),
    subtotal: rma.subtotal,
    total: rma.total,
  };
};
