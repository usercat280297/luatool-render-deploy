const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BIN_DIR = path.join(ROOT, 'bin');
const SOURCE = path.join(ROOT, 'scripts', 'engines', 'rust', 'checksum_engine.rs');
const OUTPUT = path.join(BIN_DIR, process.platform === 'win32' ? 'checksum_engine_rust.exe' : 'checksum_engine_rust');

function run(cmd, args, options = {}) {
  return spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'pipe',
    encoding: 'utf8',
    ...options,
  });
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function main() {
  if (!fs.existsSync(SOURCE)) {
    console.warn(`[build:rust:checksum] Source not found: ${SOURCE}`);
    process.exit(0);
  }

  const check = run('rustc', ['--version']);
  if (check.status !== 0) {
    console.warn('[build:rust:checksum] rustc not found. Skip Rust checksum build.');
    if (check.stderr) console.warn(check.stderr.trim());
    process.exit(0);
  }

  ensureDir(BIN_DIR);
  console.log(`[build:rust:checksum] ${check.stdout.trim()}`);
  console.log(`[build:rust:checksum] Building -> ${OUTPUT}`);

  const build = run('rustc', [SOURCE, '-O', '-o', OUTPUT]);
  if (build.status !== 0) {
    console.error('[build:rust:checksum] Build failed.');
    if (build.stdout) console.error(build.stdout.trim());
    if (build.stderr) console.error(build.stderr.trim());
    process.exit(1);
  }

  const stat = fs.statSync(OUTPUT);
  console.log(`[build:rust:checksum] OK (${stat.size} bytes)`);
}

main();
