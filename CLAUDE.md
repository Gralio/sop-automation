# SOP Automation — project guide

A Claude Agent SDK tool that proves you can **automate observed, screen-based back-office work**
and validate it against a generated, browser-agent-hostile mock environment.

- **Solution builder** = Claude Opus (orchestrates this repo).
- **Agentic worker** = Claude Sonnet. Receives a ticket, finds the right SOP from a catalog,
  follows the process in a real Chrome browser, and stops for human approval before mutations.

The worker explores and adapts. It is **not** scripted.

## The one rule that matters most

**The worker has NO prior knowledge of the task or the environment.** It must rediscover how to
solve every ticket, every time, from (a) the ticket, (b) the SOP catalog, and (c) what it sees in
the browser. Therefore:

- `worker/` system prompts contain ONLY generic instructions about the worker's nature, tools, and
  obligations (follow the SOP, ask approval before mutations, verify your work). **Never** encode a
  specific customer, SKU, field name, URL path, click coordinate, selector, or per-SOP recipe.
- The mock is **adversarial by construction** (latency, flaky saves, modals, pagination, near-
  duplicate records, conditional fields). Whoever implements the worker must NOT be told the traps.
  The worker handles adversity generically (retry, dismiss, paginate, disambiguate, re-observe).
- If a test only passes because the worker "knows" something specific, that's a bug in the worker.
  Fix it generically.

## Architecture

```
ticket + attachments ─▶ worker (Claude Sonnet, Agent SDK)
                          │  tools: browser, send_to_user, ask_approval, + built-ins (Read/Bash)
                          ▼
                 browser-harness (CDP) ─▶ real Chrome ─▶ Mock NetSuite (gym)
                          │
       event stream ──────┴────▶ chat UI (SvelteKit)  /  eval runner + LLM judge
```

- **`worker/`** (PUBLIC, `@sop/worker`) — the agent. `runWorker(opts)` streams normalized events.
  Used by both the UI server and the eval runner. Tools live in `worker/src/tools/`.
- **`ui/`** (PUBLIC, `@sop/ui`) — SvelteKit chat. Submit ticket; tool calls/thoughts stream into
  collapsed expandable groups; `send_to_user` + final text break out as visible messages; selected
  SOP rendered as markdown. Image-paste + Excel attach supported.
- **`gym/mock/`** (PRIVATE, gitignored, `@sop/mock`) — SvelteKit app resembling the NetSuite
  screenshots. Server-side state + adversarial layer. `/api/__reset`, `/api/__state`, `/api/__config`.
- **`gym/scenarios/`** (PRIVATE) — SOP-derived eval scenarios + judge rubrics.
- **`tests/`** (PUBLIC, `@sop/tests`) — generic eval runner + Sonnet LLM judge.
- **`vendor/browser-harness/`** — vendored CDP browser tool, invoked via `uv run`.

### Public / private split (hackathon submission)

Public: `worker/`, `ui/`, `tests/`, `vendor/`, root config, `scripts/`, `CLAUDE.md`.
Gitignored (`.gitignore`): `inputs/` (transcripts, SOPs, screenshots) and `gym/` (mock + scenarios).
Internet users download the worker and point it at their own SOPs + their own target site.

### Worker ↔ host contract

`worker/src/contract.ts` is the source of truth. The worker emits `WorkerEvent`s and calls back into
the host for `ask_approval`. Both the UI and the eval runner implement the same `WorkerHost`.

## Tech stack

- TypeScript everywhere. ESM. `tsx` to run TS directly. pnpm workspace.
- Worker: `@anthropic-ai/claude-agent-sdk` (model: Sonnet). Excel via `xlsx`.
- UI + mock: SvelteKit + Vite.
- Browser control: vendored `browser-harness` (Python/CDP) driving a dedicated Chrome on
  `--remote-debugging-port` (Way 2 / isolated profile). Worker reaches it via the `browser` tool.
- Tests: headless Chrome; Sonnet as LLM judge.

## Coding & architecture guidelines

- Small, focused modules. Prefer pure functions; isolate side effects (network, fs, browser).
- Strict TS (`tsconfig.base.json`): no implicit any in our code, `noUncheckedIndexedAccess` on.
- Validate external/tool input with `zod` at the boundary.
- No secrets in code. Auth comes from the ambient `claude` CLI / `ANTHROPIC_API_KEY`.
- Match the style of surrounding code. Comments explain *why*, not *what*.
- Run `pnpm format` and `pnpm lint` before considering a change done. `pnpm typecheck` must pass.
- Mock data must read as authentic NetSuite (real-looking SO/PO/INV ids, account-prefixed customer
  names, CG-series + numeric SKUs, real price-level tier names). Derive from `inputs/`.

## Commands

```bash
pnpm install
pnpm mock:dev          # run mock NetSuite (gym)
pnpm ui:dev            # run chat UI
pnpm eval              # run the worker against scenarios + judge
pnpm lint && pnpm format:check && pnpm typecheck
scripts/chrome.sh start|stop   # dedicated Chrome on debug port for the worker
```
