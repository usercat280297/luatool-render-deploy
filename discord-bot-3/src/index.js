const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');
const dotenv = require('dotenv');
const {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  AttachmentBuilder,
} = require('discord.js');

dotenv.config();

const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const APP_ID = process.env.DISCORD_APP_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const OUTPUT_DIR = process.env.OUTPUT_DIR || 'output';

if (!BOT_TOKEN || !APP_ID || !GUILD_ID) {
  console.error('Missing DISCORD_BOT_TOKEN, DISCORD_APP_ID, or DISCORD_GUILD_ID in .env');
  process.exit(1);
}

const sourceConfigs = parseSources(process.env.GEN_SOURCES_JSON || '[]');

const genCommand = new SlashCommandBuilder()
  .setName('gen')
  .setDescription('Lay file lua + manifest theo Steam appid tu cac source duoc cau hinh')
  .addStringOption(option =>
    option
      .setName('appid')
      .setDescription('Steam appid')
      .setRequired(true)
  );

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerCommands();
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== 'gen') return;

  const appidRaw = interaction.options.getString('appid', true).trim();
  if (!/^\d+$/.test(appidRaw)) {
    await interaction.reply({
      content: 'appid khong hop le. Vui long nhap so nguyen duong.',
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply();

  try {
    const result = await fetchFromSources(appidRaw, sourceConfigs);
    if (!result.luaPath && !result.manifestPath) {
      const details = result.attempts.length
        ? result.attempts.map(x => `- ${x.source}: ${x.message}`).join('\n')
        : '- Khong co source nao duoc cau hinh.';

      await interaction.editReply({
        content: [
          `Khong tim thay lua/manifest cho appid ${appidRaw}.`,
          '',
          'Chi tiet da thu:',
          details,
        ].join('\n'),
      });
      return;
    }

    const files = [];
    if (result.luaPath) {
      files.push(new AttachmentBuilder(result.luaPath));
    }
    if (result.manifestPath) {
      files.push(new AttachmentBuilder(result.manifestPath));
    }

    const summary = [
      `Hoan tat /gen cho appid ${appidRaw}.`,
      `Lua: ${result.luaPath ? 'co' : 'khong'}`,
      `Manifest: ${result.manifestPath ? 'co' : 'khong'}`,
      `Source lua: ${result.luaSource || 'n/a'}`,
      `Source manifest: ${result.manifestSource || 'n/a'}`,
    ].join('\n');

    await interaction.editReply({
      content: summary,
      files,
    });
  } catch (error) {
    await interaction.editReply({
      content: `Loi khi xu ly /gen: ${error.message}`,
    });
  }
});

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  await rest.put(Routes.applicationGuildCommands(APP_ID, GUILD_ID), {
    body: [genCommand.toJSON()],
  });
  console.log('Slash commands registered.');
}

function parseSources(rawJson) {
  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('GEN_SOURCES_JSON must be valid JSON array.');
  }

  if (!Array.isArray(parsed)) {
    throw new Error('GEN_SOURCES_JSON must be an array.');
  }

  return parsed
    .map((item, index) => ({
      name: String(item.name || `source-${index + 1}`),
      luaUrl: typeof item.luaUrl === 'string' ? item.luaUrl : null,
      manifestUrl: typeof item.manifestUrl === 'string' ? item.manifestUrl : null,
      headers: item.headers && typeof item.headers === 'object' ? item.headers : {},
    }))
    .filter(item => item.luaUrl || item.manifestUrl);
}

async function fetchFromSources(appid, sources) {
  ensureDir(path.resolve(OUTPUT_DIR));

  const attempts = [];
  let luaPath = null;
  let manifestPath = null;
  let luaSource = null;
  let manifestSource = null;

  for (const source of sources) {
    if (!luaPath && source.luaUrl) {
      const url = source.luaUrl.replaceAll('{appid}', appid);
      const luaResult = await fetchFile(url, source.headers, 'text');
      if (luaResult.ok && typeof luaResult.data === 'string' && luaResult.data.trim()) {
        luaPath = path.resolve(OUTPUT_DIR, `${appid}.lua`);
        fs.writeFileSync(luaPath, luaResult.data, 'utf8');
        luaSource = source.name;
      } else {
        attempts.push({
          source: `${source.name} (lua)`,
          message: luaResult.message,
        });
      }
    }

    if (!manifestPath && source.manifestUrl) {
      const url = source.manifestUrl.replaceAll('{appid}', appid);
      const manifestResult = await fetchFile(url, source.headers, 'arraybuffer');
      if (manifestResult.ok && manifestResult.data) {
        const outPath = path.resolve(OUTPUT_DIR, `${appid}.manifest`);
        fs.writeFileSync(outPath, Buffer.from(manifestResult.data));
        manifestPath = outPath;
        manifestSource = source.name;
      } else {
        attempts.push({
          source: `${source.name} (manifest)`,
          message: manifestResult.message,
        });
      }
    }

    if (luaPath && manifestPath) break;
  }

  return {
    luaPath,
    manifestPath,
    luaSource,
    manifestSource,
    attempts,
  };
}

async function fetchFile(url, headers, responseType) {
  try {
    const response = await axios.get(url, {
      headers,
      responseType,
      timeout: 20000,
      validateStatus: () => true,
    });

    if (response.status >= 200 && response.status < 300) {
      return { ok: true, data: response.data };
    }

    return {
      ok: false,
      message: `${response.status} ${response.statusText}`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error.message || 'network error',
    };
  }
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

client.login(BOT_TOKEN);
