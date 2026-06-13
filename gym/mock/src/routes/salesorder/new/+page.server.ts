import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getStore } from '$lib/server/store';

export const load: PageServerLoad = async ({ url }) => {
  const entity = url.searchParams.get('entity');
  const store = getStore();
  const customer = entity ? store.customers.get(entity) : undefined;
  if (entity && !customer) throw error(404, 'Customer not found');

  // Items (with pricing + availability) so the client can compute rates and
  // surface availability warnings the way NetSuite does.
  const items = [...store.items.values()].map((i) => ({
    sku: i.sku,
    name: i.name,
    display: i.display,
    basePrice: i.basePrice,
    available: i.available,
    priceLevels: i.priceLevels,
    isService: !!i.isService,
  }));

  return {
    customer: customer
      ? {
          id: customer.id,
          display: customer.display,
          name: customer.name,
          email: customer.email,
          terms: customer.terms,
          balance: customer.balance,
          creditLimit: customer.creditLimit,
          daysOverdue: customer.daysOverdue,
          kind: customer.kind,
        }
      : null,
    items,
  };
};
