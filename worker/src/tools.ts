/**
 * The worker's custom tools, built on the Claude Agent SDK's `tool()` + an
 * in-process MCP server. Four tools:
 *   - browser       run Python against the live Chrome (returns text + screenshot)
 *   - select_sop    declare which SOP is being followed (drives the UI panel)
 *   - send_to_user  verbatim user-facing content
 *   - ask_approval  human sign-off gate before a mutation
 *
 * The three "semantic" tools emit dedicated WorkerEvents directly; the browser
 * tool is rendered by the host as a normal (collapsed) tool call.
 */
import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { z } from 'zod';
import { tool, createSdkMcpServer } from '@anthropic-ai/claude-agent-sdk';
import type { McpSdkServerConfigWithInstance } from '@anthropic-ai/claude-agent-sdk';
import type { BrowserConfig, WorkerHost } from './contract.js';
import { runPython } from './browserHarness.js';

export const SERVER_NAME = 'sop';
export const SEMANTIC_TOOLS = new Set([
  `mcp__${SERVER_NAME}__send_to_user`,
  `mcp__${SERVER_NAME}__ask_approval`,
  `mcp__${SERVER_NAME}__select_sop`,
]);

export interface WorkerToolsContext {
  browser: BrowserConfig;
  workDir: string;
  sopDir: string;
  host: WorkerHost;
  /** Set by the worker when it selects an SOP, so the result can be summarized. */
  onSopSelected?: (path: string) => void;
}

function firstHeading(markdown: string, fallback: string): string {
  const m = markdown.match(/^#\s+(.+)$/m);
  return m?.[1]?.trim() ?? fallback;
}

let approvalSeq = 0;

export function createWorkerMcpServer(ctx: WorkerToolsContext): McpSdkServerConfigWithInstance {
  const browserTool = tool(
    'browser',
    'Run a Python snippet against the live Chrome browser to observe and operate the target system. Helpers (new_tab, goto_url, wait_for_load, page_info, capture_screenshot, click_at_xy, type_text, fill_input, press_key, scroll, js, wait_for_element, wait_for_network_idle, upload_file) are pre-imported. A screenshot of the viewport is captured automatically after your code runs and returned to you, unless screenshot=false. Use print() to surface values.',
    {
      code: z.string().describe('Python to execute in the browser-harness session.'),
      screenshot: z
        .boolean()
        .optional()
        .describe('Capture and return a screenshot after running (default true).'),
    },
    async (args) => {
      const result = await runPython({
        code: args.code,
        screenshot: args.screenshot ?? true,
        browser: ctx.browser,
        workDir: ctx.workDir,
      });
      const content: Array<
        { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }
      > = [{ type: 'text', text: result.text }];
      if (result.screenshotBase64) {
        content.push({ type: 'image', data: result.screenshotBase64, mimeType: 'image/png' });
      }
      return { content, isError: result.isError };
    },
  );

  const selectSopTool = tool(
    'select_sop',
    'Declare which Standard Operating Procedure you are following. Call this as soon as you have chosen the best-matching SOP, and again if you switch. The requester sees the rendered SOP.',
    {
      path: z.string().describe('Absolute or catalog-relative path to the SOP markdown file.'),
      reason: z.string().describe('One sentence on why this SOP matches the ticket.'),
    },
    async (args) => {
      let markdown: string;
      try {
        markdown = await readFile(args.path, 'utf8');
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Could not read SOP at ${args.path}: ${(err as Error).message}` }],
          isError: true,
        };
      }
      const title = firstHeading(markdown, basename(args.path));
      ctx.onSopSelected?.(args.path);
      await ctx.host.onEvent({ type: 'sop_selected', path: args.path, title, markdown });
      return {
        content: [
          { type: 'text', text: `Now following SOP: ${title} (${args.path}). Follow its steps; adapt as the live UI requires.` },
        ],
      };
    },
  );

  const sendToUserTool = tool(
    'send_to_user',
    'Show the requester content they must read verbatim — your final answer, a partial deliverable, or a genuine question you need answered. Not for narration or internal reasoning.',
    { content: z.string().describe('The exact content to show the requester.') },
    async (args) => {
      await ctx.host.onEvent({ type: 'send_to_user', content: args.content });
      return { content: [{ type: 'text', text: 'Delivered to the requester.' }] };
    },
  );

  const askApprovalTool = tool(
    'ask_approval',
    'Request human approval BEFORE submitting a mutation (saving/creating/finalizing a record, approving, posting a refund or payment). Provide a precise summary of exactly what you will do. Blocks until answered. If denied, stop the task.',
    {
      summary: z.string().describe('Precise, specific description of the mutation you are about to commit.'),
      details: z.string().optional().describe('Optional extra detail (record, field values).'),
    },
    async (args) => {
      const id = `appr_${++approvalSeq}`;
      await ctx.host.onEvent({ type: 'approval_request', id, summary: args.summary, details: args.details });
      const decision = await ctx.host.requestApproval({ id, summary: args.summary, details: args.details });
      await ctx.host.onEvent({
        type: 'approval_resolved',
        id,
        approved: decision.approved,
        note: decision.note,
      });
      const verdict = decision.approved
        ? `APPROVED. Proceed.${decision.note ? ` Note: ${decision.note}` : ''}`
        : `REJECTED. Do NOT perform this action; stop the task.${decision.note ? ` Reason: ${decision.note}` : ''}`;
      return { content: [{ type: 'text', text: verdict }] };
    },
  );

  return createSdkMcpServer({
    name: SERVER_NAME,
    version: '0.1.0',
    tools: [browserTool, selectSopTool, sendToUserTool, askApprovalTool],
  });
}
