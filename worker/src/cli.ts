/**
 * Headless CLI for the worker — useful for smoke tests and manual runs.
 *
 *   tsx src/cli.ts --ticket "..." --url http://127.0.0.1:5180 \
 *     --sop-dir /abs/sops --cdp-url http://127.0.0.1:9222 --work-dir /tmp/run1 \
 *     [--attach /abs/file.xlsx ...] [--model claude-sonnet-4-6] [--reject-approvals]
 *
 * Events stream to stderr as a readable log; the final text prints to stdout.
 */
import { basename } from 'node:path';
import { runWorker } from './index.js';
import type { Attachment, ApprovalDecision, WorkerEvent, WorkerHost } from './contract.js';

function parseArgs(argv: string[]): Record<string, string | string[] | boolean> {
  const out: Record<string, string | string[] | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a || !a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[key] = true;
    } else if (key === 'attach') {
      out.attach = Array.isArray(out.attach) ? [...(out.attach as string[]), next] : [next];
      i++;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function guessMime(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    csv: 'text/csv',
    pdf: 'application/pdf',
  };
  return map[ext] ?? 'application/octet-stream';
}

const args = parseArgs(process.argv.slice(2));
const ticket = String(args.ticket ?? '');
if (!ticket) {
  console.error('Missing --ticket');
  process.exit(2);
}
const attachPaths = (Array.isArray(args.attach) ? args.attach : args.attach ? [String(args.attach)] : []) as string[];
const attachments: Attachment[] = attachPaths.map((p, i) => ({
  id: `att_${i}`,
  name: basename(p),
  mediaType: guessMime(p),
  path: p,
}));

const rejectApprovals = args['reject-approvals'] === true;

const host: WorkerHost = {
  onEvent(e: WorkerEvent) {
    switch (e.type) {
      case 'sop_selected':
        process.stderr.write(`\n📄 SOP: ${e.title} (${e.path})\n`);
        break;
      case 'tool_use':
        process.stderr.write(`  ⚙️  ${e.name} ${JSON.stringify(e.input).slice(0, 200)}\n`);
        break;
      case 'tool_result':
        process.stderr.write(`     ↳ ${e.isError ? '⚠️ ' : ''}${e.preview.replace(/\n/g, ' ').slice(0, 200)}\n`);
        break;
      case 'assistant_text':
        process.stderr.write(`💭 ${e.text.slice(0, 400)}\n`);
        break;
      case 'send_to_user':
        process.stderr.write(`\n📨 SEND_TO_USER:\n${e.content}\n`);
        break;
      case 'approval_request':
        process.stderr.write(`\n🔐 APPROVAL: ${e.summary}\n`);
        break;
      case 'approval_resolved':
        process.stderr.write(`   → ${e.approved ? 'APPROVED' : 'REJECTED'}\n`);
        break;
      case 'error':
        process.stderr.write(`\n❌ ${e.message}\n`);
        break;
      case 'run_finished':
        process.stderr.write(`\n${e.ok ? '✅ done' : '⛔ ended (not ok)'}\n`);
        break;
    }
  },
  async requestApproval(): Promise<ApprovalDecision> {
    return rejectApprovals
      ? { approved: false, note: 'auto-rejected by CLI flag' }
      : { approved: true };
  },
};

const result = await runWorker(
  {
    ticket,
    attachments,
    sopDir: String(args['sop-dir'] ?? ''),
    targetUrl: String(args.url ?? ''),
    workDir: String(args['work-dir'] ?? process.cwd()),
    browser: {
      cdpUrl: String(args['cdp-url'] ?? 'http://127.0.0.1:9222'),
      buName: String(args['bu-name'] ?? 'sop-worker'),
      harnessDir: String(args['harness-dir'] ?? ''),
    },
    model: args.model ? String(args.model) : undefined,
    maxTurns: args['max-turns'] ? Number(args['max-turns']) : undefined,
  },
  host,
);

process.stdout.write(`\n${result.finalText}\n`);
process.exit(result.ok ? 0 : 1);
