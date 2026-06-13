import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { search } from '$lib/server/queries';
import { latency } from '$lib/server/store';

export const GET: RequestHandler = async ({ url }) => {
  await latency();
  const q = url.searchParams.get('q') ?? '';
  return json({ hits: search(q) });
};
