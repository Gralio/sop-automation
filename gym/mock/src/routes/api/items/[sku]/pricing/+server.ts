import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { updateItemPricing } from '$lib/server/queries';
import { getStore, latency, shouldTransientlyFail } from '$lib/server/store';

export const POST: RequestHandler = async ({ params, request }) => {
  const body = await request.json().catch(() => ({}));
  await latency();
  const item = getStore().items.get(params.sku);
  if (!item) return json({ ok: false, error: 'Item not found.' }, { status: 404 });

  // Matrix items require the Update Matrix mass action — a plain save must not
  // persist them (the worker has to discover this from the SOP + the UI).
  if (item.isMatrix && !body?.matrix) {
    return json(
      { ok: false, error: 'This is a matrix item. Use Actions > Update Matrix.' },
      { status: 409 },
    );
  }
  if (body?.matrix) {
    // Update Matrix requires all base price levels populated, else "missing price(s)".
    const levels = body?.priceLevels ?? {};
    const hasAll = ['1_Wholesale', '3_Gold', '4_Platinum', '10_Retail'].every(
      (l) => levels[l] && Object.keys(levels[l]).length > 0,
    );
    if (!hasAll) {
      return json({ ok: false, error: 'Please enter missing price(s).' }, { status: 422 });
    }
  }
  if (shouldTransientlyFail(String(body?.formToken ?? ''))) {
    return json({ ok: false, error: 'Unexpected error. Please try again.' }, { status: 503 });
  }
  updateItemPricing(params.sku, body?.priceLevels ?? {});
  return json({ ok: true, massUpdate: !!body?.matrix });
};
