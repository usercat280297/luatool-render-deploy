#!/usr/bin/env node
/**
 * Morrenus API Key Manager - Playwright Automation
 *
 * Quản lý API key tự động cho Morrenus Games Manifest API.
 * Sử dụng Playwright (Chromium) để bypass Cloudflare và thao tác trên web dashboard.
 *
 * Commands:
 *   login     - Mở browser có giao diện, đăng nhập Discord OAuth, lưu session
 *   generate  - Headless: tạo key mới (revoke cũ nếu có)
 *   revoke    - Headless: revoke key hiện tại
 *   status    - Headless: kiểm tra trạng thái key hiện tại
 *   extract   - Headless: lấy API key hiện tại
 *
 * Usage:
 *   node scripts/morrenus_key_manager.js login
 *   node scripts/morrenus_key_manager.js generate
 *   node scripts/morrenus_key_manager.js status
 *
 * RAM Optimization:
 *   - Chỉ dùng Chromium (không Firefox/WebKit)
 *   - Launch headless, single process, disable GPU
 *   - Browser chỉ mở khi cần, đóng ngay sau khi xong
 *   - Dùng minimal viewport (800x600)
 */

const path = require('path');
const fs = require('fs');

const DATA_ROOT = process.env.BOT_DATA_DIR
  || process.env.RENDER_DISK_MOUNT_PATH
  || path.join(__dirname, '..');

const isRender = Boolean(process.env.RENDER)
  || Boolean(process.env.RENDER_SERVICE_ID)
  || Boolean(process.env.RENDER_EXTERNAL_URL);
const forceLocalLogin = String(process.env.MORRENUS_LOCAL_LOGIN || '').toLowerCase() === 'true';

if (!process.env.PLAYWRIGHT_BROWSERS_PATH && !forceLocalLogin) {
  if (process.env.RENDER_DISK_MOUNT_PATH) {
    process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(DATA_ROOT, 'playwright-browsers');
  } else if (isRender) {
    // Store browsers in node_modules/.cache so it ships with the deploy artifact.
    process.env.PLAYWRIGHT_BROWSERS_PATH = '0';
  }
}

const { chromium } = require('playwright');

// ========== CONFIG ==========
const BASE_URL = 'https://manifest.morrenus.xyz';
const API_KEYS_URL = `${BASE_URL}/api-keys/user`;
const AUTH_URL = `${BASE_URL}/auth/discord`;
const SESSION_DIR = process.env.MORRENUS_SESSION_DIR
  ? path.resolve(process.env.MORRENUS_SESSION_DIR)
  : path.join(DATA_ROOT, '.playwright-session');
const KEY_FILE_PATH = process.env.MORRENUS_KEY_FILE
  ? path.resolve(process.env.MORRENUS_KEY_FILE)
  : path.join(DATA_ROOT, '.morrenus_active_key');
const ENV_PATH = path.join(__dirname, '..', '.env');
const TIMEOUT = 30000;

process.env.MORRENUS_SESSION_DIR = process.env.MORRENUS_SESSION_DIR || SESSION_DIR;
process.env.MORRENUS_KEY_FILE = process.env.MORRENUS_KEY_FILE || KEY_FILE_PATH;

// RAM-optimized Chromium launch args
const CHROMIUM_ARGS = [
  '--disable-gpu',
  '--disable-dev-shm-usage',     // Quan trọng cho Render (shared memory nhỏ)
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-breakpad',
  '--disable-component-extensions-with-background-pages',
  '--disable-component-update',
  '--disable-default-apps',
  '--disable-domain-reliability',
  '--disable-features=TranslateUI',
  '--disable-hang-monitor',
  '--disable-ipc-flooding-protection',
  '--disable-popup-blocking',
  '--disable-prompt-on-repost',
  '--disable-renderer-backgrounding',
  '--disable-sync',
  '--metrics-recording-only',
  '--no-first-run',
  '--no-sandbox',
  // '--single-process',          // Bỏ: crash với persistent context + Windows
  '--disable-setuid-sandbox',
  '--js-flags=--max-old-space-size=256',  // Giới hạn V8 heap
];

// ========== HELPERS ==========

function log(msg) {
  const ts = new Date().toISOString().substring(11, 19);
  console.log(`[${ts}] ${msg}`);
}

function ensureSessionDir() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }
}

function ensureSessionSeedFromEnv() {
  const b64 = process.env.MORRENUS_SESSION_STATE_B64;
  if (!b64) return;
  ensureSessionDir();

  const statePath = path.join(SESSION_DIR, 'state.json');
  if (fs.existsSync(statePath)) return;

  try {
    const raw = Buffer.from(b64, 'base64').toString('utf8');
    if (!raw.trim().startsWith('{')) {
      log('⚠️ MORRENUS_SESSION_STATE_B64 is not valid JSON.');
      return;
    }
    fs.writeFileSync(statePath, raw);
    log(`✅ Session state seeded to ${statePath}`);
  } catch (e) {
    log(`⚠️ Failed to seed session state: ${e.message}`);
  }
}

function hasSession() {
  ensureSessionSeedFromEnv();
  const statePath = path.join(SESSION_DIR, 'state.json');
  const browserDataDir = path.join(SESSION_DIR, 'browser-data');
  return fs.existsSync(statePath) || fs.existsSync(browserDataDir);
}

/**
 * Launch browser với tối ưu RAM
 * @param {boolean} headless - true cho automation, false cho login thủ công
 */
async function launchBrowser(headless = true) {
  ensureSessionSeedFromEnv();
  ensureSessionDir();

  // Dùng persistent context thay vì incognito → giữ Cloudflare cookies/challenges
  const userDataDir = path.join(SESSION_DIR, 'browser-data');
  const statePath = path.join(SESSION_DIR, 'state.json');
  const hasUserData = fs.existsSync(userDataDir);
  const hasState = fs.existsSync(statePath);

  // Khi headed (login), dùng ít args hơn để tránh crash trên Windows
  const args = headless ? CHROMIUM_ARGS : [
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--disable-extensions',
  ];

  if (headless && !hasUserData && hasState) {
    const browser = await chromium.launch({
      headless,
      args,
    });
    const context = await browser.newContext({
      storageState: statePath,
      viewport: { width: 800, height: 600 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      locale: 'en-US',
    });
    const page = await context.newPage();
    return { browser, context, page };
  }

  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  // Dùng launchPersistentContext thay vì launch() + newContext()
  // Giữ tất cả cookies, localStorage, Cloudflare challenge tokens
  try {
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless,
      args,
      viewport: { width: 800, height: 600 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      locale: 'en-US',
    });

    const page = context.pages()[0] || await context.newPage();
    return { browser: context, context, page };
  } catch (error) {
    if (headless) throw error;
    log(`⚠️ Persistent context failed: ${error.message}`);

    // Retry once with a clean user-data dir (Windows can lock/corrupt it)
    try {
      if (fs.existsSync(userDataDir)) {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      }
      fs.mkdirSync(userDataDir, { recursive: true });

      const context = await chromium.launchPersistentContext(userDataDir, {
        headless,
        args,
        viewport: { width: 800, height: 600 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
        locale: 'en-US',
      });

      const page = context.pages()[0] || await context.newPage();
      return { browser: context, context, page };
    } catch (retryError) {
      log(`⚠️ Persistent retry failed: ${retryError.message}`);
    }

    // Fallback: non-persistent context (still saves storageState after login)
    const browser = await chromium.launch({ headless, args });
    const context = await browser.newContext({
      storageState: hasState ? statePath : undefined,
      viewport: { width: 800, height: 600 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      locale: 'en-US',
    });
    const page = await context.newPage();
    return { browser, context, page };
  }
}

/**
 * Lưu session sau khi đăng nhập
 */
async function saveSession(context) {
  const statePath = path.join(SESSION_DIR, 'state.json');
  await context.storageState({ path: statePath });
  log(`✅ Session saved to ${statePath}`);
}

/**
 * Kiểm tra đã đăng nhập chưa
 */
async function isLoggedIn(page) {
  try {
    await page.goto(API_KEYS_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });

    // Đợi Cloudflare challenge nếu có (tối đa 10s)
    for (let i = 0; i < 5; i++) {
      const bodyText = await page.textContent('body').catch(() => '');
      const currentUrl = page.url();
      if (bodyText.includes('Checking your browser') ||
          bodyText.includes('Just a moment') ||
          currentUrl.includes('challenge')) {
        log(`   ⏳ Cloudflare challenge detected, waiting... (attempt ${i + 1})`);
        await page.waitForTimeout(3000);
      } else {
        break;
      }
    }

    // Nếu bị redirect về login hoặc thấy "Authentication required" → chưa login
    const url = page.url();
    log(`   isLoggedIn check URL: ${url}`);
    if (url.includes('/auth/') || url.includes('discord.com')) {
      log(`   ❌ Redirected to auth page`);
      return false;
    }

    const body = await page.textContent('body');
    if (body.includes('Authentication required') || (body.includes('Login') && !body.includes('API Key'))) {
      log(`   ❌ Page shows auth required. Body preview: ${body.substring(0, 200)}`);
      return false;
    }

    return true;
  } catch (e) {
    log(`   ❌ isLoggedIn error: ${e.message}`);
    return false;
  }
}

/**
 * Trích xuất thông tin key từ trang
 */
async function extractKeyInfo(page) {
  const info = {
    hasActiveKey: false,
    apiKey: null,
    totalUsage: null,
    todayUsage: null,
    dailyLimit: null,
    thisMonth: null,
    monthlyLimit: null,
    timeLeft: null,
    created: null,
    expires: null,
  };

  try {
    // Đợi trang load
    await page.waitForSelector('body', { timeout: TIMEOUT });
    await page.waitForTimeout(2000); // Đợi JS render

    const bodyText = await page.textContent('body');

    // Check active key
    info.hasActiveKey = bodyText.includes('Active API Key') || bodyText.includes('Your API key is ready');

    // Trích xuất key value - thử nhiều cách
    // Cách 1: tìm element chứa smm_ prefix
    const keyElements = await page.$$eval('*', els => {
      const results = [];
      for (const el of els) {
        const text = el.textContent || '';
        const match = text.match(/smm_[a-f0-9]{64,}/);
        if (match) results.push(match[0]);
      }
      return [...new Set(results)];
    });
    if (keyElements.length > 0) {
      info.apiKey = keyElements[0];
    }

    // Cách 2: tìm input/code/pre chứa key
    if (!info.apiKey) {
      const inputs = await page.$$eval('input[type="text"], input[readonly], code, pre, .api-key, .key-value, [data-key]', els => {
        return els.map(el => el.value || el.textContent || el.getAttribute('data-key') || '').filter(v => v.includes('smm_'));
      });
      if (inputs.length > 0) {
        const match = inputs[0].match(/smm_[a-f0-9]+/);
        if (match) info.apiKey = match[0];
      }
    }

    // Cách 3: tìm trong clipboard button hoặc copy button gần đó
    if (!info.apiKey) {
      // Thử click copy button nếu có
      const copyBtn = await page.$('button:has-text("Copy"), button:has-text("copy"), .copy-btn, [data-clipboard]');
      if (copyBtn) {
        // Có nút copy nhưng key có thể ẩn - check data attributes
        const keyData = await page.$$eval('[data-clipboard-text], [data-copy]', els => {
          return els.map(el => el.getAttribute('data-clipboard-text') || el.getAttribute('data-copy') || '');
        });
        for (const k of keyData) {
          if (k.includes('smm_')) {
            info.apiKey = k.match(/smm_[a-f0-9]+/)?.[0];
            break;
          }
        }
      }
    }

    // Extract stats từ text
    const statsMatch = bodyText.match(/(\d+)\s*TOTAL KEY USAGE/i);
    if (statsMatch) info.totalUsage = parseInt(statsMatch[1]);

    const todayMatch = bodyText.match(/(\d+)\s*TODAY/i);
    if (todayMatch) info.todayUsage = parseInt(todayMatch[1]);

    const limitMatch = bodyText.match(/(\d+)\s*DAILY LIMIT/i);
    if (limitMatch) info.dailyLimit = parseInt(limitMatch[1]);

    const monthMatch = bodyText.match(/(\d+)\s*THIS MONTH/i);
    if (monthMatch) info.thisMonth = parseInt(monthMatch[1]);

    const monthLimitMatch = bodyText.match(/([\d-]+)\s*MONTHLY LIMIT/i);
    if (monthLimitMatch) info.monthlyLimit = monthLimitMatch[1];

    const timeMatch = bodyText.match(/([\dd]+\s*[\dhm]+)\s*TIME LEFT/i);
    if (timeMatch) info.timeLeft = timeMatch[1];

    // Created/Expires
    const createdMatch = bodyText.match(/Created:\s*([\d/:. ]+)/i);
    if (createdMatch) info.created = createdMatch[1].trim();

    const expiresMatch = bodyText.match(/Expires:\s*([\d/:. ]+)/i);
    if (expiresMatch) info.expires = expiresMatch[1].trim();

  } catch (e) {
    log(`⚠️ Error extracting key info: ${e.message}`);
  }

  return info;
}

// ========== COMMANDS ==========

/**
 * LOGIN - Mở browser có giao diện để user đăng nhập
 */
async function cmdLogin() {
  log('🔑 Opening browser for Discord login...');
  log('   Please login to Discord when the browser opens.');
  log('   The session will be saved for future automated use.');

  const { browser, context, page } = await launchBrowser(false); // headed mode

  try {
    log('   Opening Morrenus auth page...');
    await page.goto(AUTH_URL, { waitUntil: 'networkidle', timeout: 60000 });

    const afterGotoUrl = page.url();
    log(`   Current page: ${afterGotoUrl}`);

    if (afterGotoUrl.includes('discord.com')) {
      log('⏳ Please complete Discord login and click "Authorize"...');
      log('   The browser will close automatically after redirect to Morrenus.');

      // Đợi cho đến khi URL thực sự về manifest.morrenus.xyz
      // Không match discord.com URLs
      await page.waitForURL(url => {
        const href = typeof url === 'string' ? url : url.toString();
        // Phải ở domain manifest.morrenus.xyz, KHÔNG phải discord.com
        return href.startsWith('https://manifest.morrenus.xyz') && !href.includes('/auth/discord');
      }, { timeout: 300000, waitUntil: 'domcontentloaded' }); // 5 phút timeout
    }

    const currentUrl = page.url();
    log(`✅ Redirected to: ${currentUrl}`);

    // Nếu về callback, đợi thêm redirect
    if (currentUrl.includes('/auth/callback')) {
      log('   Waiting for final redirect...');
      await page.waitForURL(url => {
        const href = typeof url === 'string' ? url : url.toString();
        return href.startsWith('https://manifest.morrenus.xyz') && !href.includes('/auth/');
      }, { timeout: 30000, waitUntil: 'domcontentloaded' }).catch(() => {});
    }

    log(`✅ Login successful! Final URL: ${page.url()}`);
    log('   Saving session...');
    await saveSession(context);

    // Navigate tới API keys page nếu chưa ở đó
    if (!page.url().includes('/api-keys/')) {
      log('   Navigating to API keys page...');
      await page.goto(API_KEYS_URL, { waitUntil: 'domcontentloaded', timeout: TIMEOUT });
      await page.waitForTimeout(2000);
    }

    // Lấy thông tin key sau khi login
    const keyInfo = await extractKeyInfo(page);
    if (keyInfo.hasActiveKey) {
      log(`📊 Active key found. Daily: ${keyInfo.todayUsage}/${keyInfo.dailyLimit}, Time left: ${keyInfo.timeLeft}`);
      if (keyInfo.apiKey) {
        log(`🔑 API Key: ${keyInfo.apiKey.substring(0, 20)}...`);
        // Auto-update .env
        updateEnvKey(keyInfo.apiKey);
      }
    } else {
      log('ℹ️ No active key. Use "generate" command to create one.');
    }

    // Lưu session lần cuối
    await saveSession(context);
  } catch (e) {
    if (e.message.includes('Timeout') || e.message.includes('timeout')) {
      log('⏱️ Login timeout (5 min). Please try again.');
    } else {
      log(`❌ Login error: ${e.message}`);
    }
    // Vẫn thử lưu session nếu đã ở trang Morrenus
    try {
      if (page.url().includes('manifest.morrenus.xyz')) {
        log('   Saving partial session anyway...');
        await saveSession(context);
      }
    } catch (_) {}
  } finally {
    await browser.close();
    log('🔒 Browser closed.');
  }
}

/**
 * GENERATE - Tạo key mới (headless) bằng API call trực tiếp
 */
async function cmdGenerate() {
  if (!hasSession()) {
    log('❌ No saved session. Run "login" first: node scripts/morrenus_key_manager.js login');
    process.exit(1);
  }

  log('🔄 Generating new API key (headless)...');
  const { browser, context, page } = await launchBrowser(true);

  try {
    // Kiểm tra login
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      log('❌ Session expired. Please run "login" again.');
      console.log('SESSION_EXPIRED=true');
      await browser.close();
      process.exit(1);
    }
    log('✅ Session valid, on API keys page.');

    // Đọc trạng thái hiện tại
    const currentInfo = await extractKeyInfo(page);
    log(`📊 Current: active=${currentInfo.hasActiveKey}, today=${currentInfo.todayUsage}/${currentInfo.dailyLimit}`);

    // Nếu đã có key active → revoke trước bằng API
    if (currentInfo.hasActiveKey) {
      log('⚠️ Active key exists. Revoking via API first...');
      const revokeResult = await page.evaluate(async () => {
        const res = await fetch('/api-keys/revoke-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          credentials: 'include',
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        return { status: res.status, ok: res.ok, json, text };
      });
      const revokeOk = revokeResult?.json?.success || revokeResult?.ok;
      if (revokeOk) {
        log('   ✅ Old key revoked.');
        await page.waitForTimeout(1000);
      } else {
        const detail = revokeResult?.json?.error || revokeResult?.json?.message || revokeResult?.text || JSON.stringify(revokeResult);
        log(`   ⚠️ Revoke failed (status ${revokeResult?.status || 'n/a'}): ${String(detail).slice(0, 200)}`);
        log('   Trying Generate anyway...');
      }
    }

    // Generate key mới bằng API call (bắt được api_key trong response!)
    log('🔄 Generating new key via API...');
    const tryGenerate = async (endpoint) => {
      return await page.evaluate(async (url) => {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({})
        });
        const text = await res.text();
        let json = null;
        try { json = JSON.parse(text); } catch (_) {}
        return { status: res.status, ok: res.ok, json, text };
      }, endpoint);
    };

    let genResult = await tryGenerate('/api-keys/generate-key');
    if (!genResult?.json?.api_key && !genResult?.json?.success) {
      const fallbackEndpoints = ['/api-keys/generate', '/api-keys/create', '/api-keys/new'];
      for (const endpoint of fallbackEndpoints) {
        log(`   ↪️ Trying fallback endpoint: ${endpoint}`);
        genResult = await tryGenerate(endpoint);
        if (genResult?.json?.api_key || genResult?.json?.success) break;
      }
    }

    const genPayload = genResult?.json || {};
    if ((genPayload.success || genResult?.ok) && genPayload.api_key) {
      const newKey = genPayload.api_key;
      log(`✅ NEW KEY GENERATED: ${newKey.substring(0, 30)}...`);
      log(`   Expires: ${genPayload.expires_at || 'N/A'}`);

      // Cập nhật .env và hot-reload file
      updateEnvKey(newKey);

      // Lưu session
      await saveSession(context);

      // Output cho caller (bot integration / machine parsing)
      console.log(`NEW_KEY=${newKey}`);
    } else {
      const detail = genPayload.error || genPayload.message || genResult?.text || JSON.stringify(genResult);
      log(`❌ Generate failed (status ${genResult?.status || 'n/a'}): ${String(detail).slice(0, 300)}`);
      // Screenshot debug
      await page.screenshot({ path: path.join(SESSION_DIR, 'debug_generate.png') });
      log(`   Screenshot: ${SESSION_DIR}/debug_generate.png`);
    }
  } catch (e) {
    log(`❌ Generate error: ${e.message}`);
    try {
      await page.screenshot({ path: path.join(SESSION_DIR, 'error_generate.png') });
    } catch (_) {}
  } finally {
    await browser.close();
    log('🔒 Browser closed (RAM freed).');
  }
}

/**
 * REVOKE - Revoke key hiện tại (headless) bằng API
 */
async function cmdRevoke() {
  if (!hasSession()) {
    log('❌ No saved session. Run "login" first.');
    process.exit(1);
  }

  log('🗑️ Revoking current API key (headless)...');
  const { browser, context, page } = await launchBrowser(true);

  try {
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      log('❌ Session expired. Please run "login" again.');
      console.log('SESSION_EXPIRED=true');
      await browser.close();
      process.exit(1);
    }

    // Gọi API revoke trực tiếp
    const revokeResult = await page.evaluate(async () => {
      const res = await fetch('/api-keys/revoke-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      return await res.json();
    });

    if (revokeResult.success) {
      log('✅ Key revoked successfully.');
    } else {
      log(`❌ Revoke failed: ${revokeResult.error || JSON.stringify(revokeResult)}`);
    }

    await saveSession(context);
  } catch (e) {
    log(`❌ Revoke error: ${e.message}`);
  } finally {
    await browser.close();
    log('🔒 Browser closed.');
  }
}

/**
 * STATUS - Kiểm tra trạng thái key (headless)
 */
async function cmdStatus() {
  if (!hasSession()) {
    log('❌ No saved session. Run "login" first.');
    process.exit(1);
  }

  log('📊 Checking key status (headless)...');
  const { browser, context, page } = await launchBrowser(true);

  try {
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      log('❌ Session expired. Please run "login" again.');
      console.log('SESSION_EXPIRED=true');
      await browser.close();
      process.exit(1);
    }

    const info = await extractKeyInfo(page);
    log('');
    log('=== Morrenus API Key Status ===');
    log(`  Active:      ${info.hasActiveKey ? '✅ Yes' : '❌ No'}`);
    log(`  Key:         ${info.apiKey ? info.apiKey.substring(0, 25) + '...' : 'N/A'}`);
    log(`  Usage Today: ${info.todayUsage ?? '?'}/${info.dailyLimit ?? '?'}`);
    log(`  Total Usage: ${info.totalUsage ?? '?'}`);
    log(`  This Month:  ${info.thisMonth ?? '?'}`);
    log(`  Monthly Lim: ${info.monthlyLimit ?? '?'}`);
    log(`  Time Left:   ${info.timeLeft ?? '?'}`);
    log(`  Created:     ${info.created ?? '?'}`);
    log(`  Expires:     ${info.expires ?? '?'}`);
    log('================================');

    // Output cho machine parsing
    console.log(`STATUS_JSON=${JSON.stringify(info)}`);

    await saveSession(context);
  } catch (e) {
    log(`❌ Status error: ${e.message}`);
  } finally {
    await browser.close();
    log('🔒 Browser closed.');
  }
}

/**
 * EXTRACT - Chỉ lấy key value (headless, nhanh)
 */
async function cmdExtract() {
  if (!hasSession()) {
    log('❌ No saved session. Run "login" first.');
    process.exit(1);
  }

  log('🔑 Extracting current API key...');
  const { browser, context, page } = await launchBrowser(true);

  try {
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
      log('❌ Session expired.');
      console.log('SESSION_EXPIRED=true');
      await browser.close();
      process.exit(1);
    }

    const info = await extractKeyInfo(page);
    if (info.apiKey) {
      log(`✅ Key: ${info.apiKey.substring(0, 30)}...`);
      console.log(`CURRENT_KEY=${info.apiKey}`);
    } else {
      log('⚠️ Could not extract key. It may be hidden or require clicking to reveal.');
      // Screenshot for debug
      await page.screenshot({ path: path.join(SESSION_DIR, 'debug_extract.png') });

      // Dump full HTML
      const html = await page.content();
      fs.writeFileSync(path.join(SESSION_DIR, 'page_dump.html'), html);
      log(`   Page HTML saved to ${SESSION_DIR}/page_dump.html for analysis.`);
    }

    await saveSession(context);
  } catch (e) {
    log(`❌ Extract error: ${e.message}`);
  } finally {
    await browser.close();
  }
}

// ========== .ENV UPDATE ==========

/**
 * Cập nhật API key trong .env file (KHÔNG restart bot)
 */
function updateEnvKey(newKey) {
  let env = '';
  let updated = false;

  if (fs.existsSync(ENV_PATH)) {
    env = fs.readFileSync(ENV_PATH, 'utf8');
  }

  // Update MORRENUS_API_KEY
  if (env.includes('MORRENUS_API_KEY=')) {
    env = env.replace(/MORRENUS_API_KEY=.*/g, `MORRENUS_API_KEY=${newKey}`);
    updated = true;
  }

  // Update MORRENUS_API_KEYS (can contain multiple keys; set new key as primary)
  if (env.includes('MORRENUS_API_KEYS=')) {
    env = env.replace(/MORRENUS_API_KEYS=.*/g, `MORRENUS_API_KEYS=${newKey}`);
    updated = true;
  }

  if (updated) {
    fs.writeFileSync(ENV_PATH, env);
    log(`[INFO] .env updated with new key.`);
  }

  const wroteKeyFile = (() => {
    try {
      const dir = path.dirname(KEY_FILE_PATH);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(KEY_FILE_PATH, newKey);
      log(`[INFO] Active key written to ${KEY_FILE_PATH}`);
      return true;
    } catch (e) {
      log(`[WARN] Failed to write key file: ${e.message}`);
      return false;
    }
  })();

  if (updated || wroteKeyFile) {
    syncKeyToRender(newKey).catch(() => {});
  }

  if (!updated && !fs.existsSync(ENV_PATH)) {
    log(`[INFO] .env not found at ${ENV_PATH} (ok on Render).`);
  }

  return updated || wroteKeyFile;
}

/**
 * Sync key mới lên Render bot qua HTTP endpoint /update-morrenus-key
 * Cần RENDER_URL và ADMIN_TOKEN trong .env
 */
async function syncKeyToRender(newKey) {
  try {
    // Đọc env config
    const envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';

    // Lấy Render URL (PUBLIC_BASE_URL hoặc RENDER_URL)
    const renderUrlMatch = envContent.match(/(?:RENDER_URL|PUBLIC_BASE_URL)=(.+)/);
    const renderUrl = process.env.RENDER_URL
      || process.env.PUBLIC_BASE_URL
      || (renderUrlMatch ? renderUrlMatch[1].trim() : null);

    // Lấy ADMIN_TOKEN
    const adminTokenMatch = envContent.match(/ADMIN_TOKEN=(.+)/);
    const adminToken = process.env.ADMIN_TOKEN || (adminTokenMatch ? adminTokenMatch[1].trim() : null);

    if (!renderUrl || !adminToken || renderUrl.includes('localhost')) {
      log('ℹ️ Render sync skipped (no remote URL or ADMIN_TOKEN)');
      return;
    }

    const url = `${renderUrl}/update-morrenus-key`;
    log(`🌐 Syncing key to Render: ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': adminToken,
      },
      body: JSON.stringify({ key: newKey }),
      signal: AbortSignal.timeout(15000),
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      log(`✅ Key synced to Render! Pool size: ${data.poolSize || '?'}`);
    } else {
      log(`⚠️ Render sync failed (${response.status}): ${data.error || 'unknown'}`);
    }
  } catch (e) {
    log(`⚠️ Render sync error: ${e.message}`);
  }
}

// ========== MAIN ==========

const command = process.argv[2]?.toLowerCase();
const COMMANDS = {
  login: cmdLogin,
  generate: cmdGenerate,
  revoke: cmdRevoke,
  status: cmdStatus,
  extract: cmdExtract,
};

if (!command || !COMMANDS[command]) {
  console.log(`
🔧 Morrenus API Key Manager

Commands:
  login     Mở browser, đăng nhập Discord OAuth, lưu session
  generate  Tạo key mới (headless, tự động revoke key cũ)
  status    Kiểm tra trạng thái key hiện tại
  extract   Lấy API key value từ dashboard
  revoke    Revoke key hiện tại

Usage:
  node scripts/morrenus_key_manager.js login      # Lần đầu: đăng nhập
  node scripts/morrenus_key_manager.js generate   # Khi key hết quota
  node scripts/morrenus_key_manager.js status     # Xem usage

RAM optimization: ~150MB peak (Chromium headless), released ngay sau khi xong.
  `);
  process.exit(0);
}

log(`Running command: ${command}`);
COMMANDS[command]()
  .then(() => {
    log('Done.');
    process.exit(0);
  })
  .catch(e => {
    log(`Fatal error: ${e.message}`);
    process.exit(1);
  });

