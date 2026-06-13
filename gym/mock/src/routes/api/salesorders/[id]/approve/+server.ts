import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { approveSalesOrder } from '$lib/server/queries';
import { latency, shouldTransientlyFail } from '$lib/server/store';

export const POST: RequestHandler = async ({ params, request }) => {
  const body = await request.json().catch(() => ({}));
  await latency();
  if (shouldTransientlyFail(String(body?.formToken ?? ''))) {
    return json({ ok: false, error: 'Unexpected error. Please try again.' }, { status: 503 });
  }
  const so = approveSalesOrder(params.id);
  if (!so) return json({ ok: false, error: 'Sales order not found.' }, { status: 404 });
  return json({ ok: true, salesOrder: so });
};
