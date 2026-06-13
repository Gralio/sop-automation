/**
 * The contract between the worker and its host (the chat UI server, or the eval
 * runner). The worker emits a normalized stream of {@link WorkerEvent}s and calls
 * back into the host for human approval. Both hosts implement {@link WorkerHost}.
 *
 * This file is the source of truth referenced by CLAUDE.md. It deliberately has
 * NO dependency on the Claude Agent SDK so the UI/tests can import it cheaply.
 */

/** A file the user attached to the ticket (image, Excel, PDF, …). */
export interface Attachment {
  /** Stable id within a run. */
  id: string;
  /** Original filename, e.g. "order.xlsx". */
  name: string;
  /** MIME type, e.g. "image/png", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet". */
  mediaType: string;
  /** Absolute path on disk where the worker can read the bytes. */
  path: string;
}

/**
 * A normalized event emitted by the worker as it runs. The UI groups the
 * "internal" events (text/tool_use/tool_result) into collapsed expandable
 * sections; `send_to_user` and `final` break out as visible messages.
 */
export type WorkerEvent =
  | { type: 'run_started'; ticket: string; attachments: Attachment[] }
  /** Assistant narration / thinking. Collapsed by default in the UI. */
  | { type: 'assistant_text'; text: string }
  /** The worker invoked a tool. Collapsed by default. */
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  /** Result returned to the worker from a tool. Collapsed by default. */
  | { type: 'tool_result'; id: string; name: string; isError: boolean; preview: string }
  /** The worker has chosen / switched the SOP it is following. The UI renders this SOP as markdown. */
  | { type: 'sop_selected'; path: string; title: string; markdown: string }
  /** Verbatim, user-facing content. Always visible. */
  | { type: 'send_to_user'; content: string }
  /** The worker is requesting human approval before a mutation. The UI must resolve this. */
  | { type: 'approval_request'; id: string; summary: string; details?: string }
  /** Resolution of a prior approval request. */
  | { type: 'approval_resolved'; id: string; approved: boolean; note?: string }
  /** The worker's final message before it stops. Always visible. */
  | { type: 'final'; text: string }
  /** A run-level error. */
  | { type: 'error'; message: string }
  /** The run finished (success or aborted). */
  | { type: 'run_finished'; ok: boolean };

export interface ApprovalRequest {
  id: string;
  summary: string;
  details?: string;
}

export interface ApprovalDecision {
  approved: boolean;
  /** Optional note relayed back to the worker (e.g. why it was rejected). */
  note?: string;
}

/**
 * Implemented by whatever hosts the worker. The UI streams events to the
 * browser and prompts the user for approvals; the eval runner records events
 * and auto-approves per policy.
 */
export interface WorkerHost {
  onEvent(event: WorkerEvent): void | Promise<void>;
  /** Block until a human (or policy) approves/rejects the mutation. */
  requestApproval(req: ApprovalRequest): Promise<ApprovalDecision>;
}

/** Where the worker controls its browser (a dedicated Chrome on a debug port). */
export interface BrowserConfig {
  /** DevTools HTTP endpoint, e.g. "http://127.0.0.1:9222" (BU_CDP_URL). */
  cdpUrl: string;
  /** Daemon namespace so parallel runs don't collide (BU_NAME). */
  buName: string;
  /** Absolute path to the vendored browser-harness checkout. */
  harnessDir: string;
}

export interface RunWorkerOptions {
  /** The ticket / instruction the user submitted. */
  ticket: string;
  /** Optional attachments (Excel, images, …) the worker may read. */
  attachments?: Attachment[];
  /** Directory of SOP markdown files the worker is mandated to follow. */
  sopDir: string;
  /** URL of the target system (the mock ERP). Allowed in prompt context per spec. */
  targetUrl: string;
  /** Browser control configuration. */
  browser: BrowserConfig;
  /** Scratch directory for screenshots, decoded attachments, etc. */
  workDir: string;
  /** Driving model. Defaults to Sonnet (claude-sonnet-4-6). */
  model?: string;
  /** Hard cap on agent turns. */
  maxTurns?: number;
  /** Abort the run early. */
  abortSignal?: AbortSignal;
}

export interface RunWorkerResult {
  ok: boolean;
  finalText: string;
  /** The SOP the worker settled on, if any. */
  sopPath?: string;
  /** Number of agent turns consumed. */
  turns: number;
}
