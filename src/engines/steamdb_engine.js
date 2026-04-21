const axios = require('axios');
const cheerio = require('cheerio');
const { execFile } = require('child_process');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

function resolveEngineName() {
  return String(process.env.STEAMDB_ENGINE || 'js').trim().toLowerCase();
}

function resolveTimeoutMs(overrideMs) {
  if (Number.isFinite(overrideMs) && overrideMs > 0) return overrideMs;
  const parsed = Number.parseInt(process.env.STEAMDB_ENGINE_TIMEOUT_MS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 15000;
}

function parseNumber(value) {
  const parsed = Number.parseInt(String(value || '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFloatSafe(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isBotProtectionPage(html, title = '') {
  const snippet = `${title}\n${String(html || '').slice(0, 10000)}`.toLowerCase();
  const markers = [
    'checking your browser',
    'just a moment',
    'attention required',
    'cloudflare',
    'cf-chl',
    'security check to access',
  ];
  return markers.some((marker) => snippet.includes(marker));
}

function parseSteamDbHtml(html) {
  if (!html || typeof html !== 'string') return null;

  const $ = cheerio.load(html);
  const info = {};

  const title = $('h1').first().text().trim()
    || $('title').text().replace(/\s*-\s*SteamDB.*$/i, '').trim();
  if (isBotProtectionPage(html, title)) return null;
  if (title) info.name = title;

  $('table tr').each((_, row) => {
    const label = $(row).find('td').first().text().trim();
    const value = $(row).find('td').last().text().trim();
    if (!label || !value) return;

    if (label.includes('Developer')) {
      info.developer = value || 'Unknown';
      return;
    }
    if (label.includes('Publisher')) {
      info.publisher = value || 'Unknown';
      return;
    }
    if (label.includes('Release Date')) {
      info.releaseDate = value;
      return;
    }
    if (label.includes('Last Record Update')) {
      info.lastUpdate = value.split('–')[0].trim();
      return;
    }
    if (label.toLowerCase().includes('dlc')) {
      const dlcCount = parseNumber(value);
      if (dlcCount !== null) info.dlcCount = dlcCount;
    }
  });

  const sizePatterns = [
    /Total\s+size\s+on\s+disk\s+is\s+([\d.]+)\s*(GiB|MiB|GB|MB)/i,
    /total\s+download\s+size\s+is\s+([\d.]+)\s*(GiB|MiB|GB|MB)/i,
    /([\d.]+)\s*(GiB|MiB|GB|MB).*?total/i,
    /<td>Size<\/td>\s*<td[^>]*>([\d.]+)\s*(GiB|MiB|GB|MB)/i,
    /Disk\s+Space[:\s]+([\d.]+)\s*(GiB|MiB|GB|MB)/i,
  ];

  let sizeMatch = null;
  let isFull = false;
  for (let i = 0; i < sizePatterns.length; i += 1) {
    sizeMatch = html.match(sizePatterns[i]);
    if (sizeMatch) {
      isFull = i === 0;
      break;
    }
  }

  if (sizeMatch) {
    const size = parseFloatSafe(sizeMatch[1]);
    const unit = String(sizeMatch[2] || '').toUpperCase();
    if (size && size > 0 && size < 2000) {
      const isGb = unit.includes('GIB') || unit === 'GB';
      info.size = isGb ? size * 1024 * 1024 * 1024 : size * 1024 * 1024;
      info.sizeFormatted = `${size} ${unit.replace(/I/g, '')}`;
      info.sizeType = isFull ? 'FULL' : 'Base';
    }
  }

  const ratingMatch = html.match(/([\d.]+)%.*?(\d+[\d,]*)\s+reviews/i);
  if (ratingMatch) {
    info.rating = `${ratingMatch[1]}%`;
    info.reviewCount = String(ratingMatch[2]).replace(/,/g, '');
  }

  return Object.keys(info).length > 0 ? info : null;
}

function parseExternalOutput(stdout) {
  if (!stdout || !stdout.trim() || stdout.trim() === 'null') return null;
  const parsed = JSON.parse(stdout);
  if (parsed && typeof parsed === 'object' && parsed.error) {
    throw new Error(parsed.message || parsed.error);
  }
  return parsed && typeof parsed === 'object' ? parsed : null;
}

async function fetchViaJs(appId, timeoutMs) {
  const response = await axios.get(`https://steamdb.info/app/${appId}/`, {
    timeout: timeoutMs,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });

  return parseSteamDbHtml(response.data);
}

async function fetchViaPython(appId, timeoutMs) {
  const scriptPath = process.env.STEAMDB_PY_ENGINE_SCRIPT
    || path.join(__dirname, '..', '..', 'scripts', 'engines', 'steamdb_engine.py');
  const pythonBins = String(process.env.PYTHON_BIN || 'python,python3')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  let lastError = null;
  for (const pythonBin of pythonBins) {
    try {
      const { stdout } = await execFileAsync(
        pythonBin,
        [String(scriptPath), String(appId), String(timeoutMs)],
        { timeout: timeoutMs + 3000, maxBuffer: 2 * 1024 * 1024 }
      );
      return parseExternalOutput(stdout);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('No Python interpreter available for STEAMDB_ENGINE=python');
}

async function fetchViaBinary(binaryPath, appId, timeoutMs) {
  const { stdout } = await execFileAsync(
    binaryPath,
    [String(appId), String(timeoutMs)],
    { timeout: timeoutMs + 3000, maxBuffer: 2 * 1024 * 1024 }
  );
  return parseExternalOutput(stdout);
}

function resolveEngineBinary(kind) {
  const isWindows = process.platform === 'win32';

  if (kind === 'go') {
    return process.env.STEAMDB_GO_ENGINE_BIN
      || path.join(__dirname, '..', '..', 'bin', isWindows ? 'steamdb_engine_go.exe' : 'steamdb_engine_go');
  }
  if (kind === 'rust') {
    return process.env.STEAMDB_RUST_ENGINE_BIN
      || path.join(__dirname, '..', '..', 'bin', isWindows ? 'steamdb_engine_rust.exe' : 'steamdb_engine_rust');
  }
  if (kind === 'cpp') {
    return process.env.STEAMDB_CPP_ENGINE_BIN
      || path.join(__dirname, '..', '..', 'bin', isWindows ? 'steamdb_engine_cpp.exe' : 'steamdb_engine_cpp');
  }

  return '';
}

async function fetchSteamDbInfo(appId, options = {}) {
  const engine = resolveEngineName();
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  const logger = options.log;

  try {
    if (engine === 'python') {
      return await fetchViaPython(appId, timeoutMs);
    }
    if (engine === 'go' || engine === 'rust' || engine === 'cpp') {
      const binaryPath = resolveEngineBinary(engine);
      return await fetchViaBinary(binaryPath, appId, timeoutMs);
    }
    return await fetchViaJs(appId, timeoutMs);
  } catch (error) {
    if (typeof logger === 'function') {
      logger('WARN', `SteamDB engine "${engine}" failed. Falling back to JS provider.`, {
        appId: String(appId),
        error: error?.message || String(error),
      });
    }

    if (engine === 'js') return null;
    try {
      return await fetchViaJs(appId, timeoutMs);
    } catch (jsError) {
      if (typeof logger === 'function') {
        logger('WARN', 'SteamDB JS fallback failed.', {
          appId: String(appId),
          error: jsError?.message || String(jsError),
        });
      }
      return null;
    }
  }
}

module.exports = {
  fetchSteamDbInfo,
};
