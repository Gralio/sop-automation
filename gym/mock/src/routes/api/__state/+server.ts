import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getStore } from '$lib/server/store';

/** Full snapshot for test assertions. Not part of the NetSuite UI. */
export const GET: RequestHandler = async () => {
  const s = getStore();
  return json({
    salesOrders: [...s.salesOrders.values()],
    rmas: [...s.rmas.values()],
    fulfillments: [...s.fulfillments.values()],
    invoices: [...s.invoices.values()],
    creditMemos: [...s.creditMemos.values()],
    items: [...s.items.values()].map((i) => ({ sku: i.sku, priceLevels: i.priceLevels })),
  });
};
