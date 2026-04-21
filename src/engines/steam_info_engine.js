const axios = require('axios');
const { execFile } = require('child_process');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

function resolveEngineName() {
  return String(process.env.STEAM_INFO_ENGINE || 'js').trim().toLowerCase();
}

function resolveTimeoutMs(overrideMs) {
  if (Number.isFinite(overrideMs) && overrideMs > 0) return overrideMs;
  const parsed = Number.parseInt(process.env.STEAM_INFO_ENGINE_TIMEOUT_MS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 10000;
}

async function fetchViaJs(appId, timeoutMs) {
  const response = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`, {
    timeout: timeoutMs,
  });

  const entry = response?.data?.[String(appId)];
  if (!entry?.success) return null;
  return entry.data || null;
}

function parseExternalOutput(stdout) {
  if (!stdout || !stdout.trim()) return null;
  const parsed = JSON.parse(stdout);
  return parsed && typeof parsed === 'object' ? parsed : null;
}

async function fetchViaPython(appId, timeoutMs) {
  const scriptPath = process.env.STEAM_PY_ENGINE_SCRIPT
    || path.join(__dirname, '..', '..', 'scripts', 'engines', 'steam_info_engine.py');
  const pythonBins = String(process.env.PYTHON_BIN || 'python,python3')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  let lastError = null;
  for (const pythonBin of pythonBins) {
    try {
      const { stdout } = await execFileAsync(
        pythonBin,
        [scriptPath, String(appId), String(timeoutMs)],
        { timeout: timeoutMs + 2000, maxBuffer: 2 * 1024 * 1024 }
      );
      return parseExternalOutput(stdout);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('No Python interpreter available for STEAM_INFO_ENGINE=python');
}

async function fetchViaBinary(binaryPath, appId, timeoutMs) {
  const { stdout } = await execFileAsync(
    binaryPath,
    [String(appId), String(timeoutMs)],
    { timeout: timeoutMs + 2000, maxBuffer: 2 * 1024 * 1024 }
  );
  return parseExternalOutput(stdout);
}

function resolveEngineBinary(kind) {
  const isWindows = process.platform === 'win32';
  if (kind === 'go') {
    return process.env.STEAM_GO_ENGINE_BIN
      || path.join(__dirname, '..', '..', 'bin', isWindows ? 'steam_info_engine_go.exe' : 'steam_info_engine_go');
  }
  if (kind === 'rust') {
    return process.env.STEAM_RUST_ENGINE_BIN
      || path.join(__dirname, '..', '..', 'bin', isWindows ? 'steam_info_engine_rust.exe' : 'steam_info_engine_rust');
  }
  if (kind === 'cpp') {
    return process.env.STEAM_CPP_ENGINE_BIN
      || path.join(__dirname, '..', '..', 'bin', isWindows ? 'steam_info_engine_cpp.exe' : 'steam_info_engine_cpp');
  }
  return '';
}

async function fetchSteamStoreRaw(appId, options = {}) {
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
      logger('WARN', `Steam info engine "${engine}" failed. Falling back to JS provider.`, {
        appId: String(appId),
        error: error?.message || String(error),
      });
    }
    return fetchViaJs(appId, timeoutMs);
  }
}

module.exports = {
  fetchSteamStoreRaw,
};
