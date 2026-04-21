const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BIN_DIR = path.join(ROOT, 'bin');
const RUST_CHECKSUM_BUILD_SCRIPT = path.join(ROOT, 'scripts', 'engines', 'build_checksum_rust.js');
const GO_TARGETS = [
  {
    source: path.join(ROOT, 'scripts', 'engines', 'go', 'steam_info_engine.go'),
    output: path.join(BIN_DIR, process.platform === 'win32' ? 'steam_info_engine_go.exe' : 'steam_info_engine_go'),
    label: 'steam_info_engine',
  },
  {
    source: path.join(ROOT, 'scripts', 'engines', 'go', 'steamdb_engine.go'),
    output: path.join(BIN_DIR, process.platform === 'win32' ? 'steamdb_engine_go.exe' : 'steamdb_engine_go'),
    label: 'steamdb_engine',
  },
];

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'pipe',
    encoding: 'utf8',
    ...options,
  });
  return result;
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function main() {
  ensureDir(BIN_DIR);

  const checkGo = run('go', ['version']);
  if (checkGo.status !== 0) {
    console.error('[build:engines] Go toolchain not found. Install Go or keep STEAM_INFO_ENGINE=js/python.');
    if (checkGo.stderr) console.error(checkGo.stderr.trim());
    process.exit(1);
  }

  console.log(`[build:engines] ${checkGo.stdout.trim()}`);

  let builtCount = 0;
  for (const target of GO_TARGETS) {
    if (!fs.existsSync(target.source)) {
      console.warn(`[build:engines] Skip missing source (${target.label}): ${target.source}`);
      continue;
    }

    console.log(`[build:engines] Building ${target.label} -> ${target.output}`);
    const build = run('go', ['build', '-o', target.output, target.source]);
    if (build.status !== 0) {
      console.error(`[build:engines] Go build failed for ${target.label}.`);
      if (build.stdout) console.error(build.stdout.trim());
      if (build.stderr) console.error(build.stderr.trim());
      process.exit(1);
    }

    const stat = fs.statSync(target.output);
    console.log(`[build:engines] ${target.label} OK (${stat.size} bytes)`);
    builtCount += 1;
  }

  if (builtCount === 0) {
    console.error('[build:engines] No engine sources found to build.');
    process.exit(1);
  }

  if (fs.existsSync(RUST_CHECKSUM_BUILD_SCRIPT)) {
    console.log('[build:engines] Running optional Rust checksum build...');
    const rustBuild = run('node', [RUST_CHECKSUM_BUILD_SCRIPT]);
    if (rustBuild.status !== 0) {
      console.error('[build:engines] Optional Rust checksum build failed.');
      if (rustBuild.stdout) console.error(rustBuild.stdout.trim());
      if (rustBuild.stderr) console.error(rustBuild.stderr.trim());
      process.exit(1);
    }
    if (rustBuild.stdout) console.log(rustBuild.stdout.trim());
  }
}

main();
