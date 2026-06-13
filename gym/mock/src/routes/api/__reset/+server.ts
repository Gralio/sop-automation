import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resetStore } from '$lib/server/store';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  resetStore(body?.adversarial);
  return json({ ok: true });
};
