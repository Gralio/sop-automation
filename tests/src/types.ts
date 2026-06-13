/** Types for the generic eval runner. Scenario authors import `Scenario` and
 * build their own check functions; the runner consumes them structurally. */
import type { WorkerEvent } from '@sop/worker/contract';

export type { WorkerEvent } from '@sop/worker/contract';

/** Snapshot returned by the mock's /api/__state — kept loose so the runner is
 * reusable against any target that exposes a JSON state endpoint. */
export type StateSnapshot = Record<string, any>;

export interface CheckContext {
  state: StateSnapshot;
  events: WorkerEvent[];
  finalText: string;
  sopPath?: string;
}

export interface CheckResult {
  name: string;
  pass: boolean;
  detail: string;
}

export type Check = (ctx: CheckContext) => CheckResult;

export interface ScenarioAttachment {
  name: string;
  path: string;
  mediaType: string;
}

export interface Scenario {
  id: string;
  name: string;
  /** The ticket text submitted to the worker. */
  ticket: string;
  attachments?: ScenarioAttachment[];
  /** Adversarial knobs applied via /api/__reset before the run. */
  adversarial?: Record<string, number | boolean>;
  /** What the eval host should do when the worker calls ask_approval. */
  approvalPolicy?: 'approve' | 'reject';
  /** Soft hint of the expected SOP (substring), for the judge only. */
  expectedSop?: string;
  /** Plain-English success criteria for the LLM judge. */
  rubric: string;
  /** Objective, deterministic checks against the resulting state. */
  checks: Check[];
  /** Per-scenario turn cap. */
  maxTurns?: number;
}

export interface JudgeVerdict {
  pass: boolean;
  score: number;
  summary: string;
  issues: string[];
  followedReasonableSop: boolean;
  askedApprovalBeforeMutation: boolean;
}

export interface ScenarioResult {
  id: string;
  name: string;
  ok: boolean;
  workerOk: boolean;
  sopPath?: string;
  turns: number;
  checks: CheckResult[];
  checksPassed: boolean;
  verdict?: JudgeVerdict;
  finalText: string;
  error?: string;
  durationMs: number;
}
