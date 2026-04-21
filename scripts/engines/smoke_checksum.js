require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { computeFileChecksum } = require('../../src/engines/checksum_engine');

async function main() {
  const engine = process.env.CHECKSUM_ENGINE || 'js';
  const targetPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(__dirname, '..', '..', 'README.md');

  if (!fs.existsSync(targetPath)) {
    console.error(`[smoke:checksum] file not found: ${targetPath}`);
    process.exit(1);
  }

  const checksum = await computeFileChecksum(targetPath, {
    algorithm: 'sha256',
    timeoutMs: 30000,
    log: (type, message, payload) => {
      if (type === 'WARN' || type === 'ERROR') {
        console.log(`[${type}] ${message}`, payload || '');
      }
    },
  });

  if (!checksum) {
    console.error(`[smoke:checksum] failed engine=${engine} file="${targetPath}"`);
    process.exit(1);
  }

  console.log(`[smoke:checksum] engine=${engine} file="${targetPath}" sha256=${checksum}`);
}

main().catch((error) => {
  console.error('[smoke:checksum] fatal:', error?.message || error);
  process.exit(1);
});
