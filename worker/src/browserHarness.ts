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
import { tmpdir } from 'node:os';
import { dirname } from 'node:path';
import type { BrowserConfig } from './contract.js';

const SHOT_MARKER = '__BH_SHOT__:';
const SHOT_ERR_MARKER = '__BH_SHOT_ERR__:';

/** Snippet appended to user code to capture the viewport after the action.
 *
 * The worker reads pixel coordinates off this screenshot and clicks them with
 * click_at_xy, which expects CSS pixels. On a HiDPI/Retina display the raw
 * capture is DPR× larger than the CSS viewport, which would break that 1:1
 * mapping. So we capture at the display's native DPR (crisp — important when the
 * browser is headed and a human is watching) and then resize the image down to
 * the exact CSS viewport size. Result: coordinates always map 1:1 regardless of
 * DPR, and headed Chrome stays sharp (no --force-device-scale-factor needed). */
const CAPTURE_SNIPPET = `
try:
    import json as _bh_json
    _bh_vw, _bh_vh = _bh_json.loads(js("JSON.stringify([Math.round(window.innerWidth), Math.round(window.innerHeight)])"))
    _bh_shot = capture_screenshot()
    try:
        from PIL import Image as _BhImage
        _bh_im = _BhImage.open(_bh_shot)
        if _bh_im.size != (_bh_vw, _bh_vh):
            _bh_im.resize((_bh_vw, _bh_vh)).save(_bh_shot)
    except Exception:
        pass
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
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    execFile(
      'uv',
      args,
      { env, cwd, timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 },
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

// Only a minimal, neutral set of variables reaches the browser-harness
// subprocess. The worker can run arbitrary Python through the browser tool, so
// it must NOT inherit the parent's env (which holds repo paths like HARNESS_DIR
// / SOP_DIR / REPO_ROOT / PWD, plus any API keys) — that would let it read its
// own location via os.environ and defeat the temp-dir isolation.
const SAFE_ENV_KEYS = ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'USER', 'LOGNAME'];

function harnessEnv(browser: BrowserConfig): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const k of SAFE_ENV_KEYS) {
    if (process.env[k] !== undefined) env[k] = process.env[k];
  }
  env.BU_CDP_URL = browser.cdpUrl;
  env.BU_NAME = browser.buName;
  // Domain skills off — the worker must learn the site generically.
  env.BH_DOMAIN_SKILLS = '0';
  return env;
}

/** Redact the vendored harness / repo paths from any text returned to the
 * worker (e.g. Python tracebacks reference files under the harness checkout),
 * so the worker can't learn where its code lives even on errors. */
function redactPaths(text: string, harnessDir: string): string {
  const repoRoot = dirname(dirname(harnessDir)); // <repo>/vendor/browser-harness -> <repo>
  let out = text;
  if (harnessDir) out = out.split(harnessDir).join('<harness>');
  if (repoRoot && repoRoot !== '.' && repoRoot !== '/')
    out = out.split(repoRoot).join('<workspace>');
  return out;
}

/** Warm the uv venv + daemon so the first real tool call isn't slow. */
export async function warmUp(browser: BrowserConfig): Promise<void> {
  await runUv(
    ['run', '--project', browser.harnessDir, 'browser-harness', '-c', 'print("warm")'],
    harnessEnv(browser),
    120_000,
    tmpdir(),
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
    // Run from a neutral dir so the worker's os.getcwd() is its own temp world,
    // never the repo.
    opts.workDir || tmpdir(),
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
  const text =
    redactPaths(textParts.filter(Boolean).join('\n\n'), opts.browser.harnessDir) || '(no output)';

  return { text, screenshotBase64, isError: exit !== 0 };
}
