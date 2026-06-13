import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getStore } from '$lib/server/store';

export const load: PageServerLoad = async ({ params }) => {
  const store = getStore();
  const item = store.items.get(params.sku);
  if (!item) throw error(404, 'Item not found');

  return {
    sku: item.sku,
    name: item.name,
    display: item.display,
    basePrice: item.basePrice,
    isMatrix: !!item.isMatrix,
    available: item.available as Record<string, number>,
    priceLevels: item.priceLevels as Record<string, Record<string, number>>,
  };
};
