#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# Capture desktop + mobile screenshots of the exact CAPTURE_URL into CAPTURE_DIR.
# Exit 75 = temporary navigation/browser infrastructure failure (retryable).
# Exit 1  = script usage or rendering defect.
: "${CAPTURE_URL:?Set CAPTURE_URL to the exact URL to capture}"
: "${CAPTURE_DIR:?Set CAPTURE_DIR to the output directory}"
RUNNER_TMP="${RUNNER_TEMP:-/tmp}"
HELPER="$RUNNER_TMP/free-api-capture.mjs"

/usr/bin/time -p mkdir -p "$CAPTURE_DIR"
/usr/bin/time -p mkdir -p "$RUNNER_TMP"
/usr/bin/time -p tee "$HELPER" >/dev/null <<'NODE_EOF'
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const url = process.env.CAPTURE_URL;
const out = process.env.CAPTURE_DIR;
if (!url || !out) { console.error('Set CAPTURE_URL and CAPTURE_DIR.'); process.exit(1); }
mkdirSync(out, { recursive: true });

const runtime = join(process.env.HOME, '.local/share/omgithub-playwright');
const require = createRequire(join(runtime, 'package.json'));
const { chromium } = require('playwright');

let launchOptions = {};
try {
  const cfg = JSON.parse(readFileSync(join(runtime, process.platform === 'darwin' ? 'metal.json' : 'linux.json'), 'utf8'));
  launchOptions = cfg.browser.launchOptions || {};
} catch (error) {
  console.error('Could not read playwright launch config: ' + (error?.message || error));
  process.exit(1);
}
if (process.platform === 'linux') {
  try { process.env.DISPLAY ||= ':' + readFileSync(join(runtime, 'display'), 'utf8').trim(); }
  catch (error) {
    console.error('No Xvfb display for headed browser: ' + (error?.message || error));
    process.exit(75);
  }
}

const transient = (error) => {
  throw Object.assign(error instanceof Error ? error : new Error(String(error)), { exitCode: 75 });
};

let browser;
try {
  browser = await chromium.launch({ ...launchOptions, timeout: 30000 }).catch(transient);
  for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height } }).catch(transient);
    page.setDefaultTimeout(30000);
    const response = await page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(transient);
    const status = response?.status();
    if (!response || !response.ok()) {
      const retryable = !response || [408, 429, 500, 502, 503, 504].includes(status);
      throw Object.assign(new Error(`HTTP ${status} loading preview`), { exitCode: retryable ? 75 : 1 });
    }
    await page.locator('body').waitFor({ state: 'visible' }).catch(transient);
    await page.waitForFunction(() => document.fonts.status === 'loaded').catch(() => {});
    await page.waitForTimeout(1500);
    const html = await page.content().catch(transient);
    if (!html || html.length < 200) throw Object.assign(new Error('Rendered page is empty'), { exitCode: 1 });
    await page.screenshot({ path: join(out, `final-${name}.png`), timeout: 30000 }).catch((error) => {
      if (error?.name === 'TimeoutError' || !browser.isConnected()) transient(error);
      throw error;
    });
    await page.close();
    console.log(`captured final-${name}.png`);
  }
} catch (error) {
  console.error(error?.message || error);
  process.exit(error?.exitCode || 1);
} finally {
  await browser?.close().catch((error) => { console.error(error?.message || error); process.exitCode ||= 75; });
}
NODE_EOF
/usr/bin/time -p node --check "$HELPER"
/usr/bin/time -p node "$HELPER"
/usr/bin/time -p python3 -c 'import os,sys
d=os.environ["CAPTURE_DIR"]
for n in ["final-desktop.png","final-mobile.png"]:
 p=os.path.join(d,n)
 if not os.path.isfile(p): raise SystemExit(f"missing {n}")
 if os.path.getsize(p)<24: raise SystemExit(f"too small: {n}")
 if open(p,"rb").read(8).hex()!="89504e470d0a1a0a": raise SystemExit(f"not a PNG: {n}")
 print(f"verified {n} ({os.path.getsize(p)} bytes)")'
