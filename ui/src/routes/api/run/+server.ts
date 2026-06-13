import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startRun } from '$lib/server/runManager';
import type { Attachment } from '@sop/worker/contract';

export const POST: RequestHandler = async ({ request }) => {
  const formidable = await request.formData();
  const ticket = String(formidable.get('ticket') ?? '').trim();
  if (!ticket) throw error(400, 'ticket required');

  const files = formidable.getAll('files').filter((f): f is File => f instanceof File);
  const dir = await mkdtemp(join(tmpdir(), 'sop-attach-'));
  const attachments: Attachment[] = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const buf = Buffer.from(await f.arrayBuffer());
    const path = join(dir, f.name || `attachment_${i}`);
    await writeFile(path, buf);
    attachments.push({
      id: `att_${i}`,
      name: f.name || `attachment_${i}`,
      mediaType: f.type || 'application/octet-stream',
      path,
    });
  }

  const runId = await startRun(ticket, attachments);
  return json({ runId });
};
