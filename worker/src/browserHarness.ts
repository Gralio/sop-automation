/**
 * Thin wrapper around the vendored browser-harness CLI. The worker's `browser`
 * tool runs Python snippets through this; the harness drives a dedicated Chrome
 * over CDP (Way 2: BU_CDP_URL + isolated profile).
 *
 * We intentionally keep this dumb: spawn `uv run … browser-harness -c <code>`,
 * capture stdout/stderr, and optionally append a screenshot capture so the model
 * can see the post-action state. No retry framework, no session manager.
 */
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import type { BrowserConfig } from './contract.js';

const SHOT_MARKER = '__BH_SHOT__:';
const SHOT_ERR_MARKER = '__BH_SHOT_ERR__:';

/** Snippet appended to user code to capture the viewport after the action. */
// NOTE: do NOT downscale here. The worker reads pixel coordinates off this
// screenshot and clicks them with click_at_xy (CSS pixels). Downscaling breaks
// that 1:1 mapping. Chrome runs at device-scale-factor=1 (see scripts/chrome.sh)
// so the viewport screenshot is already CSS-pixel-accurate and under 2000px.
const CAPTURE_SNIPPET = `
try:
    _bh_shot = capture_screenshot()
    print("${SHOT_MARKER}" + _bh_shot)
except Exception as _bh_e:
    print("${SHOT_ERR_MARKER}" + str(_bh_e))
`;

export interface BrowserRunResult {
  /** Combined stdout (with the screenshot marker line stripped). */
  text: string;
  /** Base64 PNG of the viewport after the action, if a screenshot was taken. */
  screenshotBase64?: string;
  /** Non-zero exit / harness error. */
  isError: boolean;
}

export interface RunPythonOptions {
  code: string;
  screenshot: boolean;
  browser: BrowserConfig;
  /** scratch dir; harness writes shots under its own tmp, path is echoed back. */
  workDir: string;
  timeoutMs?: number;
}

function runUv(
  args: string[],
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      'uv',
      args,
      { env, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as { code?: unknown }).code === 'number'
            ? (err as { code: number }).code
            : err
              ? 1
              : 0;
        resolve({ stdout: stdout ?? '', stderr: stderr ?? '', code });
      },
    );
  });
}

function harnessEnv(browser: BrowserConfig): NodeJS.ProcessEnv {
  return {
    ...process.env,
    BU_CDP_URL: browser.cdpUrl,
    BU_NAME: browser.buName,
    // Domain skills off — the worker must learn the site generically.
    BH_DOMAIN_SKILLS: '0',
  };
}

/** Warm the uv venv + daemon so the first real tool call isn't slow. */
export async function warmUp(browser: BrowserConfig): Promise<void> {
  await runUv(
    ['run', '--project', browser.harnessDir, 'browser-harness', '-c', 'print("warm")'],
    harnessEnv(browser),
    120_000,
  );
}

export async function runPython(opts: RunPythonOptions): Promise<BrowserRunResult> {
  const code = opts.screenshot ? `${opts.code}\n${CAPTURE_SNIPPET}` : opts.code;
  const {
    stdout,
    stderr,
    code: exit,
  } = await runUv(
    ['run', '--project', opts.browser.harnessDir, 'browser-harness', '-c', code],
    harnessEnv(opts.browser),
    opts.timeoutMs ?? 120_000,
  );

  let shotPath: string | undefined;
  const lines = stdout.split('\n');
  const kept: string[] = [];
  for (const line of lines) {
    if (line.startsWith(SHOT_MARKER)) {
      shotPath = line.slice(SHOT_MARKER.length).trim();
    } else if (line.startsWith(SHOT_ERR_MARKER)) {
      // swallow — screenshot failed (e.g. no tab yet); not fatal.
    } else {
      kept.push(line);
    }
  }

  let screenshotBase64: string | undefined;
  if (shotPath) {
    try {
      const buf = await readFile(shotPath);
      screenshotBase64 = buf.toString('base64');
    } catch {
      // ignore — couldn't read the shot file
    }
  }

  const textParts = [kept.join('\n').trimEnd()];
  if (stderr.trim()) textParts.push(`[stderr]\n${stderr.trim()}`);
  const text = textParts.filter(Boolean).join('\n\n') || '(no output)';

  return { text, screenshotBase64, isError: exit !== 0 };
}
