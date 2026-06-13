import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { setAdversarial, getStore } from '$lib/server/store';

export const POST: RequestHandler = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  setAdversarial(body ?? {});
  return json({ ok: true, adversarial: getStore().adversarial });
};

export const GET: RequestHandler = async () => json(getStore().adversarial);
