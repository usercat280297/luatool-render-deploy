const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

function resolveEngineName() {
  return String(process.env.CHECKSUM_ENGINE || 'js').trim().toLowerCase();
}

function resolveTimeoutMs(overrideMs) {
  if (Number.isFinite(overrideMs) && overrideMs > 0) return overrideMs;
  const parsed = Number.parseInt(process.env.CHECKSUM_ENGINE_TIMEOUT_MS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 45000;
}

function normalizeAlgorithm(algorithm) {
  const raw = String(algorithm || 'sha256').trim().toLowerCase();
  if (raw === 'sha256' || raw === 'sha-256') return 'sha256';
  if (raw === 'sha1' || raw === 'sha-1') return 'sha1';
  if (raw === 'md5') return 'md5';
  return 'sha256';
}

function parseExternalOutput(stdout) {
  const value = String(stdout || '').trim();
  if (!value || value === 'null') return null;

  const parsed = value.match(/\b[a-fA-F0-9]{32,128}\b/);
  if (!parsed) return null;
  return parsed[0].toLowerCase();
}

async function computeViaJs(filePath, algorithm) {
  await fs.promises.access(filePath, fs.constants.R_OK);

  return new Promise((resolve, reject) => {
    const hasher = crypto.createHash(algorithm);
    const stream = fs.createReadStream(filePath);

    stream.on('error', reject);
    stream.on('data', (chunk) => hasher.update(chunk));
    stream.on('end', () => resolve(hasher.digest('hex').toLowerCase()));
  });
}

function resolveEngineBinary(kind) {
  const isWindows = process.platform === 'win32';
  if (kind === 'rust') {
    return process.env.CHECKSUM_RUST_ENGINE_BIN
      || path.join(__dirname, '..', '..', 'bin', isWindows ? 'checksum_engine_rust.exe' : 'checksum_engine_rust');
  }
  if (kind === 'go') {
    return process.env.CHECKSUM_GO_ENGINE_BIN
      || path.join(__dirname, '..', '..', 'bin', isWindows ? 'checksum_engine_go.exe' : 'checksum_engine_go');
  }
  if (kind === 'cpp') {
    return process.env.CHECKSUM_CPP_ENGINE_BIN
      || path.join(__dirname, '..', '..', 'bin', isWindows ? 'checksum_engine_cpp.exe' : 'checksum_engine_cpp');
  }
  return '';
}

async function computeViaBinary(binaryPath, filePath, algorithm, timeoutMs) {
  const { stdout } = await execFileAsync(
    binaryPath,
    [filePath, algorithm],
    { timeout: timeoutMs, maxBuffer: 1024 * 1024 }
  );
  return parseExternalOutput(stdout);
}

async function computeFileChecksum(filePath, options = {}) {
  const algorithm = normalizeAlgorithm(options.algorithm || 'sha256');
  const engine = resolveEngineName();
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  const logger = options.log;

  try {
    if (engine === 'rust' || engine === 'go' || engine === 'cpp') {
      const binaryPath = resolveEngineBinary(engine);
      const value = await computeViaBinary(binaryPath, filePath, algorithm, timeoutMs);
      if (value) return value;
      throw new Error(`Checksum engine "${engine}" returned empty output`);
    }

    return await computeViaJs(filePath, algorithm);
  } catch (error) {
    if (typeof logger === 'function') {
      logger('WARN', `Checksum engine "${engine}" failed. Falling back to JS provider.`, {
        file: filePath,
        algorithm,
        error: error?.message || String(error),
      });
    }

    if (engine === 'js') return null;
    try {
      return await computeViaJs(filePath, algorithm);
    } catch (fallbackError) {
      if (typeof logger === 'function') {
        logger('WARN', 'Checksum JS fallback failed.', {
          file: filePath,
          algorithm,
          error: fallbackError?.message || String(fallbackError),
        });
      }
      return null;
    }
  }
}

module.exports = {
  computeFileChecksum,
};
