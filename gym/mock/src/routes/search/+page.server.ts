import type { PageServerLoad } from './$types';
import { search } from '$lib/server/queries';

export const load: PageServerLoad = async ({ url }) => {
  const q = url.searchParams.get('q') ?? '';
  const hits = search(q);
  return { q, hits };
};
