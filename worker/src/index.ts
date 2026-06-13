/**
 * runWorker — drive the Claude Agent SDK (Sonnet) through a single ticket,
 * translating the SDK message stream into normalized WorkerEvents and gating
 * mutations through the host's approval callback.
 */
import { cp, mkdir, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type {
  Options,
  SDKMessage,
  SDKUserMessage,
  PermissionResult,
} from '@anthropic-ai/claude-agent-sdk';
import type { Attachment, RunWorkerOptions, RunWorkerResult, WorkerHost } from './contract.js';
import { buildSystemPrompt } from './prompt.js';
import { buildInitialContent } from './attachments.js';
import {
  createWorkerMcpServer,
  SERVER_NAME,
  SEMANTIC_TOOLS,
  type WorkerToolsContext,
} from './tools.js';
import { warmUp } from './browserHarness.js';

export type { RunWorkerOptions, RunWorkerResult, WorkerHost } from './contract.js';
export * from './contract.js';

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const DEFAULT_MAX_TURNS = 80;

function previewToolResult(content: unknown): { text: string; isError: boolean } {
  // content is string | Array<{type, text?, content?, is_error?}>
  if (typeof content === 'string') return { text: content.slice(0, 600), isError: false };
  if (!Array.isArray(content)) return { text: '', isError: false };
  const parts: string[] = [];
  let isError = false;
  for (const block of content as Array<Record<string, unknown>>) {
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text);
    else if (block.type === 'image') parts.push('[screenshot]');
    else if (block.type === 'tool_result') {
      const inner = previewToolResult(block.content);
      parts.push(inner.text);
      if (block.is_error) isError = true;
    }
    if (block.is_error) isError = true;
  }
  return { text: parts.join('\n').slice(0, 600), isError };
}

export async function runWorker(
  opts: RunWorkerOptions,
  host: WorkerHost,
): Promise<RunWorkerResult> {
  const abortController = new AbortController();
  if (opts.abortSignal) {
    if (opts.abortSignal.aborted) abortController.abort();
    else opts.abortSignal.addEventListener('abort', () => abortController.abort(), { once: true });
  }

  // ── Isolation ──────────────────────────────────────────────────────────
  // Run inside a fresh throwaway directory in the OS temp area, never the
  // caller's repo. Copy the SOP catalog (and any attachments) into it so the
  // worker reads them from a neutral location and has no clue where its own
  // code — or the real SOP catalog — lives. cwd + the only readable directory
  // are this temp dir, so Read/Glob/Grep cannot escape it.
  const runDir = await mkdtemp(join(opts.workDir ?? tmpdir(), 'sop-run-'));
  const runSopDir = join(runDir, 'sops');
  await cp(opts.sopDir, runSopDir, { recursive: true });

  const attachments: Attachment[] = [];
  for (const a of opts.attachments ?? []) {
    const dest = join(runDir, 'attachments', a.name);
    await mkdir(dirname(dest), { recursive: true });
    await cp(a.path, dest);
    attachments.push({ ...a, path: dest });
  }

  let sopPath: string | undefined;
  const toolCtx: WorkerToolsContext = {
    browser: opts.browser,
    workDir: runDir,
    sopDir: runSopDir,
    host,
    onSopSelected: (p) => {
      sopPath = p;
    },
  };
  const mcpServer = createWorkerMcpServer(toolCtx);

  await host.onEvent({ type: 'run_started', ticket: opts.ticket, attachments });

  // Warm the browser harness so the first real tool call isn't slow.
  try {
    await warmUp(opts.browser);
  } catch {
    // non-fatal; the first browser call will surface any real problem.
  }

  const options: Options = {
    systemPrompt: buildSystemPrompt({ sopDir: runSopDir, targetUrl: opts.targetUrl }),
    model: opts.model ?? DEFAULT_MODEL,
    cwd: runDir,
    // The isolated temp dir is the ONLY place the worker can read — it contains
    // the copied SOP catalog and attachments and nothing else.
    additionalDirectories: [runDir],
    maxTurns: opts.maxTurns ?? DEFAULT_MAX_TURNS,
    // Keep the worker's context clean & generic: no user/project settings, no
    // CLAUDE.md memory leakage, a tight built-in tool set.
    settingSources: [],
    tools: ['Read', 'Glob', 'Grep'],
    mcpServers: { [SERVER_NAME]: mcpServer },
    allowedTools: [
      'Read',
      'Glob',
      'Grep',
      `mcp__${SERVER_NAME}__browser`,
      `mcp__${SERVER_NAME}__select_sop`,
      `mcp__${SERVER_NAME}__send_to_user`,
      `mcp__${SERVER_NAME}__ask_approval`,
    ],
    abortController,
    includePartialMessages: false,
    // Single gate: auto-allow tool execution. Human-in-the-loop happens via the
    // explicit ask_approval tool, per spec.
    canUseTool: async (): Promise<PermissionResult> => ({ behavior: 'allow' }),
  };

  // Build the prompt. Plain text when there are no images; a streaming user
  // message (single-shot) when we need native multimodal image blocks.
  const content = await buildInitialContent(opts.ticket, attachments);
  const hasImage = content.some((b) => b.type === 'image');
  let prompt: string | AsyncIterable<SDKUserMessage>;
  if (!hasImage) {
    prompt = content.map((b) => (b.type === 'text' ? b.text : '')).join('\n\n');
  } else {
    prompt = (async function* () {
      yield {
        type: 'user',
        parent_tool_use_id: null,
        message: { role: 'user', content: content as never },
      } satisfies SDKUserMessage;
    })();
  }

  const toolNames = new Map<string, string>();
  let finalText = '';
  let turns = 0;
  let ok = false;

  try {
    for await (const msg of query({ prompt, options }) as AsyncIterable<SDKMessage>) {
      if (abortController.signal.aborted) break;
      if (msg.type === 'assistant') {
        for (const block of msg.message.content) {
          if (block.type === 'text' && block.text.trim()) {
            await host.onEvent({ type: 'assistant_text', text: block.text });
          } else if (block.type === 'tool_use') {
            toolNames.set(block.id, block.name);
            if (!SEMANTIC_TOOLS.has(block.name)) {
              await host.onEvent({
                type: 'tool_use',
                id: block.id,
                name: block.name,
                input: block.input,
              });
            }
          }
        }
      } else if (msg.type === 'user') {
        const mc = msg.message.content;
        if (Array.isArray(mc)) {
          for (const block of mc as unknown as Array<Record<string, unknown>>) {
            if (block.type === 'tool_result') {
              const id = String(block.tool_use_id ?? '');
              const name = toolNames.get(id) ?? '';
              if (SEMANTIC_TOOLS.has(name)) continue;
              const { text, isError } = previewToolResult(block.content);
              await host.onEvent({ type: 'tool_result', id, name, isError, preview: text });
            }
          }
        }
      } else if (msg.type === 'result') {
        turns = msg.num_turns;
        if (msg.subtype === 'success') {
          finalText = msg.result;
          ok = !msg.is_error;
        } else {
          ok = false;
          await host.onEvent({
            type: 'error',
            message: `Run ended: ${msg.subtype}`,
          });
        }
      }
    }
    if (finalText.trim()) await host.onEvent({ type: 'final', text: finalText });
  } catch (err) {
    await host.onEvent({ type: 'error', message: (err as Error).message });
    ok = false;
  }

  await host.onEvent({ type: 'run_finished', ok });
  return { ok, finalText, sopPath, turns };
}
