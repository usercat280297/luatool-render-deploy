#!/usr/bin/env node
/**
 * One-shot: login -> update MORRENUS_SESSION_STATE_B64 on Render -> (optional) deploy
 *
 * Required env:
 *   RENDER_API_KEY
 *   RENDER_SERVICE_ID
 *
 * Optional env:
 *   MORRENUS_SESSION_DIR (default: .playwright-session)
 *   PUBLIC_BASE_URL / RENDER_URL + ADMIN_TOKEN (to update running instance)
 *   RENDER_DEPLOY_AFTER_ENV=1 (trigger deploy after env update)
 *
 * Usage:
 *   node scripts/morrenus_login_render_sync.js
 *   node scripts/morrenus_login_render_sync.js --no-login
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SESSION_DIR = process.env.MORRENUS_SESSION_DIR
  ? path.resolve(process.env.MORRENUS_SESSION_DIR)
  : path.join(ROOT, '.playwright-session');
const STATE_PATH = path.join(SESSION_DIR, 'state.json');

const args = process.argv.slice(2);
const shouldLogin = !args.includes('--no-login');

function log(msg) {
  console.log(`[morrenus-sync] ${msg}`);
}

function fail(msg) {
  console.error(`[morrenus-sync] ERROR: ${msg}`);
  process.exit(1);
}

function readStateBase64() {
  if (!fs.existsSync(STATE_PATH)) {
    fail(`state.json not found at ${STATE_PATH}`);
  }
  const buf = fs.readFileSync(STATE_PATH);
  return buf.toString('base64');
}

function httpsJsonRequest({ method, hostname, path: reqPath, headers, body }) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = https.request({
      method,
      hostname,
      path: reqPath,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        ...(headers || {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const parsed = data ? safeJsonParse(data) : null;
        resolve({ status: res.statusCode, data: parsed, raw: data });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch (_) { return null; }
}

async function updateRenderEnvVar(key, value) {
  const apiKey = process.env.RENDER_API_KEY;
  const serviceId = process.env.RENDER_SERVICE_ID;
  if (!apiKey || !serviceId) {
    log('RENDER_API_KEY or RENDER_SERVICE_ID missing, skipping Render env update.');
    return false;
  }

  const urlPath = `/v1/services/${encodeURIComponent(serviceId)}/env-vars/${encodeURIComponent(key)}`;
  const res = await httpsJsonRequest({
    method: 'PUT',
    hostname: 'api.render.com',
    path: urlPath,
    headers: { Authorization: `Bearer ${apiKey}` },
    body: { value },
  });

  if (res.status >= 200 && res.status < 300) {
    log(`Render env updated: ${key} (length ${value.length})`);
    return true;
  }

  const msg = res.data?.message || res.raw || `status ${res.status}`;
  fail(`Render env update failed: ${msg}`);
}

async function triggerRenderDeploy() {
  const apiKey = process.env.RENDER_API_KEY;
  const serviceId = process.env.RENDER_SERVICE_ID;
  if (!apiKey || !serviceId) {
    log('RENDER_API_KEY or RENDER_SERVICE_ID missing, skipping deploy.');
    return;
  }

  const urlPath = `/v1/services/${encodeURIComponent(serviceId)}/deploys`;
  const res = await httpsJsonRequest({
    method: 'POST',
    hostname: 'api.render.com',
    path: urlPath,
    headers: { Authorization: `Bearer ${apiKey}` },
    body: {},
  });

  if (res.status >= 200 && res.status < 300) {
    log('Render deploy triggered.');
  } else {
    log(`Render deploy trigger failed (status ${res.status}).`);
  }
}

async function updateRunningInstance(base64) {
  const adminToken = process.env.ADMIN_TOKEN;
  const renderUrl = process.env.RENDER_URL || process.env.PUBLIC_BASE_URL;
  if (!adminToken || !renderUrl || renderUrl.includes('localhost')) {
    log('Running instance update skipped (missing ADMIN_TOKEN or PUBLIC_BASE_URL).');
    return;
  }

  const res = await fetch(`${renderUrl.replace(/\/+$/, '')}/update-morrenus-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Token': adminToken,
    },
    body: JSON.stringify({ stateB64: base64 }),
  }).catch((err) => ({ ok: false, status: 0, text: () => Promise.resolve(err.message) }));

  if (res.ok) {
    log('Running instance session updated.');
  } else {
    const text = await res.text();
    log(`Running instance update failed (${res.status}): ${text}`);
  }
}

(async () => {
  if (shouldLogin) {
    log('Launching login flow...');
    const login = spawnSync('node', [path.join(__dirname, 'morrenus_key_manager.js'), 'login'], {
      stdio: 'inherit',
      cwd: ROOT,
      env: { ...process.env, MORRENUS_LOCAL_LOGIN: 'true' },
    });
    if (login.status !== 0) {
      fail(`Login failed with code ${login.status}`);
    }
  }

  const base64 = readStateBase64();
  log(`Loaded session state (${base64.length} chars).`);

  await updateRenderEnvVar('MORRENUS_SESSION_STATE_B64', base64);
  await updateRunningInstance(base64);

  if (process.env.RENDER_DEPLOY_AFTER_ENV === '1') {
    await triggerRenderDeploy();
  } else {
    log('Deploy not triggered (set RENDER_DEPLOY_AFTER_ENV=1 to force).');
  }

  log('Done.');
})();
