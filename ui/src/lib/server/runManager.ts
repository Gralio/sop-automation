/**
 * Server-side run manager. Each chat submission starts a worker run; its
 * WorkerEvents are buffered and fanned out to SSE subscribers, and ask_approval
 * is resolved by an HTTP callback correlated by approval id.
 */
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { runWorker } from '@sop/worker';
import type {
  ApprovalDecision,
  ApprovalRequest,
  Attachment,
  WorkerEvent,
  WorkerHost,
} from '@sop/worker/contract';

interface Run {
  id: string;
  events: WorkerEvent[];
  subscribers: Set<(e: WorkerEvent) => void>;
  pending: Map<string, (d: ApprovalDecision) => void>;
  done: boolean;
}

const runs = new Map<string, Run>();

export interface TargetConfig {
  targetUrl: string;
  sopDir: string;
  cdpUrl: string;
  harnessDir: string;
  buName: string;
  model?: string;
}

export function targetConfig(): TargetConfig {
  const repoRoot = process.env.SOP_REPO_ROOT ?? process.cwd();
  return {
    targetUrl: process.env.TARGET_URL ?? 'http://127.0.0.1:5180',
    sopDir: process.env.SOP_DIR ?? join(repoRoot, 'inputs/sops'),
    cdpUrl: process.env.CDP_URL ?? 'http://127.0.0.1:9222',
    harnessDir: process.env.HARNESS_DIR ?? join(repoRoot, 'vendor/browser-harness'),
    buName: process.env.BU_NAME ?? 'ui',
    model: process.env.MODEL || undefined,
  };
}

export function getRun(id: string): Run | undefined {
  return runs.get(id);
}

export async function startRun(ticket: string, attachments: Attachment[]): Promise<string> {
  const id = randomUUID();
  const run: Run = { id, events: [], subscribers: new Set(), pending: new Map(), done: false };
  runs.set(id, run);

  const host: WorkerHost = {
    onEvent(e: WorkerEvent) {
      run.events.push(e);
      for (const sub of run.subscribers) sub(e);
    },
    requestApproval(req: ApprovalRequest): Promise<ApprovalDecision> {
      return new Promise<ApprovalDecision>((resolve) => {
        run.pending.set(req.id, resolve);
      });
    },
  };

  // Deterministic demo path for UI tests — exercises the full plumbing
  // (SSE + approval round-trip) without a live browser or model.
  if (ticket.trim() === '/demo') {
    void runDemo(host).finally(() => {
      run.done = true;
      run.pending.clear();
    });
    return id;
  }

  const cfg = targetConfig();
  const workDir = await mkdtemp(join(tmpdir(), `sop-ui-${id}-`));

  // Fire and forget; events stream as they happen.
  void runWorker(
    {
      ticket,
      attachments,
      sopDir: cfg.sopDir,
      targetUrl: cfg.targetUrl,
      workDir,
      browser: { cdpUrl: cfg.cdpUrl, buName: cfg.buName, harnessDir: cfg.harnessDir },
      model: cfg.model,
    },
    host,
  )
    .catch((err) => {
      host.onEvent({ type: 'error', message: (err as Error).message });
      host.onEvent({ type: 'run_finished', ok: false });
    })
    .finally(() => {
      run.done = true;
      // Auto-resolve any dangling approvals so the worker can't hang forever.
      for (const [, resolve] of run.pending) resolve({ approved: false, note: 'run ended' });
      run.pending.clear();
    });

  return id;
}

const DEMO_SOP = `# SOP: B2B Sales Order Entry\n\n## Steps\n1. Search for the customer.\n2. Create a sales order and fill the header.\n3. Add the requested line items.\n4. Save, then approve.`;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Canned event sequence for deterministic UI tests (ticket "/demo"). */
async function runDemo(host: WorkerHost): Promise<void> {
  await host.onEvent({ type: 'run_started', ticket: '/demo', attachments: [] });
  await wait(50);
  await host.onEvent({ type: 'assistant_text', text: 'Looking for the right SOP…' });
  await host.onEvent({ type: 'tool_use', id: 't1', name: 'Glob', input: { pattern: '*.md' } });
  await host.onEvent({
    type: 'tool_result',
    id: 't1',
    name: 'Glob',
    isError: false,
    preview: 'B2B_Sales_Order_Entry__Base_Process.md',
  });
  await host.onEvent({
    type: 'sop_selected',
    path: '/sops/B2B.md',
    title: 'SOP: B2B Sales Order Entry',
    markdown: DEMO_SOP,
  });
  await host.onEvent({
    type: 'tool_use',
    id: 't2',
    name: 'browser',
    input: { code: 'new_tab("…")' },
  });
  await host.onEvent({
    type: 'tool_result',
    id: 't2',
    name: 'browser',
    isError: false,
    preview: '[screenshot]',
  });
  await host.onEvent({
    type: 'send_to_user',
    content: 'I found the customer and filled the order. Requesting approval before saving.',
  });
  const approval = {
    id: 'appr_1',
    summary: 'Save sales order for THE Builders of Nevada with 2 lines (13828 x200, 13020 x50).',
  };
  await host.onEvent({ type: 'approval_request', ...approval });
  const decision = await host.requestApproval(approval);
  await host.onEvent({
    type: 'approval_resolved',
    id: 'appr_1',
    approved: decision.approved,
    note: decision.note,
  });
  if (decision.approved) {
    await host.onEvent({
      type: 'tool_use',
      id: 't3',
      name: 'browser',
      input: { code: 'click Save' },
    });
    await host.onEvent({
      type: 'tool_result',
      id: 't3',
      name: 'browser',
      isError: false,
      preview: 'SO527901 saved',
    });
    await host.onEvent({
      type: 'final',
      text: '**Done.** Sales order **SO527901** created and approved (Pending Fulfillment).',
    });
  } else {
    await host.onEvent({ type: 'final', text: 'Stopped — approval was rejected.' });
  }
  await host.onEvent({ type: 'run_finished', ok: decision.approved });
}

export function resolveApproval(
  runId: string,
  approvalId: string,
  decision: ApprovalDecision,
): boolean {
  const run = runs.get(runId);
  const resolver = run?.pending.get(approvalId);
  if (!run || !resolver) return false;
  run.pending.delete(approvalId);
  resolver(decision);
  return true;
}

export function subscribe(runId: string, cb: (e: WorkerEvent) => void): (() => void) | null {
  const run = runs.get(runId);
  if (!run) return null;
  for (const e of run.events) cb(e); // replay
  run.subscribers.add(cb);
  return () => run.subscribers.delete(cb);
}
