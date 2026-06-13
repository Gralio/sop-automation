import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveApproval } from '$lib/server/runManager';

export const POST: RequestHandler = async ({ params, request }) => {
  const body = await request.json().catch(() => ({}));
  const okResolved = resolveApproval(params.id, String(body.approvalId ?? ''), {
    approved: !!body.approved,
    note: body.note ? String(body.note) : undefined,
  });
  return json({ ok: okResolved });
};
