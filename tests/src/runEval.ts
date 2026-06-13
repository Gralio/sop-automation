/**
 * Generic eval runner. For each scenario: reset the target, run the worker,
 * snapshot the target state, run deterministic checks, and ask the LLM judge.
 * Prints a summary and writes a JSON report. Exit code reflects the pass rate.
 *
 * Config via env (all have sane local defaults):
 *   MOCK_URL, SOP_DIR, CDP_URL, BU_NAME, HARNESS_DIR, WORK_DIR, SCENARIOS,
 *   MODEL, JUDGE (1/0), ONLY (comma-separated scenario ids), LOG (1/0)
 */
import { fileURLToPath } from 'node:url';
import { dirname, resolve, isAbsolute, join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { runWorker } from '@sop/worker';
import type { Attachment } from '@sop/worker/contract';
import { RecordingHost } from './host.js';
import { judge } from './judge.js';
import type { CheckContext, CheckResult, Scenario, ScenarioResult } from './types.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../');

const cfg = {
  mockUrl: process.env.MOCK_URL ?? 'http://127.0.0.1:5180',
  sopDir: process.env.SOP_DIR ?? join(repoRoot, 'inputs/sops'),
  cdpUrl: process.env.CDP_URL ?? 'http://127.0.0.1:9222',
  buName: process.env.BU_NAME ?? 'eval',
  harnessDir: process.env.HARNESS_DIR ?? join(repoRoot, 'vendor/browser-harness'),
  workBase: process.env.WORK_DIR ?? join(repoRoot, '.runs'),
  scenarios: process.env.SCENARIOS ?? join(repoRoot, 'gym/scenarios/index.ts'),
  model: process.env.MODEL || undefined,
  judge: process.env.JUDGE !== '0',
  only: (process.env.ONLY ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  log: process.env.LOG === '1',
};

async function fetchJson(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, init);
  return res.json();
}

async function resetMock(adversarial?: Record<string, number | boolean>): Promise<void> {
  // NO_ADVERSARIAL=1 disables the hidden friction (for debugging the worker).
  const adv = process.env.NO_ADVERSARIAL === '1' ? { enabled: false } : (adversarial ?? {});
  await fetch(`${cfg.mockUrl}/api/__reset`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ adversarial: adv }),
  });
}

function resolveAttachments(scenario: Scenario): Attachment[] {
  return (scenario.attachments ?? []).map((a, i) => ({
    id: `att_${i}`,
    name: a.name,
    mediaType: a.mediaType,
    path: isAbsolute(a.path) ? a.path : resolve(repoRoot, a.path),
  }));
}

function ensureChrome(): void {
  if (process.env.SKIP_CHROME === '1') return;
  // Idempotent: chrome.sh start no-ops if the debug port is already listening,
  // and starts a fresh headless Chrome otherwise. No stop -> no bind race.
  const script = join(repoRoot, 'scripts/chrome.sh');
  try {
    execFileSync(script, ['start'], {
      stdio: 'ignore',
      env: { ...process.env, CHROME_HEADLESS: process.env.CHROME_HEADLESS ?? '1' },
    });
  } catch {
    /* best-effort; the worker will surface a real browser problem */
  }
}

async function runScenario(scenario: Scenario): Promise<ScenarioResult> {
  const start = Date.now();
  const workDir = join(cfg.workBase, scenario.id);
  await mkdir(workDir, { recursive: true });
  ensureChrome();
  await resetMock(scenario.adversarial);

  const host = new RecordingHost(scenario.approvalPolicy ?? 'approve', cfg.log);
  let workerOk = false;
  let sopPath: string | undefined;
  let turns = 0;
  let finalText = '';
  let error: string | undefined;

  try {
    const res = await runWorker(
      {
        ticket: scenario.ticket,
        attachments: resolveAttachments(scenario),
        sopDir: cfg.sopDir,
        targetUrl: cfg.mockUrl,
        workDir,
        browser: { cdpUrl: cfg.cdpUrl, buName: cfg.buName, harnessDir: cfg.harnessDir },
        model: cfg.model,
        maxTurns: scenario.maxTurns,
      },
      host,
    );
    workerOk = res.ok;
    sopPath = res.sopPath;
    turns = res.turns;
    finalText = res.finalText;
  } catch (err) {
    error = (err as Error).message;
  }

  const state = await fetchJson(`${cfg.mockUrl}/api/__state`).catch(() => ({}));
  const ctx: CheckContext = { state, events: host.events, finalText, sopPath };
  const checks: CheckResult[] = scenario.checks.map((c) => {
    try {
      return c(ctx);
    } catch (e) {
      return { name: 'check threw', pass: false, detail: (e as Error).message };
    }
  });
  const checksPassed = checks.every((c) => c.pass);

  const verdict = cfg.judge ? await judge(scenario, ctx, checks, cfg.model) : undefined;
  // A scenario passes when the objective checks pass AND (if judged) the judge agrees.
  const ok = checksPassed && (verdict ? verdict.pass : true);

  return {
    id: scenario.id,
    name: scenario.name,
    ok,
    workerOk,
    sopPath,
    turns,
    checks,
    checksPassed,
    verdict,
    finalText,
    error,
    durationMs: Date.now() - start,
  };
}

async function main(): Promise<void> {
  // Mock reachable?
  try {
    await fetchJson(`${cfg.mockUrl}/api/__state`);
  } catch {
    console.error(`Mock not reachable at ${cfg.mockUrl}. Start it with: pnpm mock:dev`);
    process.exit(2);
  }

  const mod = await import(cfg.scenarios);
  let scenarios: Scenario[] = mod.default ?? mod.scenarios ?? [];
  if (cfg.only.length) scenarios = scenarios.filter((s) => cfg.only.includes(s.id));
  if (!scenarios.length) {
    console.error('No scenarios to run.');
    process.exit(2);
  }

  console.error(`\nRunning ${scenarios.length} scenario(s) against ${cfg.mockUrl}\n`);
  const results: ScenarioResult[] = [];
  for (const s of scenarios) {
    console.error(`▶ ${s.id} — ${s.name}`);
    const r = await runScenario(s);
    results.push(r);
    const mark = r.ok ? '✅ PASS' : '❌ FAIL';
    console.error(
      `  ${mark} (checks ${r.checksPassed ? 'ok' : 'FAILED'}, ${r.turns} turns, ${(r.durationMs / 1000).toFixed(0)}s)`,
    );
    for (const c of r.checks) if (!c.pass) console.error(`    ✗ ${c.name}: ${c.detail}`);
    if (r.verdict && !r.verdict.pass) console.error(`    judge: ${r.verdict.summary}`);
    if (r.error) console.error(`    error: ${r.error}`);
  }

  const passed = results.filter((r) => r.ok).length;
  const rate = passed / results.length;
  console.error(`\n=== ${passed}/${results.length} passed (${(rate * 100).toFixed(0)}%) ===\n`);

  await mkdir(join(repoRoot, 'runs'), { recursive: true });
  const reportPath = join(repoRoot, 'runs', `eval-${Date.now()}.json`);
  await writeFile(
    reportPath,
    JSON.stringify({ rate, passed, total: results.length, results }, null, 2),
  );
  console.error(`report: ${reportPath}`);

  process.exit(rate >= 0.99 ? 0 : 1);
}

await main();
