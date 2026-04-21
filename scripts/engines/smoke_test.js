require('dotenv').config();

const { fetchSteamStoreRaw } = require('../../src/engines/steam_info_engine');
const { fetchSteamDbInfo } = require('../../src/engines/steamdb_engine');

function parseArgs(argv) {
  const parsed = {
    target: 'steam',
    appId: '570',
  };

  for (const arg of argv) {
    if (arg.startsWith('--target=')) {
      const target = arg.slice('--target='.length).trim().toLowerCase();
      if (target === 'steamdb' || target === 'steam') {
        parsed.target = target;
      }
      continue;
    }
    if (!arg.startsWith('--') && parsed.appId === '570') {
      parsed.appId = arg;
    }
  }

  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { appId, target } = args;
  const timeoutMs = 10000;

  if (target === 'steamdb') {
    const engine = process.env.STEAMDB_ENGINE || 'js';
    const data = await fetchSteamDbInfo(appId, {
      timeoutMs,
      log: (type, message, payload) => {
        if (type === 'WARN' || type === 'ERROR') {
          console.log(`[${type}] ${message}`, payload || '');
        }
      },
    });

    if (!data) {
      console.error(`[smoke:engine] target=steamdb failed appId=${appId} via engine=${engine}`);
      process.exit(1);
    }

    console.log(`[smoke:engine] target=steamdb engine=${engine} appId=${appId} name="${data.name || 'N/A'}" size="${data.sizeFormatted || 'N/A'}"`);
    return;
  }

  const engine = process.env.STEAM_INFO_ENGINE || 'js';
  const data = await fetchSteamStoreRaw(appId, {
    timeoutMs,
    log: (type, message, payload) => {
      if (type === 'WARN' || type === 'ERROR') {
        console.log(`[${type}] ${message}`, payload || '');
      }
    },
  });

  if (!data) {
    console.error(`[smoke:engine] target=steam failed appId=${appId} via engine=${engine}`);
    process.exit(1);
  }

  console.log(`[smoke:engine] target=steam engine=${engine} appId=${appId} name="${data.name || 'N/A'}"`);
}

main().catch((error) => {
  console.error('[smoke:engine] fatal:', error?.message || error);
  process.exit(1);
});
