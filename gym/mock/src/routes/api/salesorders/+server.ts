import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createSalesOrder, type NewSalesOrderInput } from '$lib/server/queries';
import { latency, shouldTransientlyFail } from '$lib/server/store';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json();
  await latency();
  if (shouldTransientlyFail(String(body?.formToken ?? ''))) {
    return json({ ok: false, error: 'Unexpected error. Please try again.' }, { status: 503 });
  }
  const input = body?.input as NewSalesOrderInput;
  const so = createSalesOrder(input);
  return json({ ok: true, salesOrder: so });
};
