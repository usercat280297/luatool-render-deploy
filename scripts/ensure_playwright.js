#!/usr/bin/env node
const { execSync } = require('child_process');

const isRender = Boolean(process.env.RENDER)
  || Boolean(process.env.RENDER_SERVICE_ID)
  || Boolean(process.env.RENDER_EXTERNAL_URL);

const shouldInstall = isRender
  || process.env.PLAYWRIGHT_INSTALL === '1'
  || process.env.CI === 'true';

if (process.env.PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD === '1') {
  console.log('[Playwright] Browser download skipped (PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1).');
  process.exit(0);
}

if (!shouldInstall) {
  console.log('[Playwright] Skip browser install (not Render/CI).');
  process.exit(0);
}

if (isRender && !process.env.PLAYWRIGHT_BROWSERS_PATH) {
  // Force install into node_modules/.cache so it ships with the deploy artifact.
  process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
  console.log('[Playwright] PLAYWRIGHT_BROWSERS_PATH=0 (local cache).');
}

const withDeps = process.env.PLAYWRIGHT_WITH_DEPS === '1' && !isRender;
const installCommand = withDeps
  ? 'npx playwright install --with-deps chromium'
  : 'npx playwright install chromium';

console.log(`[Playwright] Installing Chromium... (${installCommand})`);

try {
  execSync(installCommand, { stdio: 'inherit' });
  console.log('[Playwright] Chromium installed.');
} catch (error) {
  console.error('[Playwright] Install failed:', error.message);
  process.exit(1);
}
