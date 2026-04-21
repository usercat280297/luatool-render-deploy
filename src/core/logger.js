const fs = require('fs');
const path = require('path');

function createLogger(config) {
  let suppressConsoleOutput = false;
  const noisyDiscordLogLastSeen = new Map();

  function isBrokenPipeError(error) {
    if (!error) return false;
    const message = String(error.message || '');
    return error.code === 'EPIPE' || message.includes('EPIPE') || message.toLowerCase().includes('broken pipe');
  }

  function safeConsole(method, ...args) {
    if (suppressConsoleOutput) return;
    try {
      const fn = typeof console[method] === 'function' ? console[method] : console.log;
      fn(...args);
    } catch (error) {
      if (isBrokenPipeError(error)) {
        suppressConsoleOutput = true;
      }
    }
  }

  function shouldSuppressNoisyDiscordLog(type, message) {
    if (!config.DISCORD_NOISY_LOG_SUPPRESS) return false;
    if (!['WARN', 'ERROR'].includes(type)) return false;
    if (message !== 'Discord shard reconnecting' && message !== 'Discord shard error') return false;

    const cooldownMs = Math.max(1000, Number(config.DISCORD_NOISY_LOG_COOLDOWN_MS || 60000));
    const key = `${type}:${message}`;
    const now = Date.now();
    const lastSeen = noisyDiscordLogLastSeen.get(key) || 0;

    if (now - lastSeen < cooldownMs) {
      return true;
    }

    noisyDiscordLogLastSeen.set(key, now);
    return false;
  }

  for (const stream of [process.stdout, process.stderr]) {
    if (stream && typeof stream.on === 'function') {
      stream.on('error', (error) => {
        if (isBrokenPipeError(error)) {
          suppressConsoleOutput = true;
        }
      });
    }
  }

  function rotateLogIfNeeded() {
    try {
      const dateStr = new Date().toISOString().split('T')[0];
      const logFile = path.join(config.LOGS_PATH, `${dateStr}.log`);
      const maxBytes = Math.max(0, Number(config.LOG_MAX_SIZE_MB || 0)) * 1024 * 1024;
      const maxFiles = Math.max(1, Number(config.LOG_MAX_FILES || 1));

      if (maxBytes > 0 && fs.existsSync(logFile)) {
        try {
          const st = fs.statSync(logFile);
          if (st.size >= maxBytes) {
            for (let i = maxFiles - 1; i >= 1; i--) {
              const src = path.join(config.LOGS_PATH, `${dateStr}.log.${i}`);
              const dst = path.join(config.LOGS_PATH, `${dateStr}.log.${i + 1}`);
              if (fs.existsSync(src)) {
                try { fs.renameSync(src, dst); } catch (error) {}
              }
            }
            const rotated = path.join(config.LOGS_PATH, `${dateStr}.log.1`);
            try { fs.renameSync(logFile, rotated); } catch (error) {}
            try {
              const excess = path.join(config.LOGS_PATH, `${dateStr}.log.${maxFiles + 1}`);
              if (fs.existsSync(excess)) fs.unlinkSync(excess);
            } catch (error) {}
            safeConsole('log', `[LOG ROTATE] Rotated existing large log ${logFile}`);
          }
        } catch (error) {}
      }
    } catch (error) {}
  }

  function log(type, message, data = {}) {
    const normalizedType = String(type || 'INFO').toUpperCase();
    if (!config.ENABLE_DETAILED_LOGGING && ['INFO', 'SUCCESS', 'DEBUG'].includes(normalizedType)) {
      return;
    }

    if (shouldSuppressNoisyDiscordLog(normalizedType, message)) {
      return;
    }

    const timestamp = new Date().toISOString();
    safeConsole('log', `[${timestamp}] [${normalizedType}] ${message}`);

    if (!config.LOG_TO_FILE) return;

    try {
      try { fs.mkdirSync(config.LOGS_PATH, { recursive: true }); } catch (error) {}

      const dateStr = new Date().toISOString().split('T')[0];
      const logFile = path.join(config.LOGS_PATH, `${dateStr}.log`);
      const maxBytes = Math.max(0, Number(config.LOG_MAX_SIZE_MB || 0)) * 1024 * 1024;
      const maxFiles = Math.max(1, Number(config.LOG_MAX_FILES || 1));

      try {
        if (maxBytes > 0 && fs.existsSync(logFile)) {
          const st = fs.statSync(logFile);
          if (st.size >= maxBytes) {
            for (let i = maxFiles - 1; i >= 1; i--) {
              const src = path.join(config.LOGS_PATH, `${dateStr}.log.${i}`);
              const dst = path.join(config.LOGS_PATH, `${dateStr}.log.${i + 1}`);
              if (fs.existsSync(src)) {
                try { fs.renameSync(src, dst); } catch (error) {}
              }
            }

            const rotated = path.join(config.LOGS_PATH, `${dateStr}.log.1`);
            try { fs.renameSync(logFile, rotated); } catch (error) {}

            try {
              const excess = path.join(config.LOGS_PATH, `${dateStr}.log.${maxFiles + 1}`);
              if (fs.existsSync(excess)) fs.unlinkSync(excess);
            } catch (error) {}
          }
        }
      } catch (error) {}

      fs.appendFileSync(logFile, JSON.stringify({ timestamp, type: normalizedType, message, ...data }) + '\n');
    } catch (error) {}
  }

  return {
    isBrokenPipeError,
    log,
    rotateLogIfNeeded,
    safeConsole,
  };
}

module.exports = {
  createLogger,
};
