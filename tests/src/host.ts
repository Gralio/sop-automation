/** Eval host: records every WorkerEvent and resolves approvals by policy.
 * Mirrors the contract the UI implements, so the worker can't tell it's under test. */
import type {
  ApprovalDecision,
  ApprovalRequest,
  WorkerEvent,
  WorkerHost,
} from '@sop/worker/contract';

export class RecordingHost implements WorkerHost {
  readonly events: WorkerEvent[] = [];
  approvalsRequested = 0;
  private readonly policy: 'approve' | 'reject';
  private readonly log: boolean;

  constructor(policy: 'approve' | 'reject' = 'approve', log = false) {
    this.policy = policy;
    this.log = log;
  }

  onEvent(event: WorkerEvent): void {
    this.events.push(event);
    if (!this.log) return;
    if (event.type === 'sop_selected') process.stderr.write(`  📄 SOP: ${event.title}\n`);
    else if (event.type === 'tool_use')
      process.stderr.write(`  ⚙️  ${event.name} ${JSON.stringify(event.input).slice(0, 140)}\n`);
    else if (event.type === 'tool_result')
      process.stderr.write(
        `     ↳ ${event.isError ? '⚠️ ' : ''}${event.preview.replace(/\s+/g, ' ').slice(0, 140)}\n`,
      );
    else if (event.type === 'send_to_user')
      process.stderr.write(`  📨 ${event.content.slice(0, 200)}\n`);
    else if (event.type === 'approval_request')
      process.stderr.write(`  🔐 ${event.summary.slice(0, 160)}\n`);
    else if (event.type === 'error') process.stderr.write(`  ❌ ${event.message}\n`);
  }

  async requestApproval(_req: ApprovalRequest): Promise<ApprovalDecision> {
    this.approvalsRequested += 1;
    return this.policy === 'approve'
      ? { approved: true }
      : { approved: false, note: 'Rejected by reviewer for this test.' };
  }
}
