import type { RequestHandler } from './$types';
import { subscribe, getRun } from '$lib/server/runManager';
import type { WorkerEvent } from '@sop/worker/contract';

export const GET: RequestHandler = ({ params }) => {
  const runId = params.id;
  if (!getRun(runId)) return new Response('no such run', { status: 404 });

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      const send = (e: WorkerEvent) => {
        controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
        if (e.type === 'run_finished') {
          try {
            controller.close();
          } catch {
            /* already closed */
          }
        }
      };
      const unsub = subscribe(runId, send);
      // store unsub for cancel
      (controller as unknown as { _unsub?: () => void })._unsub = unsub ?? undefined;
    },
    cancel() {
      // best-effort; subscriber set is cleaned on unsubscribe via closure above
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    },
  });
};
