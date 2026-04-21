// ============================================
// DISCORD LUA BOT - ENHANCED VERSION 2.0
// Multi-source data + Auto-delete + Online-Fix
// ============================================
require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ApplicationCommandOptionType, ActivityType, PermissionFlagsBits } = require('discord.js');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const dns = require('dns');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');
const express = require('express');
const app = express();
const execFileAsync = promisify(execFile);
const { CONFIG, DATA_ROOT, DISCORD_TOKEN_SOURCE, getGameTitleStatusIcon, parseBoolean, parsePositiveInt } = require('./core/config');
const { createLogger } = require('./core/logger');
const { fetchSteamStoreRaw } = require('./engines/steam_info_engine');
const { computeFileChecksum } = require('./engines/checksum_engine');
const {
  getAccurateGameSize,
  getGameNameFromSteamDB,
  getGameNameFromSteamHTML,
} = require('./services/steam_fallback_helpers');
const {
  buildManifestSummaryLines,
  detectDRMAccurate,
  detectPublisher,
  getManifestFileMeta,
} = require('./services/game_metadata_helpers');

const { log, safeConsole, isBrokenPipeError, rotateLogIfNeeded } = createLogger(CONFIG);
try { rotateLogIfNeeded(); } catch (error) {}

// ============================================
// AGGRESSIVE DEDUPLICATION SYSTEM
// ============================================
const MESSAGE_PROCESSING_TIMEOUT = 2000; // 2 seconds
const processed_messages = new Set(); // Track processed message IDs
const processing_commands = new Map(); // Track commands being processed
const DUPLICATE_THRESHOLD = 500; // ms between same command

function isMessageAlreadyProcessed(messageId) {
  return processed_messages.has(messageId);
}

function markMessageProcessed(messageId) {
  processed_messages.add(messageId);
  // Clean up old entries after 10 seconds
  setTimeout(() => {
    processed_messages.delete(messageId);
  }, 10000);
}

function isDuplicateCommand(userId, command) {
  const key = `${userId}:${command}`;
  const lastTime = processing_commands.get(key);

  if (lastTime && Date.now() - lastTime < DUPLICATE_THRESHOLD) {
    return true; // Duplicate command
  }

  processing_commands.set(key, Date.now());
  return false;
}

// ============================================
// DEDUPLICATION SYSTEM - Prevent duplicate messages
// ============================================
const messageProcessingSet = new Set();
const MESSAGE_DEDUP_TIMEOUT = 2000; // 2 seconds

// ============================================
// BOT VERSION & INSTANCE TRACKING
// ============================================
const BOT_VERSION = '2.0.0';
const BOT_INSTANCE_ID = Math.random().toString(36).substring(7);
const MESSAGE_HANDLERS = new Set(); // Track processed messages to prevent duplicates
const PROCESS_TIMEOUT = 1000; // 1 second timeout for message processing

safeConsole('log', `BOT INSTANCE: ${BOT_INSTANCE_ID} (v${BOT_VERSION})`);

if (CONFIG.DISCORD_FORCE_IPV4) {
  try {
    dns.setDefaultResultOrder('ipv4first');
    safeConsole('log', 'DNS default result order set to ipv4first for Discord connectivity');
  } catch (error) {
    safeConsole('warn', 'Failed to set DNS result order:', error.message);
  }
}


// ============================================
// EXPANDED DRM DATABASE (2024-2025 Games)
// ============================================

const DENUVO_GAMES = require('../data/denuvo_data');

// Extract IDs from DENUVO_GAMES
const DENUVO_IDS = DENUVO_GAMES.map(game => game.id);

const VERIFIED_DRM = {
  // ⚠️ DENUVO GAMES - EXPANDED LIST (Automatically populated)
  denuvo: [
    ...DENUVO_IDS,
  ],

  // EasyAntiCheat Games
  easyAntiCheat: [
    1517290, // Battlefield 2042
    1172470, // Apex Legends
    1665460, // eFootball
    730,     // Counter-Strike 2
    1086940, // Baldur's Gate 3 (multiplayer)
    892970,  // Valheim
    1623730, // Palworld (multiplayer)
  ],

  // BattlEye Anti-Cheat
  battleye: [
    578080,  // PUBG: Battlegrounds
    230410,  // Warframe
    252490,  // Rust
    1966720, // Starfield
    1938090, // Escape from Tarkov
    728880,  // Overwatch 2
  ],

  // ✅ VERIFIED DRM-FREE GAMES
  drmFree: [
    1623730, // Palworld
    413150,  // Stardew Valley
    1091500, // Cyberpunk 2077 (GOG)
    3590,    // Plants vs. Zombies GOTY
    367520,  // Hollow Knight
    646570,  // Slay the Spire
    892970,  // Valheim (DRM-free on GOG)
    1245620, // Elden Ring (Steam DRM only)
  ],

  // 🌐 NEEDS ONLINE-FIX
  needsOnlineFix: [
    3949040, // RV There Yet?
    2246460, // Monster Hunter Wilds
    1174180, // Red Dead Redemption 2
    1086940, // Baldur's Gate 3
    1426210, // It Takes Two
    1245620, // Elden Ring
    1091500, // Cyberpunk 2077
    271590,  // Grand Theft Auto V
    1938090, // Call of Duty: Modern Warfare III
    2519830, // Tekken 8
    2358720, // Mortal Kombat 1
    1517290, // Battlefield 2042
    1172470, // Apex Legends
    578080,  // PUBG
    730,     // CS2
    1623730, // Palworld
    892970,  // Valheim
    1966720, // Starfield
    2050650, // Persona 3 Reload
  ],
};

// ============================================
// ICONS & STYLING
// ============================================
const ICONS = {
  // General
  game: '🎮', link: '🔗', check: '✅', cross: '❌',
  warning: '⚠️', info: 'ℹ️', sparkles: '✨', fire: '🔥',

  // Game Info
  price: '💰', size: '💾', date: '📅', dlc: '🎯',
  language: '🌍', review: '⭐',

  // DRM Types
  denuvo: '🚫', antiCheat: '🛡️', drm: '🔒',
  drmFree: '🆓', online: '🌐',

  // Publisher/Developer
  developer: '👨‍💻', publisher: '🏢',

  // Downloads
  download: '⬇️', lua: '📜', fix: '🔧', onlineFix: '🌐',

  // Platforms
  windows: '🪟', mac: '🍎', linux: '🐧',
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

let database = { games: {}, stats: { totalDownloads: 0, totalSearches: 0 }, userDailyDownloads: {} };
let gameInfoCache = {};
let gameNamesIndex = {}; // Game names index
let gameNamesCache = {}; // Large local game name cache
let searchableGameList = []; // Unified game list for autocomplete + slash resolution
const temporaryDownloads = new Map(); // token -> { filePath, fileName, expiresAt }
let lastGitHubUploadError = null;

const GEN_SLASH_COMMAND = {
  name: 'gen',
  description: 'Generate manifest files for a game',
  dm_permission: false,
  defaultMemberPermissions: null,
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: 'appid',
      description: 'The Steam App ID or game name',
      required: true,
      autocomplete: true
    },
    {
      type: ApplicationCommandOptionType.Boolean,
      name: 'check_manifest',
      description: 'Check so luong file .manifest trong package (co the cham hon)',
      required: false
    }
  ]
};

const GET_SLASH_COMMAND = {
  name: 'get',
  description: 'Fetch manifest/lua from upstream and store it in library',
  dm_permission: false,
  defaultMemberPermissions: null,
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: 'appid',
      description: 'The Steam App ID or game name',
      required: true,
      autocomplete: true
    }
  ]
};

const HELP_SLASH_COMMAND = {
  name: 'help',
  description: 'Huong dan su dung bot (Tieng Viet)',
  dm_permission: false,
  defaultMemberPermissions: null,
  options: []
};

const MORRENUS_SLASH_COMMAND = {
  name: 'morrenus',
  description: 'Admin: Morrenus key status/regen',
  dm_permission: false,
  defaultMemberPermissions: PermissionFlagsBits.Administrator,
  options: [
    {
      type: ApplicationCommandOptionType.String,
      name: 'action',
      description: 'Action to perform',
      required: true,
      choices: [
        { name: 'status', value: 'status' },
        { name: 'regen', value: 'regen' },
      ]
    }
  ]
};

const SLASH_COMMAND_DEFINITIONS = [GEN_SLASH_COMMAND, GET_SLASH_COMMAND, HELP_SLASH_COMMAND, MORRENUS_SLASH_COMMAND];

const AUTOCOMPLETE_LIMIT = 25;
const AUTOCOMPLETE_CACHE_TTL = 60 * 1000;
const AUTOCOMPLETE_RESPONSE_BUDGET_MS = parsePositiveInt(process.env.AUTOCOMPLETE_RESPONSE_BUDGET_MS, 1200);
const AUTOCOMPLETE_STEAM_QUERY_MIN_LENGTH = 3;
const autocompleteCache = new Map();

const POPULAR_APP_IDS = [
  '730', '570', '578080', '1172470', '271590',
  '252490', '4000', '431960', '1091500', '1245620',
  '1174180', '413150', '892970', '1086940', '367520'
];

const enableMessageContentIntent = String(process.env.ENABLE_MESSAGE_CONTENT_INTENT || '').toLowerCase() === 'true';

const requestedIntents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
];

// Message content is privileged; keep it opt-in for stable Render deploys.
if (enableMessageContentIntent) {
  requestedIntents.push(GatewayIntentBits.MessageContent);
}

const client = new Client({ intents: requestedIntents });
const loginState = {
  tokenConfigured: Boolean(CONFIG.BOT_TOKEN),
  tokenSource: DISCORD_TOKEN_SOURCE,
  attempts: 0,
  lastAttemptAt: null,
  lastError: null,
  readyAt: null,
  inProgress: false,
  lastRestCheckAt: null,
  lastGatewayUrl: null,
  nextRetryAt: null
};

let loginRetryTimer = null;

function ensureDatabaseSchema() {
  if (!database || typeof database !== 'object') {
    database = {};
  }

  if (!database.games || typeof database.games !== 'object') {
    database.games = {};
  }

  if (!database.stats || typeof database.stats !== 'object') {
    database.stats = {};
  }

  database.stats.totalDownloads = Number.isFinite(database.stats.totalDownloads)
    ? database.stats.totalDownloads
    : 0;
  database.stats.totalSearches = Number.isFinite(database.stats.totalSearches)
    ? database.stats.totalSearches
    : 0;

  if (!database.userDailyDownloads || typeof database.userDailyDownloads !== 'object') {
    database.userDailyDownloads = {};
  }
}

function getDailyDateKey(timestamp = Date.now()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: CONFIG.DAILY_LIMIT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date(timestamp));
}

function getNextDailyResetUnix(timestamp = Date.now()) {
  const currentKey = getDailyDateKey(timestamp);

  // Scan minute-by-minute to support timezone and DST boundaries safely.
  // Upper bound 48h is enough even on odd timezone transitions.
  for (let minute = 1; minute <= (48 * 60); minute++) {
    const probe = timestamp + (minute * 60 * 1000);
    if (getDailyDateKey(probe) !== currentKey) {
      return Math.floor(probe / 1000);
    }
  }

  // Fallback (should never happen)
  return Math.floor((timestamp + 24 * 60 * 60 * 1000) / 1000);
}

function getDailyDownloadQuotaLocal(userId, timestamp = Date.now()) {
  ensureDatabaseSchema();

  if (!CONFIG.ENABLE_DAILY_DOWNLOAD_LIMIT || CONFIG.MAX_DAILY_DOWNLOADS_PER_USER <= 0) {
    return {
      enabled: false,
      used: 0,
      remaining: Number.POSITIVE_INFINITY,
      limit: 0,
      dateKey: getDailyDateKey(timestamp),
    };
  }

  const dateKey = getDailyDateKey(timestamp);
  const userEntry = database.userDailyDownloads[userId];
  const usedToday = userEntry && userEntry.dateKey === dateKey
    ? Math.max(Number(userEntry.count) || 0, 0)
    : 0;
  const remaining = Math.max(CONFIG.MAX_DAILY_DOWNLOADS_PER_USER - usedToday, 0);

  return {
    enabled: true,
    used: usedToday,
    remaining,
    limit: CONFIG.MAX_DAILY_DOWNLOADS_PER_USER,
    dateKey,
  };
}

function consumeDailyDownloadQuotaLocal(userId, timestamp = Date.now()) {
  ensureDatabaseSchema();

  const quota = getDailyDownloadQuotaLocal(userId, timestamp);
  if (!quota.enabled) return quota;

  database.userDailyDownloads[userId] = {
    dateKey: quota.dateKey,
    count: quota.used + 1,
  };

  return {
    ...quota,
    used: quota.used + 1,
    remaining: Math.max(quota.remaining - 1, 0),
  };
}

function isUpstashQuotaEnabled() {
  return Boolean(CONFIG.UPSTASH_REDIS_REST_URL && CONFIG.UPSTASH_REDIS_REST_TOKEN);
}

function getDailyQuotaKey(userId, dateKey) {
  return `${CONFIG.UPSTASH_DAILY_QUOTA_PREFIX}:${dateKey}:${userId}`;
}

async function executeUpstashCommand(command, ...args) {
  const encodedArgs = args.map(value => encodeURIComponent(String(value)));
  const endpoint = `${CONFIG.UPSTASH_REDIS_REST_URL}/${String(command).toUpperCase()}/${encodedArgs.join('/')}`;
  const response = await axios.post(endpoint, null, {
    timeout: 5000,
    headers: {
      Authorization: `Bearer ${CONFIG.UPSTASH_REDIS_REST_TOKEN}`
    }
  });
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`Upstash status ${response.status}`);
  }
  return response.data?.result;
}

async function getDailyDownloadQuota(userId, timestamp = Date.now()) {
  if (!isUpstashQuotaEnabled()) {
    return getDailyDownloadQuotaLocal(userId, timestamp);
  }

  if (!CONFIG.ENABLE_DAILY_DOWNLOAD_LIMIT || CONFIG.MAX_DAILY_DOWNLOADS_PER_USER <= 0) {
    return {
      enabled: false,
      used: 0,
      remaining: Number.POSITIVE_INFINITY,
      limit: 0,
      dateKey: getDailyDateKey(timestamp),
    };
  }

  const dateKey = getDailyDateKey(timestamp);
  const key = getDailyQuotaKey(userId, dateKey);

  try {
    const value = await executeUpstashCommand('GET', key);
    const usedToday = Math.max(Number.parseInt(value ?? '0', 10) || 0, 0);
    const remaining = Math.max(CONFIG.MAX_DAILY_DOWNLOADS_PER_USER - usedToday, 0);
    return {
      enabled: true,
      used: usedToday,
      remaining,
      limit: CONFIG.MAX_DAILY_DOWNLOADS_PER_USER,
      dateKey,
      source: 'upstash'
    };
  } catch (error) {
    log('WARN', 'Upstash quota read failed, fallback to local DB', { error: error.message });
    return getDailyDownloadQuotaLocal(userId, timestamp);
  }
}

async function consumeDailyDownloadQuota(userId, timestamp = Date.now()) {
  if (!isUpstashQuotaEnabled()) {
    return consumeDailyDownloadQuotaLocal(userId, timestamp);
  }

  const quotaBefore = await getDailyDownloadQuota(userId, timestamp);
  if (!quotaBefore.enabled) return quotaBefore;

  const dateKey = quotaBefore.dateKey || getDailyDateKey(timestamp);
  const key = getDailyQuotaKey(userId, dateKey);

  try {
    const usedAfter = Math.max(Number.parseInt(await executeUpstashCommand('INCR', key), 10) || 0, 0);

    // Keep old keys cleaned up shortly after timezone midnight reset.
    if (usedAfter <= 1) {
      const expireAt = getNextDailyResetUnix(timestamp) + (2 * 60 * 60);
      await executeUpstashCommand('EXPIREAT', key, expireAt);
    }

    return {
      enabled: true,
      used: usedAfter,
      remaining: Math.max(CONFIG.MAX_DAILY_DOWNLOADS_PER_USER - usedAfter, 0),
      limit: CONFIG.MAX_DAILY_DOWNLOADS_PER_USER,
      dateKey,
      source: 'upstash'
    };
  } catch (error) {
    log('WARN', 'Upstash quota write failed, fallback to local DB', { error: error.message });
    return consumeDailyDownloadQuotaLocal(userId, timestamp);
  }
}

function formatDailyQuotaRemaining(quota) {
  if (!quota?.enabled) return null;
  return `You have ${quota.remaining}/${quota.limit} downloads remaining today.`;
}

function buildVietnameseUsageGuideText() {
  const ARROW_GLOW_URL = 'https://cdn3.emoji.gg/emojis/3716_ArrowRightGlow.gif';
  return [
    '## ***CÁCH SỬ DỤNG BOT***',
    `${ARROW_GLOW_URL} ***Nhập lệnh: \`/gen appid\` và điền tên game hoặc appid để lấy file lua game***`,
    `${ARROW_GLOW_URL} ***Nếu chưa có file lua game, nhập lệnh: \`/get appid\` và điền tên game/appid. Bot sẽ fetch từ nguồn nội bộ, lưu vào kho, sau đó dùng lại \`/gen appid\` như cũ***`,
    `${ARROW_GLOW_URL} ***Nếu chỉ muốn xem thông tin game, nhập lệnh: \`/steam appid\` và điền tên game/appid***`,
    `${ARROW_GLOW_URL} ***Dùng \`/help\` để xem lại hướng dẫn bất kỳ lúc nào***`,
  ].join('\n');
}

function scheduleMessageDeletionWithDelay(message, delayMs = CONFIG.AUTO_DELETE_TIMEOUT) {
  if (!CONFIG.ENABLE_AUTO_DELETE || !message) return;

  setTimeout(async () => {
    try {
      if (message.deletable) {
        await message.delete();
      }
    } catch (_) {}
  }, Math.max(Number(delayMs) || CONFIG.AUTO_DELETE_TIMEOUT, 1000));
}

async function registerSuccessfulDownload({ appId, gameName, fileType, fileName, fileSize, user }) {
  ensureDatabaseSchema();

  database.stats.totalDownloads += 1;

  if (!database.games[appId]) {
    database.games[appId] = {
      name: gameName || `App ${appId}`,
      downloads: 0,
      lastAccessed: Date.now(),
    };
  }

  const gameEntry = database.games[appId];
  if (gameName) {
    gameEntry.name = gameName;
  }
  gameEntry.downloads = (gameEntry.downloads || 0) + 1;
  gameEntry.lastAccessed = Date.now();

  const quota = await consumeDailyDownloadQuota(user.id);
  saveDatabase();

  log('INFO', 'File downloaded', {
    appId,
    gameName: gameName || `App ${appId}`,
    fileName: fileName || 'N/A',
    fileType,
    fileSize: fileSize || 'N/A',
    user: user.tag
  });

  return quota;
}

async function sendDailyQuotaRemaining(interaction, quota) {
  try {
    const channel = interaction.channel;
    if (!channel || !channel.send) return;

    const quotaText = quota?.enabled
      ? `📥 <@${interaction.user.id}> tải thành công. Bạn còn **${quota.remaining}/${quota.limit}** lượt tải hôm nay.`
      : `📥 <@${interaction.user.id}> tải thành công.`;

    const quotaMsg = await channel.send({ content: quotaText });
    scheduleMessageDeletionWithDelay(quotaMsg, 5 * 60 * 1000);

    setTimeout(async () => {
      try {
        const guideMsg = await channel.send({
          content: buildVietnameseUsageGuideText()
        });
        scheduleMessageDeletionWithDelay(guideMsg, 5 * 60 * 1000);
      } catch (error) {
        log('WARN', 'Failed to send delayed usage guide', {
          user: interaction.user?.tag,
          error: error.message
        });
      }
    }, 10000);
  } catch (error) {
    log('WARN', 'Failed to send daily quota follow-up', {
      user: interaction.user?.tag,
      error: error.message
    });
  }
}

function initializeFolders() {
  [CONFIG.LUA_FILES_PATH, CONFIG.FIX_FILES_PATH,
   CONFIG.ONLINE_FIX_PATH, CONFIG.LOGS_PATH,
   path.dirname(CONFIG.DATABASE_PATH),
   path.dirname(CONFIG.GAME_INFO_CACHE_PATH)].forEach(folder => {
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  });
}

function safeReadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tempPath = `${filePath}.tmp`;
  const payload = JSON.stringify(data, null, 2);
  fs.writeFileSync(tempPath, payload, 'utf8');
  fs.renameSync(tempPath, filePath);
}
function loadDatabase() {
  let loaded = null;
  let loadedFromBackup = false;

  if (fs.existsSync(CONFIG.DATABASE_PATH)) {
    try {
      loaded = safeReadJson(CONFIG.DATABASE_PATH);
      console.log('✅ Loaded database');
    } catch (error) {
      console.error('❌ Error loading primary database:', error.message);
    }
  }

  if (!loaded && fs.existsSync(CONFIG.DATABASE_BACKUP_PATH)) {
    try {
      loaded = safeReadJson(CONFIG.DATABASE_BACKUP_PATH);
      loadedFromBackup = true;
      console.log('✅ Recovered database from backup');
    } catch (error) {
      console.error('❌ Error loading backup database:', error.message);
    }
  }

  if (loaded && typeof loaded === 'object') {
    database = loaded;
  } else {
    database = {};
    console.warn('⚠️ Using a new empty database in memory.');
  }

  ensureDatabaseSchema();

  if (loadedFromBackup) {
    saveDatabase();
  }
}

function saveDatabase() {
  try {
    ensureDatabaseSchema();
    writeJsonAtomic(CONFIG.DATABASE_PATH, database);
    writeJsonAtomic(CONFIG.DATABASE_BACKUP_PATH, database);
  } catch (error) {
    console.error('❌ Error saving database:', error);
  }
}
function loadGameInfoCache() {
  if (fs.existsSync(CONFIG.GAME_INFO_CACHE_PATH)) {
    try {
      gameInfoCache = JSON.parse(fs.readFileSync(CONFIG.GAME_INFO_CACHE_PATH, 'utf8'));
      console.log(`✅ Loaded ${Object.keys(gameInfoCache).length} cached games`);
    } catch (error) {
      console.error('❌ Error loading cache:', error);
    }
  }

  const gameIndexPath = path.join(__dirname, '../game_names_index.json');
  const gameNamesCachePath = path.join(__dirname, '../gameNamesCache.json');

  // Load compact game names index
  if (fs.existsSync(gameIndexPath)) {
    try {
      gameNamesIndex = JSON.parse(fs.readFileSync(gameIndexPath, 'utf8'));
      console.log(`✅ Loaded ${Object.keys(gameNamesIndex).length} game names from index`);
    } catch (error) {
      console.error('❌ Error loading game names index:', error);
    }
  }

  // Load large game names cache for autocomplete
  if (fs.existsSync(gameNamesCachePath)) {
    try {
      gameNamesCache = JSON.parse(fs.readFileSync(gameNamesCachePath, 'utf8'));
      console.log(`✅ Loaded ${Object.keys(gameNamesCache).length} game names from cache`);
    } catch (error) {
      console.error('❌ Error loading game names cache:', error);
    }
  }

  rebuildSearchableGameList();
}

function rebuildSearchableGameList() {
  const merged = new Map();

  const upsertEntry = (appId, name) => {
    if (!appId || !name) return;
    const id = String(appId).trim();
    const displayName = String(name).replace(/\s+/g, ' ').trim();
    if (!id || !displayName) return;

    if (!merged.has(id)) {
      merged.set(id, {
        appId: id,
        name: displayName,
        normalizedName: normalizeGameName(displayName)
      });
      return;
    }

    const existing = merged.get(id);
    if (displayName.length > existing.name.length) {
      merged.set(id, {
        appId: id,
        name: displayName,
        normalizedName: normalizeGameName(displayName)
      });
    }
  };

  for (const [appId, name] of Object.entries(gameNamesCache || {})) {
    upsertEntry(appId, name);
  }

  for (const [appId, name] of Object.entries(gameNamesIndex || {})) {
    upsertEntry(appId, name);
  }

  for (const [appId, cacheEntry] of Object.entries(gameInfoCache || {})) {
    const cachedName = cacheEntry?.data?.name;
    if (cachedName) {
      upsertEntry(appId, cachedName);
    }
  }

  for (const game of DENUVO_GAMES) {
    upsertEntry(game.id, game.name);
  }

  searchableGameList = Array.from(merged.values());
  log('INFO', 'Rebuilt searchable game cache', { totalGames: searchableGameList.length });
}

function getGameNameById(appId) {
  const id = String(appId || '').trim();
  if (!id) return null;
  return gameNamesCache[id] || gameNamesIndex[id] || gameInfoCache[id]?.data?.name || null;
}

function saveGameInfoCache() {
  try {
    fs.writeFileSync(CONFIG.GAME_INFO_CACHE_PATH, JSON.stringify(gameInfoCache, null, 2));
  } catch (error) {
    console.error('❌ Error saving cache:', error);
  }
}

function isAdmin(userId) {
  return CONFIG.ADMIN_USER_IDS.includes(userId);
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return 'Unknown';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================
// MORRENUS API KEY MANAGEMENT SYSTEM
// ============================================
const MORRENUS_DAILY_LIMIT = parsePositiveInt(process.env.MORRENUS_DAILY_LIMIT, 25);
const MORRENUS_QUOTA_WARNING_THRESHOLD = parsePositiveInt(process.env.MORRENUS_QUOTA_WARNING_THRESHOLD, 5);
const MORRENUS_RATE_LIMIT_WAIT_MAX_MS = parsePositiveInt(process.env.MORRENUS_RATE_LIMIT_WAIT_MAX_MS, 3600000); // 1 hour max wait

// Per-key tracking state
const morrenusKeyState = new Map(); // key -> { used, dateKey, exhausted, lastError, lastStatusCode, rateLimitResetAt }
const morrenusDisabledKeys = new Set(); // auth-failed keys to ignore until replaced

function getMorrenusKeyDateKey() {
  return new Date().toISOString().split('T')[0]; // YYYY-MM-DD UTC
}

function getMorrenusKeyStats(apiKey) {
  const dateKey = getMorrenusKeyDateKey();
  let state = morrenusKeyState.get(apiKey);
  if (!state || state.dateKey !== dateKey) {
    state = {
      used: 0,
      dateKey,
      exhausted: false,
      lastError: null,
      lastStatusCode: null,
      rateLimitResetAt: null,
    };
    morrenusKeyState.set(apiKey, state);
  }
  return state;
}

function recordMorrenusKeyUsage(apiKey, statusCode, error = null) {
  const state = getMorrenusKeyStats(apiKey);
  state.used += 1;
  state.lastStatusCode = statusCode;
  state.lastError = error;

  if (statusCode === 429) {
    state.exhausted = true;
    state.rateLimitResetAt = Date.now() + 3600000; // assume 1h reset unless told otherwise
    log('WARN', `Morrenus key exhausted (429)`, {
      keyPrefix: apiKey.substring(0, 12) + '...',
      usedToday: state.used,
      limit: MORRENUS_DAILY_LIMIT,
    });
    // 🤖 Trigger auto-regen khi bị rate limit
    if (MORRENUS_AUTO_REGEN_ON_LIMIT) {
      morrenusSmartAutoRegen('rate_limit_429').catch(() => {});
    }
  } else if (statusCode === 401 || statusCode === 403) {
    state.exhausted = true;
    state.lastError = error || `Auth error (${statusCode})`;
    morrenusDisabledKeys.add(apiKey);
    log('WARN', `Morrenus key auth failed (${statusCode})`, {
      keyPrefix: apiKey.substring(0, 12) + '...',
    });
    // 🤖 Trigger auto-regen khi key bị auth fail (có thể expired)
    morrenusSmartAutoRegen('auth_failed').catch(() => {});
  }

  // Warning when approaching limit → trigger preemptive regen
  const remaining = Math.max(MORRENUS_DAILY_LIMIT - state.used, 0);
  if (remaining > 0 && remaining <= MORRENUS_QUOTA_WARNING_THRESHOLD && statusCode >= 200 && statusCode < 300) {
    log('WARN', `Morrenus key quota low`, {
      keyPrefix: apiKey.substring(0, 12) + '...',
      remaining,
      limit: MORRENUS_DAILY_LIMIT,
    });
    // 🤖 Preemptive: regenerate trước khi hết hoàn toàn
    if (MORRENUS_AUTO_REGEN_ON_LIMIT && remaining <= MORRENUS_AUTO_REGEN_LIMIT_THRESHOLD) {
      console.log(`[Morrenus] 🔄 Preemptive regen: only ${remaining} uses left.`);
      morrenusSmartAutoRegen('preemptive_limit').catch(() => {});
    }
  }
}

function isMorrenusKeyAvailable(apiKey) {
  if (morrenusDisabledKeys.has(apiKey)) return false;
  const state = getMorrenusKeyStats(apiKey);

  // Reset if rate limit period has passed
  if (state.exhausted && state.rateLimitResetAt && Date.now() >= state.rateLimitResetAt) {
    state.exhausted = false;
    state.rateLimitResetAt = null;
    log('INFO', 'Morrenus key rate limit period expired, re-enabling', {
      keyPrefix: apiKey.substring(0, 12) + '...',
    });
  }

  // Don't use exhausted keys
  if (state.exhausted) return false;

  // Don't use keys that are at or over daily limit (optimistic tracking)
  if (state.used >= MORRENUS_DAILY_LIMIT) return false;

  return true;
}

function getMorrenusApiKeyPool() {
  const unique = new Set();
  const pushIfValid = (candidate) => {
    const normalized = String(candidate || '').trim();
    if (normalized) unique.add(normalized);
  };

  pushIfValid(CONFIG.MORRENUS_API_KEY);
  for (const token of String(CONFIG.MORRENUS_API_KEYS || '').split(',')) {
    pushIfValid(token);
  }

  return Array.from(unique);
}

/**
 * Get the best available key from the pool, preferring keys with most remaining quota.
 * Returns null if all keys are exhausted.
 */
function getMorrenusNextAvailableKey() {
  const pool = getMorrenusApiKeyPool();
  const available = pool.filter(k => isMorrenusKeyAvailable(k));

  if (available.length === 0) return null;

  // Sort by least used first (spread load)
  available.sort((a, b) => {
    const stateA = getMorrenusKeyStats(a);
    const stateB = getMorrenusKeyStats(b);
    return stateA.used - stateB.used;
  });

  return available[0];
}

/**
 * Get the soonest time any exhausted key becomes available again.
 * Returns null if no keys are rate-limited (they might just be expired/auth-failed).
 */
function getMorrenusNextResetTime() {
  const pool = getMorrenusApiKeyPool();
  let soonest = null;

  for (const key of pool) {
    const state = getMorrenusKeyStats(key);
    if (state.rateLimitResetAt && (!soonest || state.rateLimitResetAt < soonest)) {
      soonest = state.rateLimitResetAt;
    }
  }

  return soonest;
}

/**
 * Get a summary of all Morrenus key states (for health/diagnostic endpoints).
 */
function getMorrenusKeyPoolStatus() {
  const pool = getMorrenusApiKeyPool();
  const dateKey = getMorrenusKeyDateKey();
  const keys = pool.map((key, idx) => {
    const state = getMorrenusKeyStats(key);
    const disabled = morrenusDisabledKeys.has(key);
    return {
      index: idx + 1,
      keyPrefix: key.substring(0, 12) + '...' + key.substring(key.length - 6),
      dateKey: state.dateKey,
      usedToday: state.used,
      remaining: Math.max(MORRENUS_DAILY_LIMIT - state.used, 0),
      dailyLimit: MORRENUS_DAILY_LIMIT,
      exhausted: state.exhausted,
      lastStatusCode: state.lastStatusCode,
      lastError: state.lastError,
      rateLimitResetAt: state.rateLimitResetAt ? new Date(state.rateLimitResetAt).toISOString() : null,
      disabled,
      available: isMorrenusKeyAvailable(key),
    };
  });

  const totalRemainingAll = keys.reduce((sum, k) => sum + k.remaining, 0);
  const totalRemaining = keys.reduce((sum, k) => sum + (k.available ? k.remaining : 0), 0);
  const availableKeys = keys.filter(k => k.available).length;
  const nextReset = getMorrenusNextResetTime();

  return {
    totalKeys: pool.length,
    availableKeys,
    totalRemaining,
    totalRemainingAll,
    totalDailyLimit: MORRENUS_DAILY_LIMIT * pool.length,
    nextResetAt: nextReset ? new Date(nextReset).toISOString() : null,
    warningThreshold: MORRENUS_QUOTA_WARNING_THRESHOLD,
    keys,
  };
}

// ============================================
// MORRENUS HOT-RELOAD & AUTO-GENERATE KEY
// ============================================
const MORRENUS_KEY_FILE = process.env.MORRENUS_KEY_FILE
  ? path.resolve(process.env.MORRENUS_KEY_FILE)
  : path.join(DATA_ROOT, '.morrenus_active_key');
const MORRENUS_SESSION_DIR = process.env.MORRENUS_SESSION_DIR
  ? path.resolve(process.env.MORRENUS_SESSION_DIR)
  : path.join(DATA_ROOT, '.playwright-session');

// Ensure child processes share the same paths (Playwright key/session).
process.env.MORRENUS_KEY_FILE = process.env.MORRENUS_KEY_FILE || MORRENUS_KEY_FILE;
process.env.MORRENUS_SESSION_DIR = process.env.MORRENUS_SESSION_DIR || MORRENUS_SESSION_DIR;

// Use persistent disk for Playwright browsers when available (Render).
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.RENDER_DISK_MOUNT_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(DATA_ROOT, 'playwright-browsers');
}

function ensureMorrenusSessionFromEnv() {
  const b64 = process.env.MORRENUS_SESSION_STATE_B64;
  if (!b64) return false;

  const sessionFile = path.join(MORRENUS_SESSION_DIR, 'state.json');
  if (fs.existsSync(sessionFile)) return true;

  try {
    const cleaned = String(b64).replace(/\s+/g, '');
    const raw = Buffer.from(cleaned, 'base64').toString('utf8');
    if (!raw.trim().startsWith('{')) {
      console.warn('[Morrenus] ⚠️ MORRENUS_SESSION_STATE_B64 is not valid JSON.');
      return false;
    }
    fs.mkdirSync(MORRENUS_SESSION_DIR, { recursive: true });
    fs.writeFileSync(sessionFile, raw);
    console.log(`[Morrenus] ✅ Seeded Playwright session to ${sessionFile}`);
    return true;
  } catch (e) {
    console.warn(`[Morrenus] ⚠️ Failed to seed session from env: ${e.message}`);
    return false;
  }
}

// Seed session early so /morrenus-status and auto-regen can see it.
ensureMorrenusSessionFromEnv();
let morrenusAutoGenerateInProgress = false;
let morrenusLastAutoGenerateAttempt = 0;
const MORRENUS_AUTO_GENERATE_COOLDOWN_MS = 300000; // 5 min cooldown giữa các lần generate
let morrenusLastGenerateResult = null; // summary string
let morrenusLastStatusCheckError = null;

// === AUTO-REGEN CONFIG ===
const MORRENUS_AUTO_REGEN_ON_LIMIT = process.env.MORRENUS_AUTO_REGEN_ON_LIMIT !== 'false'; // default true
const MORRENUS_AUTO_REGEN_ON_EXPIRY = process.env.MORRENUS_AUTO_REGEN_ON_EXPIRY !== 'false'; // default true
const MORRENUS_AUTO_REGEN_EXPIRY_HOURS = parsePositiveInt(process.env.MORRENUS_AUTO_REGEN_EXPIRY_HOURS, 24); // regenerate khi còn <24h
const MORRENUS_AUTO_REGEN_LIMIT_THRESHOLD = parsePositiveInt(process.env.MORRENUS_AUTO_REGEN_LIMIT_THRESHOLD, 2); // regenerate khi còn <=2 lượt
const MORRENUS_AUTO_REGEN_CHECK_INTERVAL_MS = parsePositiveInt(process.env.MORRENUS_AUTO_REGEN_CHECK_INTERVAL_MS, 600000); // check mỗi 10 phút
let morrenusKeyExpiry = null; // Date object - thời gian hết hạn key hiện tại
let morrenusLastRegenCheck = 0;

/**
 * Kiểm tra key status từ Morrenus (headless) và cập nhật thông tin expiry
 * Trả về { todayUsage, dailyLimit, timeLeftHours, hasActiveKey, expires }
 */
async function morrenusCheckKeyStatusViaPlaywright() {
  const browserDataDir = path.join(MORRENUS_SESSION_DIR, 'browser-data');
  const sessionFile = path.join(MORRENUS_SESSION_DIR, 'state.json');
  if (!fs.existsSync(sessionFile) && !fs.existsSync(browserDataDir)) return null;

  const scriptPath = path.join(__dirname, '..', 'scripts', 'morrenus_key_manager.js');
  if (!fs.existsSync(scriptPath)) return null;

  try {
    const { spawnSync } = require('child_process');
    const result = spawnSync('node', [scriptPath, 'status'], {
      timeout: 60000,
      encoding: 'utf8',
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        MORRENUS_SESSION_DIR,
        MORRENUS_KEY_FILE,
      },
    });

    const output = `${result.stdout || ''}${result.stderr || ''}`;
    if (result.status !== 0) {
      const shortOutput = output.substring(0, 800).trim();
      morrenusLastStatusCheckError = shortOutput || `Status command failed (code ${result.status})`;
      console.warn('[Morrenus] ⚠️ Status check failed output:', morrenusLastStatusCheckError);
      return null;
    }

    // Parse STATUS_JSON=...
    const jsonMatch = output.match(/STATUS_JSON=({.*})/);
    if (jsonMatch) {
      const status = JSON.parse(jsonMatch[1]);

      // Parse timeLeft: "6d 22h" → hours
      let timeLeftHours = null;
      if (status.timeLeft) {
        const dMatch = status.timeLeft.match(/(\d+)d/);
        const hMatch = status.timeLeft.match(/(\d+)h/);
        timeLeftHours = (dMatch ? parseInt(dMatch[1]) * 24 : 0) + (hMatch ? parseInt(hMatch[1]) : 0);
      }

      // Parse expires date
      if (status.expires) {
        try {
          morrenusKeyExpiry = new Date(status.expires);
        } catch (_) {}
      }

      return {
        todayUsage: status.todayUsage,
        dailyLimit: status.dailyLimit,
        remaining: status.dailyLimit && status.todayUsage != null ? status.dailyLimit - status.todayUsage : null,
        timeLeftHours,
        hasActiveKey: status.hasActiveKey,
        expires: status.expires,
      };
    }

    if (output.includes('SESSION_EXPIRED')) {
      console.log('[Morrenus] ❌ Playwright session expired for status check.');
    }
    return null;
  } catch (e) {
    console.warn(`[Morrenus] ⚠️ Status check failed: ${e.message}`);
    morrenusLastStatusCheckError = `ERROR: ${e.message}`;
    return null;
  }
}

/**
 * Smart auto-regen: kiểm tra điều kiện và tự động generate key mới
 * Triggers:
 *   1. Daily limit gần hết (remaining <= threshold)
 *   2. Key sắp hết hạn (< EXPIRY_HOURS)
 *   3. Tất cả key exhausted (như cũ)
 */
async function morrenusSmartAutoRegen(trigger = 'unknown') {
  if (!MORRENUS_AUTO_REGEN_ON_LIMIT && !MORRENUS_AUTO_REGEN_ON_EXPIRY && trigger !== 'exhausted') {
    return null;
  }

  console.log(`[Morrenus] 🔍 Smart auto-regen triggered by: ${trigger}`);
  const newKey = await morrenusAutoGenerateKey();
  if (newKey) {
    console.log(`[Morrenus] ✅ Smart auto-regen success (trigger: ${trigger}): ${newKey.substring(0, 20)}...`);
  } else {
    console.log(`[Morrenus] ⚠️ Smart auto-regen failed (trigger: ${trigger})`);
  }
  return newKey;
}

/**
 * Periodic check: chạy mỗi 10 phút, kiểm tra và auto-regen nếu cần
 */
async function morrenusPeriodicRegenCheck() {
  // Cooldown
  if (Date.now() - morrenusLastRegenCheck < MORRENUS_AUTO_REGEN_CHECK_INTERVAL_MS) return;
  morrenusLastRegenCheck = Date.now();

  // Kiểm tra có Playwright session không
  const browserDataDir = path.join(MORRENUS_SESSION_DIR, 'browser-data');
  const sessionFile = path.join(MORRENUS_SESSION_DIR, 'state.json');
  if (!fs.existsSync(sessionFile) && !fs.existsSync(browserDataDir)) return;

  console.log('[Morrenus] 🔍 Periodic regen check...');

  try {
    const status = await morrenusCheckKeyStatusViaPlaywright();
    if (!status) {
      console.log('[Morrenus] ⚠️ Could not check status, skipping periodic regen.');
      return;
    }

    console.log(`[Morrenus] 📊 Key status: active=${status.hasActiveKey}, usage=${status.todayUsage}/${status.dailyLimit}, remaining=${status.remaining}, timeLeft=${status.timeLeftHours}h, expires=${status.expires}`);

    // Không có active key → generate ngay
    if (!status.hasActiveKey) {
      console.log('[Morrenus] ⚠️ No active key! Generating...');
      await morrenusSmartAutoRegen('no_active_key');
      return;
    }

    // Check 1: Daily limit gần hết
    if (MORRENUS_AUTO_REGEN_ON_LIMIT && status.remaining != null && status.remaining <= MORRENUS_AUTO_REGEN_LIMIT_THRESHOLD) {
      console.log(`[Morrenus] ⚠️ Daily limit nearly reached: ${status.remaining} remaining (threshold: ${MORRENUS_AUTO_REGEN_LIMIT_THRESHOLD}). Auto-regenerating...`);
      await morrenusSmartAutoRegen('daily_limit_reached');
      return;
    }

    // Check 2: Key sắp hết hạn
    if (MORRENUS_AUTO_REGEN_ON_EXPIRY && status.timeLeftHours != null && status.timeLeftHours <= MORRENUS_AUTO_REGEN_EXPIRY_HOURS) {
      console.log(`[Morrenus] ⚠️ Key expiring soon: ${status.timeLeftHours}h left (threshold: ${MORRENUS_AUTO_REGEN_EXPIRY_HOURS}h). Auto-regenerating...`);
      await morrenusSmartAutoRegen('expiry_soon');
      return;
    }

    console.log('[Morrenus] ✅ Key healthy, no regen needed.');
  } catch (e) {
    console.warn(`[Morrenus] ⚠️ Periodic regen check error: ${e.message}`);
  }
}

/**
 * Hot-reload Morrenus key từ file .morrenus_active_key
 * Cho phép cập nhật key mà không cần restart bot
 */
function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function morrenusHotReloadKey() {
  try {
    if (!fs.existsSync(MORRENUS_KEY_FILE)) return false;
    const newKey = fs.readFileSync(MORRENUS_KEY_FILE, 'utf8').trim();
    if (!newKey || !newKey.startsWith('smm_')) return false;

    const pool = getMorrenusApiKeyPool();
    if (pool.includes(newKey)) return false; // Đã có rồi

    // Thêm key mới vào CONFIG
    const oldKey = CONFIG.MORRENUS_API_KEY;
    CONFIG.MORRENUS_API_KEY = newKey;

    // Thêm vào MORRENUS_API_KEYS nếu chưa có
    const existingKeys = String(CONFIG.MORRENUS_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
    if (!existingKeys.includes(newKey)) {
      existingKeys.push(newKey);
      CONFIG.MORRENUS_API_KEYS = existingKeys.join(',');
    }

    // Reset state cho key mới
    morrenusDisabledKeys.delete(newKey);
    morrenusKeyState.delete(newKey);

    console.log(`[Morrenus] 🔄 Hot-reloaded new key: ${newKey.substring(0, 15)}... (replacing ${oldKey ? oldKey.substring(0, 15) + '...' : 'none'})`);
    return true;
  } catch (e) {
    console.warn(`[Morrenus] ⚠️ Hot-reload error: ${e.message}`);
    return false;
  }
}

/**
 * Auto-generate key mới bằng Playwright khi tất cả key đều exhausted.
 * Chỉ chạy trên local (có Playwright session). Trên Render sẽ skip.
 * RAM: ~150MB peak, giải phóng ngay sau khi xong.
 */
async function morrenusAutoGenerateKey() {
  // Cooldown check
  if (morrenusAutoGenerateInProgress) {
    console.log('[Morrenus] ⏳ Auto-generate already in progress, skipping.');
    return null;
  }
  if (Date.now() - morrenusLastAutoGenerateAttempt < MORRENUS_AUTO_GENERATE_COOLDOWN_MS) {
    const wait = Math.ceil((MORRENUS_AUTO_GENERATE_COOLDOWN_MS - (Date.now() - morrenusLastAutoGenerateAttempt)) / 1000);
    console.log(`[Morrenus] ⏳ Auto-generate cooldown: ${wait}s remaining.`);
    return null;
  }

  // Check Playwright session exists
  ensureMorrenusSessionFromEnv();
  const sessionFile = path.join(MORRENUS_SESSION_DIR, 'state.json');
  const browserDataDir = path.join(MORRENUS_SESSION_DIR, 'browser-data');
  if (!fs.existsSync(sessionFile) && !fs.existsSync(browserDataDir)) {
    console.log('[Morrenus] ⚠️ No Playwright session found. Run: node scripts/morrenus_key_manager.js login');
    return null;
  }

  morrenusAutoGenerateInProgress = true;
  morrenusLastAutoGenerateAttempt = Date.now();

  console.log('[Morrenus] 🤖 Auto-generating new API key via Playwright...');

  try {
    // Spawn child process thay vì import Playwright trực tiếp (tiết kiệm RAM cho bot chính)
    const { execSync } = require('child_process');
    const scriptPath = path.join(__dirname, '..', 'scripts', 'morrenus_key_manager.js');

    if (!fs.existsSync(scriptPath)) {
      console.log('[Morrenus] ⚠️ morrenus_key_manager.js not found.');
      return null;
    }

    const output = execSync(`node "${scriptPath}" generate`, {
      timeout: 120000, // 2 min max
      encoding: 'utf8',
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        MORRENUS_SESSION_DIR,
        MORRENUS_KEY_FILE,
      },
    });

    const outputPreview = output.substring(0, 800);
    console.log('[Morrenus] Playwright output:', outputPreview);

    // Parse output for NEW_KEY=...
    const keyMatch = output.match(/NEW_KEY=(smm_[a-f0-9]+)/);
    if (keyMatch) {
      const newKey = keyMatch[1];
      console.log(`[Morrenus] ✅ New key generated: ${newKey.substring(0, 20)}...`);
      morrenusLastGenerateResult = 'OK';

      // Hot-reload the new key immediately (fallback: write key file + update pool)
      let hotReloaded = morrenusHotReloadKey();
      if (!hotReloaded) {
        try {
          ensureDirForFile(MORRENUS_KEY_FILE);
          fs.writeFileSync(MORRENUS_KEY_FILE, newKey);
          hotReloaded = morrenusHotReloadKey();
        } catch (e) {
          console.warn(`[Morrenus] ⚠️ Failed to write key file: ${e.message}`);
        }
      }

      if (!hotReloaded) {
        CONFIG.MORRENUS_API_KEY = newKey;
        const existing = String(CONFIG.MORRENUS_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
        if (!existing.includes(newKey)) {
          existing.push(newKey);
          CONFIG.MORRENUS_API_KEYS = existing.join(',');
        }
        morrenusDisabledKeys.delete(newKey);
        morrenusKeyState.delete(newKey);
        console.log('[Morrenus] 🔧 Applied new key directly to pool (fallback).');
      }

      return newKey;
    }

    // Check for session expired
    if (output.includes('SESSION_EXPIRED') || output.includes('Session expired')) {
      console.log('[Morrenus] ❌ Playwright session expired. Run: node scripts/morrenus_key_manager.js login');
      morrenusLastGenerateResult = 'SESSION_EXPIRED';
    }

    const failMatch = output.match(/Generate failed: ([^\n\r]+)/i);
    if (failMatch) {
      morrenusLastGenerateResult = `GENERATE_FAILED: ${failMatch[1].trim().slice(0, 180)}`;
    } else if (!morrenusLastGenerateResult) {
      morrenusLastGenerateResult = 'FAILED_UNKNOWN';
    }

    return null;
  } catch (e) {
    console.error(`[Morrenus] ❌ Auto-generate failed: ${e.message}`);
    morrenusLastGenerateResult = `ERROR: ${e.message}`;
    return null;
  } finally {
    morrenusAutoGenerateInProgress = false;
  }
}

// Hot-reload check interval: mỗi 30 giây kiểm tra file .morrenus_active_key
setInterval(() => {
  morrenusHotReloadKey();
}, 30000);

// Periodic auto-regen check: mỗi 10 phút kiểm tra expiry/limit
setInterval(() => {
  morrenusPeriodicRegenCheck().catch(e => {
    console.warn(`[Morrenus] ⚠️ Periodic regen check error: ${e.message}`);
  });
}, MORRENUS_AUTO_REGEN_CHECK_INTERVAL_MS);

// Chạy check đầu tiên sau 60s (cho bot khởi động xong)
setTimeout(() => {
  morrenusPeriodicRegenCheck().catch(e => {
    console.warn(`[Morrenus] ⚠️ Initial regen check error: ${e.message}`);
  });
}, 60000);

function isMorrenusAuthOrRateStatus(statusCode) {
  return statusCode === 401 || statusCode === 403 || statusCode === 429;
}

let crc32LookupTable = null;

function getCRC32LookupTable() {
  if (crc32LookupTable) return crc32LookupTable;

  crc32LookupTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = i;
    for (let bit = 0; bit < 8; bit++) {
      value = (value & 1) ? (0xEDB88320 ^ (value >>> 1)) : (value >>> 1);
    }
    crc32LookupTable[i] = value >>> 0;
  }
  return crc32LookupTable;
}

function calculateCRC32(buffer) {
  const input = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || '');
  const table = getCRC32LookupTable();
  let crc = 0xFFFFFFFF;

  for (let i = 0; i < input.length; i++) {
    crc = table[(crc ^ input[i]) & 0xFF] ^ (crc >>> 8);
  }

  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createStoredZipWithSingleEntry(outputPath, entryName, contentBuffer) {
  const payload = Buffer.isBuffer(contentBuffer) ? contentBuffer : Buffer.from(contentBuffer || '');
  const entryNameBuffer = Buffer.from(String(entryName || 'file.lua'), 'utf8');
  const crc32 = calculateCRC32(payload);
  const localHeader = Buffer.alloc(30);

  // Local file header
  localHeader.writeUInt32LE(0x04034b50, 0); // signature
  localHeader.writeUInt16LE(20, 4); // version needed to extract
  localHeader.writeUInt16LE(0, 6); // general purpose bit flag
  localHeader.writeUInt16LE(0, 8); // compression method (stored)
  localHeader.writeUInt16LE(0, 10); // file time
  localHeader.writeUInt16LE(0, 12); // file date
  localHeader.writeUInt32LE(crc32, 14); // CRC-32
  localHeader.writeUInt32LE(payload.length, 18); // compressed size
  localHeader.writeUInt32LE(payload.length, 22); // uncompressed size
  localHeader.writeUInt16LE(entryNameBuffer.length, 26); // file name length
  localHeader.writeUInt16LE(0, 28); // extra field length

  const centralHeader = Buffer.alloc(46);
  const localHeaderSize = localHeader.length + entryNameBuffer.length;
  const centralDirectoryOffset = localHeaderSize + payload.length;

  // Central directory header
  centralHeader.writeUInt32LE(0x02014b50, 0); // signature
  centralHeader.writeUInt16LE(20, 4); // version made by
  centralHeader.writeUInt16LE(20, 6); // version needed to extract
  centralHeader.writeUInt16LE(0, 8); // general purpose bit flag
  centralHeader.writeUInt16LE(0, 10); // compression method
  centralHeader.writeUInt16LE(0, 12); // file time
  centralHeader.writeUInt16LE(0, 14); // file date
  centralHeader.writeUInt32LE(crc32, 16); // CRC-32
  centralHeader.writeUInt32LE(payload.length, 20); // compressed size
  centralHeader.writeUInt32LE(payload.length, 24); // uncompressed size
  centralHeader.writeUInt16LE(entryNameBuffer.length, 28); // file name length
  centralHeader.writeUInt16LE(0, 30); // extra field length
  centralHeader.writeUInt16LE(0, 32); // file comment length
  centralHeader.writeUInt16LE(0, 34); // disk number start
  centralHeader.writeUInt16LE(0, 36); // internal file attributes
  centralHeader.writeUInt32LE(0, 38); // external file attributes
  centralHeader.writeUInt32LE(0, 42); // relative offset of local header

  const endOfCentralDir = Buffer.alloc(22);
  endOfCentralDir.writeUInt32LE(0x06054b50, 0); // signature
  endOfCentralDir.writeUInt16LE(0, 4); // number of this disk
  endOfCentralDir.writeUInt16LE(0, 6); // number of the disk with central directory start
  endOfCentralDir.writeUInt16LE(1, 8); // total entries on this disk
  endOfCentralDir.writeUInt16LE(1, 10); // total entries overall
  endOfCentralDir.writeUInt32LE(centralHeader.length + entryNameBuffer.length, 12); // central dir size
  endOfCentralDir.writeUInt32LE(centralDirectoryOffset, 16); // offset of central dir
  endOfCentralDir.writeUInt16LE(0, 20); // comment length

  const zipBuffer = Buffer.concat([
    localHeader,
    entryNameBuffer,
    payload,
    centralHeader,
    entryNameBuffer,
    endOfCentralDir
  ]);

  fs.writeFileSync(outputPath, zipBuffer);
}

const archiveCommandCache = new Map();

async function commandExists(commandName) {
  if (archiveCommandCache.has(commandName)) {
    return archiveCommandCache.get(commandName);
  }

  const checker = process.platform === 'win32' ? 'where.exe' : 'which';

  try {
    await execFileAsync(checker, [commandName], { timeout: 5000 });
    archiveCommandCache.set(commandName, true);
    return true;
  } catch (_) {
    archiveCommandCache.set(commandName, false);
    return false;
  }
}

function countManifestEntries(entryList = []) {
  return entryList.reduce((total, entry) => {
    const normalized = String(entry || '').trim().toLowerCase();
    return normalized.endsWith('.manifest') ? total + 1 : total;
  }, 0);
}

function countManifestFilesInDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;

  let total = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      total += countManifestFilesInDirectory(fullPath);
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith('.manifest')) {
      total += 1;
    }
  }

  return total;
}

async function listArchiveEntriesWith7z(filePath) {
  if (!(await commandExists('7z'))) return null;

  const { stdout } = await execFileAsync('7z', ['l', '-slt', filePath], {
    timeout: 45000,
    maxBuffer: 20 * 1024 * 1024
  });

  const rawEntries = stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.startsWith('Path = '))
    .map(line => line.slice('Path = '.length).trim())
    .filter(Boolean);

  const archiveBasename = path.basename(filePath).toLowerCase();
  const entries = rawEntries.filter((entry, index) => {
    const normalized = entry.toLowerCase();
    if (index === 0 && (normalized === archiveBasename || normalized === filePath.toLowerCase())) {
      return false;
    }
    return true;
  });

  return { entries, method: 'list-7z' };
}

async function listArchiveEntriesWithUnzip(filePath) {
  if (!(await commandExists('unzip'))) return null;

  const { stdout } = await execFileAsync('unzip', ['-Z1', filePath], {
    timeout: 45000,
    maxBuffer: 20 * 1024 * 1024
  });

  const entries = stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  return { entries, method: 'list-unzip' };
}

async function listArchiveEntriesWithUnrar(filePath) {
  if (!(await commandExists('unrar'))) return null;

  const { stdout } = await execFileAsync('unrar', ['lb', filePath], {
    timeout: 45000,
    maxBuffer: 20 * 1024 * 1024
  });

  const entries = stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  return { entries, method: 'list-unrar' };
}

async function listArchiveEntries(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();

  try {
    if (ext === '.zip') {
      return (await listArchiveEntriesWithUnzip(filePath)) || (await listArchiveEntriesWith7z(filePath));
    }

    if (ext === '.rar') {
      return (await listArchiveEntriesWithUnrar(filePath)) || (await listArchiveEntriesWith7z(filePath));
    }

    if (ext === '.7z') {
      return await listArchiveEntriesWith7z(filePath);
    }
  } catch (error) {
    log('WARN', 'Archive list inspection failed', {
      filePath,
      ext,
      error: error.message
    });
  }

  return null;
}

async function extractArchiveAndCountManifests(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-inspect-'));
  let extractor = null;

  try {
    if (ext === '.zip') {
      if (await commandExists('unzip')) {
        extractor = 'unzip';
        await execFileAsync('unzip', ['-qq', '-o', filePath, '-d', tempDir], {
          timeout: 60000,
          maxBuffer: 20 * 1024 * 1024
        });
      } else if (await commandExists('7z')) {
        extractor = '7z';
        await execFileAsync('7z', ['x', '-y', `-o${tempDir}`, filePath], {
          timeout: 60000,
          maxBuffer: 20 * 1024 * 1024
        });
      }
    } else if (ext === '.rar') {
      if (await commandExists('unrar')) {
        extractor = 'unrar';
        await execFileAsync('unrar', ['x', '-o+', '-inul', filePath, tempDir], {
          timeout: 60000,
          maxBuffer: 20 * 1024 * 1024
        });
      } else if (await commandExists('7z')) {
        extractor = '7z';
        await execFileAsync('7z', ['x', '-y', `-o${tempDir}`, filePath], {
          timeout: 60000,
          maxBuffer: 20 * 1024 * 1024
        });
      }
    } else if (ext === '.7z' && await commandExists('7z')) {
      extractor = '7z';
      await execFileAsync('7z', ['x', '-y', `-o${tempDir}`, filePath], {
        timeout: 60000,
        maxBuffer: 20 * 1024 * 1024
      });
    }

    if (!extractor) return null;

    return {
      manifestCount: countManifestFilesInDirectory(tempDir),
      method: `extract-${extractor}`,
      uncertain: false
    };
  } catch (error) {
    log('WARN', 'Archive extraction inspection failed', {
      filePath,
      ext,
      error: error.message
    });
    return null;
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

function fallbackBinaryManifestScan(filePath) {
  try {
    const binary = fs.readFileSync(filePath).toString('latin1').toLowerCase();
    const matches = binary.match(/\.manifest\b/g);
    return matches ? matches.length : 0;
  } catch (_) {
    return 0;
  }
}

async function inspectArchiveManifestCount(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  if (!['.zip', '.rar', '.7z'].includes(ext)) {
    return null;
  }

  const listed = await listArchiveEntries(filePath);
  if (listed) {
    return {
      manifestCount: countManifestEntries(listed.entries),
      method: listed.method,
      uncertain: false
    };
  }

  const extracted = await extractArchiveAndCountManifests(filePath);
  if (extracted) {
    return extracted;
  }

  return {
    manifestCount: fallbackBinaryManifestScan(filePath),
    method: 'binary-fallback',
    uncertain: true
  };
}

// Get file size from URL using HTTP HEAD request
async function getFileSizeFromUrl(url) {
  try {
    const response = await axios.head(url, {
      timeout: 10000,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const contentLength = response.headers['content-length'];
    if (contentLength) {
      return parseInt(contentLength);
    }

    return null;
  } catch (error) {
    // If HEAD fails, try GET with range request
    try {
      const response = await axios.get(url, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Range': 'bytes=0-0'
        },
        maxRedirects: 5,
        validateStatus: (status) => status === 206 || status === 200
      });

      const contentLength = response.headers['content-length'] ||
                           response.headers['content-range']?.match(/\/(\d+)/)?.[1];
      if (contentLength) {
        return parseInt(contentLength);
      }
    } catch (err) {
      log('WARN', `Failed to get file size from URL: ${url}`, { error: err.message });
    }

    return null;
  }
}

function formatPrice(priceData) {
  if (!priceData) return 'N/A';
  if (priceData.is_free) return 'Free to Play';
  return priceData.final_formatted || 'N/A';
}

function formatNumber(num) {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

function sanitizeNameForChoice(name) {
  return String(name || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncateChoiceName(name, appId) {
  const normalized = sanitizeNameForChoice(name);
  const suffix = ` (${appId})`;
  const maxNameLength = 100 - suffix.length;

  if (normalized.length <= maxNameLength) {
    return `${normalized}${suffix}`;
  }

  return `${normalized.slice(0, maxNameLength - 3)}...${suffix}`;
}

function truncateText(text, maxLength = 120) {
  const safe = String(text || '');
  if (safe.length <= maxLength) return safe;
  return `${safe.slice(0, Math.max(0, maxLength - 3))}...`;
}

function calculateMatchScore(query, candidate) {
  const normalizedQuery = normalizeGameName(query);
  const normalizedCandidate = normalizeGameName(candidate);

  if (!normalizedQuery || !normalizedCandidate) return 0;
  if (normalizedCandidate === normalizedQuery) return 100;
  if (normalizedCandidate.startsWith(normalizedQuery)) return 90;
  if (normalizedCandidate.includes(normalizedQuery)) return 75;

  const queryTokens = String(query).toLowerCase().split(/\s+/).filter(Boolean);
  const candidateText = String(candidate).toLowerCase();
  if (queryTokens.length === 0) return 0;

  const matchedTokens = queryTokens.filter(token => candidateText.includes(token)).length;
  if (matchedTokens === 0) return 0;

  const coverage = matchedTokens / queryTokens.length;
  return Math.floor(50 + coverage * 20);
}

function toUniqueGames(candidates = []) {
  const deduped = new Map();

  for (const item of candidates) {
    if (!item?.appId || !item?.name) continue;
    const appId = String(item.appId).trim();
    const name = sanitizeNameForChoice(item.name);
    if (!appId || !name) continue;

    if (!deduped.has(appId)) {
      deduped.set(appId, { appId, name, score: item.score || 0 });
      continue;
    }

    const existing = deduped.get(appId);
    const nextScore = Math.max(existing.score || 0, item.score || 0);
    if (name.length > existing.name.length) {
      deduped.set(appId, { appId, name, score: nextScore });
    } else {
      existing.score = nextScore;
    }
  }

  return Array.from(deduped.values());
}

function getPopularAutocompleteGames(limit = AUTOCOMPLETE_LIMIT) {
  const games = POPULAR_APP_IDS.map(appId => {
    const name = getGameNameById(appId);
    if (!name) return null;
    return { appId, name, score: 100 };
  }).filter(Boolean);

  if (games.length >= limit) {
    return games.slice(0, limit);
  }

  const existingIds = new Set(games.map(game => game.appId));
  for (const game of searchableGameList) {
    if (existingIds.has(game.appId)) continue;
    games.push({ appId: game.appId, name: game.name, score: 50 });
    if (games.length >= limit) break;
  }

  return games;
}

function searchLocalGames(query, limit = AUTOCOMPLETE_LIMIT) {
  const input = String(query || '').trim();
  if (!input) {
    return getPopularAutocompleteGames(limit);
  }

  const isNumericQuery = /^\d+$/.test(input);
  const normalizedInput = normalizeGameName(input);
  const queryTokens = normalizedInput.split(/\s+/).filter(Boolean);
  const results = [];

  for (const game of searchableGameList) {
    let score = 0;
    const normalizedName = game.normalizedName || normalizeGameName(game.name);

    if (isNumericQuery) {
      if (game.appId === input) {
        score = 120;
      } else if (game.appId.startsWith(input)) {
        score = 100;
      } else {
        if (normalizedName.includes(normalizedInput)) {
          score = 60;
        }
      }
    } else {
      if (normalizedName === normalizedInput) {
        score = 100;
      } else if (normalizedName.startsWith(normalizedInput)) {
        score = 90;
      } else if (normalizedName.includes(normalizedInput)) {
        score = 75;
      } else if (queryTokens.length > 0) {
        const matchedTokens = queryTokens.filter(token => normalizedName.includes(token)).length;
        if (matchedTokens > 0) {
          score = Math.floor(50 + (matchedTokens / queryTokens.length) * 20);
        }
      }
    }

    if (score > 0) {
      results.push({
        appId: game.appId,
        name: game.name,
        score
      });
    }
  }

  results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (a.name.length !== b.name.length) return a.name.length - b.name.length;
    return a.appId.localeCompare(b.appId);
  });

  return toUniqueGames(results).slice(0, limit);
}

async function fetchSteamSuggestions(query, limit = AUTOCOMPLETE_LIMIT) {
  if (!query || query.length < AUTOCOMPLETE_STEAM_QUERY_MIN_LENGTH) return [];

  try {
    const steamResults = await Promise.race([
      searchSteamStore(query),
      new Promise(resolve => setTimeout(() => resolve([]), CONFIG.AUTOCOMPLETE_STEAM_TIMEOUT_MS))
    ]);

    return toUniqueGames(
      (steamResults || []).map(item => ({
        appId: item.appId,
        name: item.name,
        score: calculateMatchScore(query, item.name)
      }))
    ).slice(0, limit);
  } catch (error) {
    log('WARN', 'Steam autocomplete fallback failed', { query, error: error.message });
    return [];
  }
}

async function getAutocompleteGames(query, limit = AUTOCOMPLETE_LIMIT) {
  const key = String(query || '').trim().toLowerCase();
  const cached = autocompleteCache.get(key);
  if (cached && (Date.now() - cached.timestamp < AUTOCOMPLETE_CACHE_TTL)) {
    return cached.results.slice(0, limit);
  }

  const localGames = searchLocalGames(query, limit);
  let merged = localGames;

  if (
    CONFIG.ENABLE_STEAM_AUTOCOMPLETE
    && localGames.length < Math.min(8, limit)
    && key.length >= AUTOCOMPLETE_STEAM_QUERY_MIN_LENGTH
  ) {
    const steamGamesRaw = await fetchSteamSuggestions(key, Math.min(limit * 2, 50));
    const steamGames = steamGamesRaw;

    // Backfill discovered names into local runtime index for faster next autocomplete.
    for (const item of steamGames) {
      const id = String(item.appId);
      if (!id || !item.name) continue;

      if (!gameNamesIndex[id]) {
        gameNamesIndex[id] = item.name;
      }

      const existingEntry = searchableGameList.find(game => game.appId === id);
      if (existingEntry) {
        existingEntry.name = item.name;
        existingEntry.normalizedName = normalizeGameName(item.name);
      } else {
        searchableGameList.push({
          appId: id,
          name: item.name,
          normalizedName: normalizeGameName(item.name)
        });
      }
    }

    merged = toUniqueGames([...localGames, ...steamGames])
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, limit);
  }

  autocompleteCache.set(key, { timestamp: Date.now(), results: merged });
  return merged;
}

function buildAutocompleteChoices(matches = []) {
  const dedup = new Set();
  const choices = [];

  for (const item of matches) {
    const value = String(item?.appId || '')
      .replace(/[^\d]/g, '')
      .trim();
    if (!value || dedup.has(value)) continue;
    if (value.length > 20) continue;

    const safeName = String(item?.name || `App ${value}`)
      .replace(/[\u0000-\u001F\u007F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const name = truncateChoiceName(safeName, value);
    if (!name || name.length > 100) continue;

    dedup.add(value);
    choices.push({ name, value });
    if (choices.length >= AUTOCOMPLETE_LIMIT) break;
  }

  return choices;
}

async function resolveAppIdInput(input) {
  const rawInput = String(input || '').trim();
  if (!rawInput) {
    return { appId: null, reason: 'EMPTY', suggestions: [] };
  }

  if (/^\d{1,10}$/.test(rawInput)) {
    return { appId: rawInput, reason: 'APPID' };
  }

  const embeddedAppId = rawInput.match(/\b(\d{4,10})\b/);
  if (embeddedAppId) {
    return { appId: embeddedAppId[1], reason: 'EMBEDDED_APPID' };
  }

  const candidates = await getAutocompleteGames(rawInput, 10);
  if (candidates.length === 0) {
    return { appId: null, reason: 'NOT_FOUND', suggestions: [] };
  }

  const normalizedInput = normalizeGameName(rawInput);
  const exactMatch = candidates.find(item => normalizeGameName(item.name) === normalizedInput);
  if (exactMatch) {
    return {
      appId: exactMatch.appId,
      reason: 'EXACT_NAME',
      resolvedName: exactMatch.name
    };
  }

  const best = candidates[0];
  const second = candidates[1];
  const bestScore = best?.score || 0;
  const secondScore = second?.score || 0;

  if (bestScore >= 90 || (bestScore >= 75 && (bestScore - secondScore) >= 12)) {
    return {
      appId: best.appId,
      reason: 'BEST_MATCH',
      resolvedName: best.name
    };
  }

  return {
    appId: null,
    reason: 'AMBIGUOUS',
    suggestions: candidates.slice(0, 5)
  };
}

function createInteractionMessageProxy(interaction, extra = {}) {
  return {
    author: interaction.user,
    channelId: interaction.channelId,
    isInteractionProxy: true,
    ...extra,
    canEmbed: interaction.appPermissions
      ? interaction.appPermissions.has(PermissionFlagsBits.EmbedLinks)
      : null,
    async reply(payload) {
      const options = typeof payload === 'string' ? { content: payload } : payload;
      return interaction.editReply(options);
    }
  };
}

// ============================================
// AUTO-DELETE FUNCTION
// ============================================
function scheduleMessageDeletion(message) {
  if (!CONFIG.ENABLE_AUTO_DELETE || !message) return;

  const timeout = setTimeout(async () => {
    try {
      if (message.deletable) {
        await message.delete();
        log('INFO', 'Auto-deleted message', {
          messageId: message.id,
          author: message.author?.tag || 'bot',
          age: '5 minutes'
        });
      }
    } catch (error) {
      log('WARN', 'Failed to auto-delete message', {
        messageId: message.id,
        error: error.message
      });
    }
  }, CONFIG.AUTO_DELETE_TIMEOUT);

  // Store timeout ID for potential manual cleanup
  if (!message.deleteTimeout) {
    message.deleteTimeout = timeout;
  }
}

// Auto-delete for interaction replies
async function scheduleInteractionDeletion(interaction, replyOptions) {
  if (!CONFIG.ENABLE_AUTO_DELETE) {
    return interaction.editReply(replyOptions);
  }

  try {
    const reply = await interaction.editReply(replyOptions);

    // Schedule deletion
    const timeout = setTimeout(async () => {
      try {
        if (reply && reply.deletable) {
          await reply.delete();
          log('INFO', 'Auto-deleted interaction reply', {
            messageId: reply.id,
            user: interaction.user.tag,
            age: '5 minutes'
          });
        }
      } catch (error) {
        log('WARN', 'Failed to auto-delete interaction reply', {
          error: error.message
        });
      }
    }, CONFIG.AUTO_DELETE_TIMEOUT);

    return reply;
  } catch (error) {
    log('ERROR', 'scheduleInteractionDeletion failed', {
      error: error.message,
      user: interaction.user.tag
    });
    throw error;
  }
}

function getDirectDownloadExpiryMs() {
  return CONFIG.DIRECT_DOWNLOAD_TTL_MINUTES * 60 * 1000;
}

function createTemporaryDownloadLink(filePath, fileName) {
  if (!CONFIG.PUBLIC_BASE_URL) return null;
  if (!fs.existsSync(filePath)) return null;

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + getDirectDownloadExpiryMs();

  temporaryDownloads.set(token, {
    filePath,
    fileName,
    expiresAt
  });

  return `${CONFIG.PUBLIC_BASE_URL}/download/${token}`;
}

function cleanupExpiredTemporaryDownloads() {
  const now = Date.now();
  for (const [token, entry] of temporaryDownloads.entries()) {
    if (!entry || entry.expiresAt <= now) {
      temporaryDownloads.delete(token);
    }
  }
}

setInterval(cleanupExpiredTemporaryDownloads, 10 * 60 * 1000).unref();

// ============================================
// API SOURCES
// ============================================
const API_SOURCES = {
  steamStore: (appId) => `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`,
  steamSpy: (appId) => `https://steamspy.com/api.php?request=appdetails&appid=${appId}`,
  pcgw: (gameName) => `https://www.pcgamingwiki.com/w/api.php?action=cargoquery&tables=Infobox_game&fields=DRM&where=Infobox_game.Steam_AppID='${gameName}'&format=json`,
  steamDB: (appId) => `https://steamdb.info/app/${appId}/depots/`,
};

// ============================================
// MULTI-SOURCE API FETCHING
// ============================================

async function fetchSteamStoreData(appId) {
  try {
    const data = await fetchSteamStoreRaw(appId, { log, timeoutMs: 10000 });
    if (!data) return null;

    return {
      appId: appId,
      name: data.name,
      type: data.type,
      shortDescription: data.short_description,
      headerImage: data.header_image,
      developers: data.developers || [],
      publishers: data.publishers || [],
      releaseDate: data.release_date?.date || 'TBA',
      price: data.is_free ? 'Free to Play' : (data.price_overview?.final_formatted || 'N/A'),
      priceRaw: data.price_overview?.final || 0,
      currency: data.price_overview?.currency || 'USD',
      isFree: data.is_free || false,
      dlcCount: data.dlc?.length || 0,
      dlcAppIds: Array.isArray(data.dlc) ? data.dlc.map(id => String(id)) : [],
      categories: data.categories?.map(c => c.description) || [],
      genres: data.genres?.map(g => g.description) || [],
      platforms: {
        windows: data.platforms?.windows || false,
        mac: data.platforms?.mac || false,
        linux: data.platforms?.linux || false,
      },
      metacriticScore: data.metacritic?.score || null,
      recommendations: data.recommendations?.total || 0,
      supportedLanguages: data.supported_languages || '',
      screenshots: data.screenshots?.slice(0, 3).map(s => s.path_full) || [],
      movies: data.movies?.slice(0, 1).map(m => m.webm?.max || m.mp4?.max) || [],
    };

  } catch (error) {
    log('ERROR', `Failed to fetch Steam store data for ${appId}`, { error: error.message });
    return null;
  }
}

async function fetchSteamDlcForApp(appId) {
  try {
    const response = await axios.get(
      `https://store.steampowered.com/api/dlcforapp/?appid=${appId}&l=english&cc=us`,
      {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      }
    );

    if (!response?.data || response.data.status !== 1) return null;

    const dlcList = Array.isArray(response.data.dlc) ? response.data.dlc : [];
    return {
      count: dlcList.length,
      items: dlcList
    };
  } catch (error) {
    log('WARN', `Steam DLC endpoint unavailable for ${appId}`, { error: error.message });
    return null;
  }
}

function normalizeDlcCount(value) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function resolveAccurateDlcInfo({ steamStoreData, steamDlcData, steamDBInfo }) {
  const candidates = [
    { source: 'steam-store-appdetails', count: normalizeDlcCount(steamStoreData?.dlcCount) },
    { source: 'steam-store-dlcforapp', count: normalizeDlcCount(steamDlcData?.count) },
    { source: 'steamdb', count: normalizeDlcCount(steamDBInfo?.dlcCount) }
  ];

  candidates.sort((a, b) => b.count - a.count);
  const best = candidates[0] || { source: 'fallback', count: 0 };

  return {
    count: best.count,
    source: best.source,
    sources: candidates
  };
}

async function fetchSteamSpyData(appId) {
  try {
    const response = await axios.get(API_SOURCES.steamSpy(appId), { timeout: 10000 });

    if (response.data && response.data.appid) {
      return {
        owners: response.data.owners || 'Unknown',
        averagePlaytime: response.data.average_forever || 0,
        medianPlaytime: response.data.median_forever || 0,
        ccu: response.data.ccu || 0,
      };
    }

    return null;
  } catch (error) {
    log('WARN', `SteamSpy data unavailable for ${appId}`, { error: error.message });
    return null;
  }
}

// Helper to get name from DENUVO_GAMES
function getDenuvoGameName(appId) {
  const game = DENUVO_GAMES.find(g => g.id === parseInt(appId));
  return game ? game.name : null;
}

async function getFullGameInfo(appId, forceRefresh = false) {
  const cached = gameInfoCache[appId];
  if (!forceRefresh && cached && (Date.now() - cached.timestamp < CONFIG.CACHE_DURATION)) {
    log('INFO', `Using cached data for ${appId}`);
    return cached.data;
  }

  log('INFO', `Fetching fresh data for ${appId} from multiple sources...`);

  const [steamData, steamDBInfo, steamSpyData, steamDlcData, steamGridIcon] = await Promise.all([
    fetchSteamStoreData(appId),
    scrapeSteamDB(appId),
    fetchSteamSpyData(appId),
    fetchSteamDlcForApp(appId),
    getGameIcon(appId)
  ]);

  if (!steamData && !steamDBInfo) return null;

  const accurateSize = steamDBInfo?.size || await getAccurateGameSize(appId, { log });
  const drmInfo = detectDRMAccurate(appId, steamData || {}, { verifiedDRM: VERIFIED_DRM, icons: ICONS });
  const publisherInfo = detectPublisher(steamData?.publishers || [steamDBInfo?.publisher]);
  const dlcInfo = resolveAccurateDlcInfo({
    steamStoreData: steamData,
    steamDlcData,
    steamDBInfo
  });

  const languageCount = steamData?.supportedLanguages
    ? steamData.supportedLanguages.split(',').filter(l => l.trim()).length
    : 0;

  const fullInfo = {
    ...steamData,
    name: steamDBInfo?.name || steamData?.name || getDenuvoGameName(appId),
    developers: steamData?.developers || [steamDBInfo?.developer || 'Unknown'],
    drm: drmInfo,
    publisher: publisherInfo,
    size: accurateSize,
    sizeFormatted: steamDBInfo?.sizeFormatted || formatFileSize(accurateSize),
    sizeType: steamDBInfo?.sizeType,
    dlcCount: dlcInfo.count,
    dlcSource: dlcInfo.source,
    dlcSources: dlcInfo.sources,
    dlcItems: steamDlcData?.items || [],
    languageCount: languageCount,
    steamSpy: steamSpyData,
    lastUpdate: steamDBInfo?.lastUpdate || steamData?.releaseDate,
    rating: steamDBInfo?.rating,
    reviewCount: steamDBInfo?.reviewCount,
    steamGridIcon: steamGridIcon || null,

    isEAGame: publisherInfo.isEA,
    hasMultiplayer: steamData?.categories?.some(c =>
      c.toLowerCase().includes('multi') || c.toLowerCase().includes('co-op')
    ),
    isEarlyAccess: steamData?.categories?.some(c =>
      c.toLowerCase().includes('early access')
    ),

    lastUpdated: Date.now(),
  };

  gameInfoCache[appId] = {
    data: fullInfo,
    timestamp: Date.now(),
  };

  if (fullInfo.name) {
    const normalizedAppId = String(appId);
    gameNamesIndex[normalizedAppId] = fullInfo.name;

    const existingEntry = searchableGameList.find(item => item.appId === normalizedAppId);
    if (existingEntry) {
      existingEntry.name = fullInfo.name;
      existingEntry.normalizedName = normalizeGameName(fullInfo.name);
    } else {
      searchableGameList.push({
        appId: normalizedAppId,
        name: fullInfo.name,
        normalizedName: normalizeGameName(fullInfo.name)
      });
    }
  }

  saveGameInfoCache();

  log('SUCCESS', `Got full info for ${fullInfo.name || appId}`, {
    size: fullInfo.sizeFormatted,
    drm: drmInfo.type,
    price: steamData?.price || 'N/A',
    dlcCount: fullInfo.dlcCount,
    dlcSource: fullInfo.dlcSource
  });

  return fullInfo;
}

// ============================================
// FILE MANAGEMENT - ENHANCED WITH ONLINE-FIX
// ============================================

// Smart name matching function
function normalizeGameName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '') // Remove special characters
    .replace(/\s+/g, ''); // Remove spaces
}

/* DEPRECATED: Folder scanning logic removed
function findOnlineFixByGameName(gameName) {
  // ...
}
function calculateMatchScore(gameName, fileName) {
  // ...
}
*/

function findFiles(appId, gameName = null) {
  const result = { lua: [], fix: [], onlineFix: [] };

  // Find manifest files in priority order: archive first, then lua.
  const luaPatterns = [
    path.join(CONFIG.LUA_FILES_PATH, `${appId}.zip`),
    path.join(CONFIG.LUA_FILES_PATH, `${appId}.rar`),
    path.join(CONFIG.LUA_FILES_PATH, `${appId}.7z`),
    path.join(CONFIG.LUA_FILES_PATH, appId, `${appId}.zip`),
    path.join(CONFIG.LUA_FILES_PATH, appId, `${appId}.rar`),
    path.join(CONFIG.LUA_FILES_PATH, appId, `${appId}.7z`),
    path.join(CONFIG.LUA_FILES_PATH, `${appId}.lua`),
    path.join(CONFIG.LUA_FILES_PATH, appId, `${appId}.lua`),
    path.join(CONFIG.LUA_FILES_PATH, appId, 'game.lua'),
  ];

  for (const filePath of luaPatterns) {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      result.lua.push({
        path: filePath,
        name: path.basename(filePath),
        size: stats.size,
        sizeFormatted: formatFileSize(stats.size),
      });
    }
  }

  // Find Fix files
  const fixPatterns = [
    path.join(CONFIG.FIX_FILES_PATH, `${appId}.rar`),
    path.join(CONFIG.FIX_FILES_PATH, `${appId}.zip`),
    path.join(CONFIG.FIX_FILES_PATH, `${appId}.7z`),
  ];

  for (const filePath of fixPatterns) {
    if (fs.existsSync(filePath)) {
      const stats = fs.statSync(filePath);
      result.fix.push({
        path: filePath,
        name: path.basename(filePath),
        size: stats.size,
        sizeFormatted: formatFileSize(stats.size),
      });
    }
  }

  // Find Online-Fix files from folder
  // Pattern: APPID-online-fix.zip or APPID-onlinefix.zip or online-fix-APPID.zip
  if (fs.existsSync(CONFIG.ONLINE_FIX_PATH)) {
    try {
      const onlineFixFiles = fs.readdirSync(CONFIG.ONLINE_FIX_PATH);

      for (const file of onlineFixFiles) {
        // Check if filename contains AppID and online-fix keyword
        const containsAppId = file.includes(appId);
        const isOnlineFix = file.toLowerCase().includes('online-fix') || file.toLowerCase().includes('onlinefix');

        if (containsAppId && isOnlineFix) {
          const filePath = path.join(CONFIG.ONLINE_FIX_PATH, file);
          const stats = fs.statSync(filePath);
          result.onlineFix.push({
            path: filePath,
            name: file,
            size: stats.size,
            sizeFormatted: formatFileSize(stats.size),
          });
        }
      }
    } catch (err) {
      // Silently skip if online_fix folder doesn't exist or error reading
      log('DEBUG', `Online-Fix folder error for ${appId}`, { error: err.message });
    }
  }

  return result;
}

function scanAllGames() {
  const games = new Map(); // AppID -> count of files

  function scanFolder(folder) {
    if (!fs.existsSync(folder)) return;
    fs.readdirSync(folder).forEach(item => {
      const parsed = path.parse(item);
      const baseName = parsed.name;
      let appId = null;

      // Primary: accept exact numeric file/folder names (e.g. 10.lua, 730.lua, 1245620.lua)
      if (/^\d{1,10}$/.test(baseName)) {
        appId = baseName;
      } else {
        // Fallback: extract long numeric IDs embedded in names (avoid short false positives like "fc26")
        const embedded = baseName.match(/(?:^|[^0-9])(\d{6,10})(?:[^0-9]|$)/);
        if (embedded) {
          appId = embedded[1];
        }
      }

      if (!appId) return;
      games.set(appId, (games.get(appId) || 0) + 1);
    });
  }

  scanFolder(CONFIG.LUA_FILES_PATH);
  scanFolder(CONFIG.FIX_FILES_PATH);
  // scanFolder(CONFIG.ONLINE_FIX_PATH); // Deprecated

  // Return array of AppIDs (unique games count) sorted
  // But also track total files count for logging
  const uniqueGames = Array.from(games.keys()).sort();
  const totalFiles = Array.from(games.values()).reduce((a, b) => a + b, 0);

  // Store for use in logging
  global.gameStats = {
    uniqueGames: uniqueGames.length,
    totalFiles: totalFiles
  };

  return uniqueGames;
}

// ============================================
// IMPROVED EMBED CREATION
// ============================================
const { createBeautifulGameEmbed } = require('./embed_styles');
const { scrapeSteamDB } = require('./steamdb_scraper');
const { backupToGitHub } = require('../scripts/git_backup');
const CRACK_LINKS = require('../data/crack_links');
const ONLINE_FIX_LINKS = require('../data/online_fix_links');

async function createGameEmbed(appId, gameInfo, files, links = {}) {
  // Use new beautiful embed
  return createBeautifulGameEmbed(appId, gameInfo, files, links);
}

// Legacy embed function (backup)
async function createGameEmbedLegacy(appId, gameInfo, files) {
  const embed = new EmbedBuilder();

  // Dynamic color based on DRM severity
  const colors = {
    critical: 0xFF0000,  // Denuvo - Red
    warning: 0xFFA500,   // Anti-cheat - Orange
    info: 0x4A90E2,      // Steam DRM - Blue
    none: 0x00FF00,      // DRM-Free - Green
  };
  embed.setColor(colors[gameInfo.drm.severity] || 0x5865F2);

  // Title with game name
  embed.setTitle(`${getGameTitleStatusIcon(files.lua.length > 0)} ${gameInfo.name}`);
  if (parseBoolean(process.env.EMBED_GAME_TITLE_LINK_ENABLED, true)) {
    embed.setURL(`https://store.steampowered.com/app/${appId}`);
  }

  // Thumbnail
  if (gameInfo.headerImage) {
    embed.setThumbnail(gameInfo.headerImage);
  }

  // Short description in a compact format
  let description = '';
  if (gameInfo.shortDescription) {
    const desc = gameInfo.shortDescription.length > 200
      ? gameInfo.shortDescription.substring(0, 200) + '...'
      : gameInfo.shortDescription;
    description = `${desc}\n\n`;
  }

  // Links in description
  description += `[🔗 Steam Store](https://store.steampowered.com/app/${appId}) | [📊 SteamDB](https://steamdb.info/app/${appId})`;
  embed.setDescription(description);

  // ═══ GAME INFO - Compact Layout ═══
  // Row 1: Price | Size
  const priceDisplay = gameInfo.isFree ? '🆓 Free' : gameInfo.price;
  const sizeDisplay = gameInfo.sizeFormatted || 'N/A';

  const updateDate = gameInfo.lastUpdate || gameInfo.releaseDate || 'N/A';

  embed.addFields(
    { name: '💰 Giá', value: priceDisplay, inline: true },
    { name: '💾 Dung lượng', value: sizeDisplay, inline: true },
    { name: '🔄 Cập nhật', value: updateDate, inline: true }
  );

  // Row 2: DLC | Language | Rating
  embed.addFields(
    { name: '🎯 DLC', value: `${gameInfo.dlcCount}`, inline: true },
    { name: '🌍 Ngôn ngữ', value: `${gameInfo.languageCount}`, inline: true },
    { name: '⭐ Đánh giá', value: `${formatNumber(gameInfo.recommendations)}`, inline: true }
  );

  // Row 3: Developer | Publisher | DRM
  const devName = (gameInfo.developers[0] || 'Unknown').substring(0, 25);
  const pubName = gameInfo.publisher.name.substring(0, 25);
  const drmBadge = gameInfo.drm.isDRMFree ? '✅ Không DRM' : `${gameInfo.drm.icon} ${gameInfo.drm.type}`;

  embed.addFields(
    { name: '👨‍💻 Dev', value: devName, inline: true },
    { name: '🏢 Pub', value: pubName, inline: true },
    { name: '🔐 DRM', value: drmBadge, inline: true }
  );

  // ═══ DRM WARNING SECTION ═══
  if (gameInfo.drm.severity === 'critical') {
    embed.addFields({
      name: '⚠️ DENUVO - CÓ THỂ KHÓ CHƠI',
      value:
        '❌ Game này có **DENUVO** - bảo vệ rất mạnh\n' +
        '⏳ Có thể chưa bị crack hoặc crack chưa ổn định\n' +
        '⚠️ Chỉ tải nếu bạn chắc chắn đã có crack!',
      inline: false
    });
  } else if (gameInfo.drm.severity === 'warning') {
    const acName = gameInfo.drm.hasEAC ? 'EasyAntiCheat' :
                   gameInfo.drm.hasBattlEye ? 'BattlEye' : 'Anti-Cheat';
    embed.addFields({
      name: `🛡️ ${acName} - CẦN FIX ĐẶC BIỆT`,
      value:
        `Game dùng **${acName}** - cần bypass riêng\n` +
        `Tải **Crack/Fix** để có thể chơi online/co-op`,
      inline: false
    });
  } else if (gameInfo.drm.isDRMFree) {
    embed.addFields({
      name: '✅ DRM-FREE - CHƠI ĐƯỢC NGAY',
      value:
        '🎉 Game **KHÔNG CÓ BẢO VỆ DRM**\n' +
        '✨ Tải game, giải nén, chơi luôn!',
      inline: false
    });
  }

  // ═══ FILE STATUS ═══
  const hasMultiplayerFeatures = gameInfo.hasMultiplayer ||
                                  gameInfo.drm.needsOnlineFix ||
                                  gameInfo.categories?.some(c =>
                                    c.toLowerCase().includes('multi') ||
                                    c.toLowerCase().includes('co-op'));

  let fileInfo = [];
  if (files.lua.length > 0) fileInfo.push('✅ **Lua** - ' + files.lua[0].sizeFormatted);
  if (files.fix.length > 0) fileInfo.push('✅ **Crack/Fix** - ' + files.fix[0].sizeFormatted);
  if (files.onlineFix.length > 0) {
    fileInfo.push('✅ **Online-Fix** - ' + files.onlineFix[0].sizeFormatted);
  } else if (hasMultiplayerFeatures) {
    fileInfo.push('⚠️ **Online-Fix** - Chưa có');
  }

  if (fileInfo.length > 0) {
    embed.addFields({
      name: '📦 FILE CÓ SẴN',
      value: fileInfo.join('\n'),
      inline: false
    });
  }

  // EA Game Notice - inline
  if (gameInfo.isEAGame) {
    embed.addFields({
      name: '⚙️ EA GAME',
      value: 'Cần Origin/EA App',
      inline: true
    });
  }

  // Early Access Notice - inline
  if (gameInfo.isEarlyAccess) {
    embed.addFields({
      name: '🚧 EARLY ACCESS',
      value: 'Game chưa hoàn thành',
      inline: true
    });
  }

  embed.setFooter({
    text: `App ID: ${appId} | Cập nhật: ${new Date().toLocaleDateString('vi-VN')}`,
    iconURL: 'https://steampowered-a.akamaihd.net/steamcommunity/public/images/clans/39049585/5371505ff1c79c7db43dccf05fe86b1933203ce3.png'
  });

  return embed;
}

// ============================================
// COMMAND: GAME INFO
// ============================================

async function handleGameCommand(message, appId) {
  try {
    const isInteractionFlow = Boolean(message.isInteractionProxy);
    const shouldCheckManifest = Boolean(message.genOptions?.checkManifest);
    const loadingMsg = await message.reply(`🔍 **Searching for AppID: ${appId}...**`);
    scheduleMessageDeletion(loadingMsg);

    // STEP 1: Get info from SteamDB first
    if (!isInteractionFlow) {
      await loadingMsg.edit(`📊 **Scanning SteamDB...**`);
    }
    const steamDBInfo = await scrapeSteamDB(appId);

    if (!isInteractionFlow && steamDBInfo?.name) {
      await loadingMsg.edit(`✅ **Found: ${steamDBInfo.name}**\n⏳ Fetching details...`);
    }

    // STEP 2: Get info from Steam API
    let gameInfo = await getFullGameInfo(appId);

    if (!gameInfo) {
      const steamDBName = await getGameNameFromSteamDB(appId, { log });
      const denuvoName = getDenuvoGameName(appId);
      const gameName = steamDBName || denuvoName || `App ${appId}`;

      if (!steamDBName && !denuvoName) {
        if (!isInteractionFlow) {
          await loadingMsg.edit(
            `${ICONS.warning} Cannot fetch full info from Steam for AppID: \`${appId}\`\n` +
            `${ICONS.link} Link: https://store.steampowered.com/app/${appId}\n` +
            `${ICONS.link} SteamDB: https://steamdb.info/app/${appId}/\n` +
            `➡️ Continuing with minimal data to show available downloads`
          );
        }
      } else if (!isInteractionFlow) {
        await loadingMsg.edit(`✅ **Found: ${gameName}**\n⏳ Preparing details...`);
      }

      gameInfo = {
        name: gameName,
        headerImage: null,
        price: 'Unknown',
        sizeFormatted: 'Unknown',
        releaseDate: 'Unknown',
        dlcCount: 0,
        languageCount: 0,
        recommendations: 0,
        developers: ['Unknown'],
        publishers: ['Unknown'],
        shortDescription: 'Game information (minimal mode)',
        categories: [],
        drm: {
          type: 'Unknown',
          severity: 'info',
          icon: ICONS.info,
          isDRMFree: false,
          needsOnlineFix: false,
        },
        publisher: { name: 'Unknown', isEA: false },
      };

      log('INFO', `Using minimal data for ${appId}: ${gameName}`);
    }

    // Now find files with game name for smart Online-Fix search
    const files = findFiles(appId, gameInfo.name);

    // Check for direct crack link
    const crackLink = CRACK_LINKS[appId];
    // Check for direct online-fix link
    const onlineFixLink = ONLINE_FIX_LINKS[appId];

    // DEBUG: Log what we found
    log('INFO', `Resources check for ${appId}`, {
      lua: files.lua.length,
      fix: files.fix.length,
      onlineFile: files.onlineFix.length,
      crackLink: !!crackLink,
      onlineLink: !!onlineFixLink
    });

    const hasManifestFiles = files.lua.length > 0;

    const embed = await createGameEmbed(appId, gameInfo, files, { onlineFixLink, crackLink, autoPatch: database.games[appId]?.autoPatch });

    // Create download buttons (Single Row for cleaner layout)
    const rows = [];
    const row = new ActionRowBuilder();
    const commandUserId = message.author?.id || '';
    const primaryManifest = files.lua[0];
    const primaryManifestMeta = primaryManifest ? getManifestFileMeta(primaryManifest.name) : null;

    // GIF URLs for buttons
    const gifUrls = {
      lua: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaDB1anh5dGRqOThzcWtuMzltcGdrdGtkbWtmNDN4OHp2d3NieW8zbCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/EnrH0xdlmT5uBZ9BCe/giphy.gif",
      onlineFix: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaDB1anh5dGRqOThzcWtuMzltcGdrdGtkbWtmNDN4OHp2d3NieW8zbCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/YO7P8VC7nlQlO/giphy.gif",
      crack: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaDB1anh5dGRqOThzcWtuMzltcGdrdGtkbWtmNDN4OHp2d3NieW8zbCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/3o6ZtpgLSKicg4p1i8/giphy.gif"
    };

    // 1. Download manifest (archive preferred, then lua)
    if (files.lua.length > 0) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`dl_lua_${appId}_0_${commandUserId}`)
          .setLabel(
            primaryManifestMeta?.kind === 'archive'
              ? `Get Package (${primaryManifest.sizeFormatted})`
              : `Get Lua (${primaryManifest.sizeFormatted})`
          )
          .setStyle(ButtonStyle.Primary)
          .setEmoji(primaryManifestMeta?.emoji || '📦')
      );
    }

    // 2. Download Online-Fix (Link)
    if (onlineFixLink) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`dl_online_${appId}_0_${commandUserId}`)
          .setLabel('Online-Fix')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🌐')
      );
    }

    // 3. Download Crack (Link) - Single button with all links inside
    // IMPORTANT: Only create ONE button, even if there are multiple links
    // Fix: Explicit check for FC 26 Showcase or existing crackLink
    if ((crackLink || appId === '3629260') && !row.components.some(btn => btn.data.custom_id?.includes('dl_crack'))) {
      const crackLinks = Array.isArray(crackLink) ? crackLink : (crackLink ? [crackLink] : []);

      // Fallback for FC 26 Showcase if not in CRACK_LINKS but requested
      if (appId === '3629260' && crackLinks.length === 0) {
          // Check if link exists in data file, if not add fallback
          // This ensures the button appears even if CRACK_LINKS wasn't updated in memory yet
          const hardcodedLink = "https://huggingface.co/datasets/MangaVNteam/Assassin-Creed-Odyssey-Crack/resolve/main/EA%20SPORTS%20FC%E2%84%A2%2026%20SHOWCASE.zip?download=true";
          crackLinks.push(hardcodedLink);
      }

      if (crackLinks.length > 0) {
        // Create only ONE button for all crack links
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`dl_crack_${appId}_0_${commandUserId}`)
            .setLabel(`Bypass${crackLinks.length > 1 ? ` (${crackLinks.length})` : ''}`)
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🛠️')
        );

        log('INFO', `Created crack button for ${appId}`, {
          linksCount: crackLinks.length,
          buttonId: `dl_crack_${appId}_0_${commandUserId}`
        });
      }
    }

    // 4. Download Crack (File) - REMOVED per user request
    /*
    if (files.fix.length > 0) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`dl_fix_${appId}_0`)
          .setLabel(`Download Crack (${files.fix[0].sizeFormatted})`)
          .setStyle(ButtonStyle.Success)
          .setEmoji('🔧')
      );
    }
    */

    // Add row if it has components
    if (row.components.length > 0) rows.push(row);

    const responsePayload = {
      content: hasManifestFiles
        ? null
        : `${ICONS.warning} **No Lua/Package available yet** for \`${appId}\`.\n` +
          `Use \`/get appid:${appId}\` to request upstream fetch.`,
      embeds: [embed],
      components: rows,
    };

    if (shouldCheckManifest && hasManifestFiles) {
      try {
        const manifestFile = files.lua.find(item => {
          const meta = getManifestFileMeta(item?.name || '');
          return meta?.kind === 'archive';
        }) || files.lua[0];

        if (manifestFile) {
          const meta = getManifestFileMeta(manifestFile.name || '');
          if (meta?.kind === 'archive') {
            const inspection = await inspectArchiveManifestCount(manifestFile.path);
            if (inspection) {
              embed.addFields({
                name: '📦 Manifest Check',
                value: `Package: \`${manifestFile.name}\`\n` +
                  `Manifest files: **${inspection.manifestCount}**\n` +
                  `Method: \`${inspection.method}\`${inspection.uncertain ? ' (approx)' : ''}`,
                inline: false
              });
            } else {
              embed.addFields({
                name: '📦 Manifest Check',
                value: `Package: \`${manifestFile.name}\`\nUnable to inspect package in current environment.`,
                inline: false
              });
            }
          } else {
            embed.addFields({
              name: '📦 Manifest Check',
              value: `Selected file is not an archive package: \`${manifestFile.name}\``,
              inline: false
            });
          }
        }
      } catch (inspectionError) {
        log('WARN', 'Manifest check failed in /gen flow', {
          appId,
          error: inspectionError.message,
        });
        embed.addFields({
          name: '📦 Manifest Check',
          value: 'Could not inspect manifest package right now.',
          inline: false
        });
      }
    }

    if (isInteractionFlow) {
      appendQuickGuideField(embed, appId);
    }

    if (message.canEmbed === false) {
      responsePayload.content = `${ICONS.warning} Missing permission: **Embed Links**.`;
      responsePayload.embeds = [];
    }

    const responseMsg = await loadingMsg.edit(responsePayload);

    // Schedule deletion of response message
    scheduleMessageDeletion(responseMsg);

    // Update stats
    database.stats.totalSearches++;
    if (!database.games[appId]) {
      database.games[appId] = {
        name: gameInfo.name,
        downloads: 0,
        lastAccessed: Date.now(),
      };
    }
    database.games[appId].lastAccessed = Date.now();
    saveDatabase();

    log('INFO', `Game displayed: ${gameInfo.name}`, {
      user: message.author.tag,
      drm: gameInfo.drm.type,
      size: gameInfo.sizeFormatted,
    });

  } catch (error) {
    log('ERROR', 'Error in handleGameCommand', {
      appId,
      error: error.message,
      stack: error.stack
    });
    message.reply(`${ICONS.cross} Error occurred! Please try again later.`).catch(() => {});
  }
}

// ============================================
// COMMAND: SEARCH - STEAM API REAL-TIME
// ============================================
const { searchSteamStore } = require('./steam_search');
const { fetchLuaFromOpenCloud } = require('./openlua_scraper');
const { getGameGrid, getGameIcon } = require('./steamgriddb_api');

async function handleFetchLuaCommand(message) {
  if (!isAdmin(message.author.id)) {
    const msg = await message.reply(`${ICONS.cross} Only admins can use this command.`);
    scheduleMessageDeletion(msg);
    return;
  }

  const args = message.content.split(/\s+/);
  const appId = args[1];
  const gameName = args.slice(2).join(' ');

  if (!appId) {
    const msg = await message.reply(`${ICONS.info} Usage: \`!fetchlua <appid> [game name]\``);
    scheduleMessageDeletion(msg);
    return;
  }

  const loadingMsg = await message.reply(`${ICONS.sparkles} Searching OpenLua for **${appId}**...`);

  try {
    const result = await fetchLuaFromOpenCloud(appId, gameName);

    if (result.success) {
      await loadingMsg.edit(`${ICONS.check} **Success!** Downloaded Lua for \`${appId}\`.\n📂 Saved to: \`lua_files/${appId}.lua\``);
    } else {
      await loadingMsg.edit(`${ICONS.cross} **Failed:** ${result.error}`);
    }
  } catch (error) {
    await loadingMsg.edit(`${ICONS.cross} **Error:** ${error.message}`);
  }

  scheduleMessageDeletion(loadingMsg, 10000); // Keep result longer
}

async function requestMorrenusEndpoint(endpoint, { apiKey, responseType = 'arraybuffer' } = {}) {
  const url = `${CONFIG.MORRENUS_API_BASE_URL}${endpoint}`;
  const params = {};
  if (apiKey) params.api_key = apiKey;

  try {
    const response = await axios.get(url, {
      timeout: CONFIG.MORRENUS_REQUEST_TIMEOUT_MS,
      responseType,
      validateStatus: () => true,
      params,
      headers: {
        'Authorization': apiKey ? `Bearer ${apiKey}` : undefined,
        'X-API-Key': apiKey || undefined,
        'User-Agent': 'Discord-Lua-Bot/2.0',
        'Accept': responseType === 'text' ? 'text/plain,*/*' : '*/*',
      }
    });

    // Track usage for this key
    if (apiKey) {
      recordMorrenusKeyUsage(apiKey, response.status,
        response.status >= 400 ? (response.data?.detail || response.data?.message || `HTTP ${response.status}`) : null);

      // Parse rate limit info from response headers if available
      if (response.status === 429) {
        const state = getMorrenusKeyStats(apiKey);
        const retryAfterHeader = Number.parseFloat(response.headers?.['retry-after']);
        const retryAfterBody = Number.parseFloat(
          typeof response.data === 'object' ? response.data?.retry_after : undefined
        );
        const retryAfterSec = Number.isFinite(retryAfterHeader) ? retryAfterHeader
          : (Number.isFinite(retryAfterBody) ? retryAfterBody : 3600);
        state.rateLimitResetAt = Date.now() + Math.min(retryAfterSec * 1000, MORRENUS_RATE_LIMIT_WAIT_MAX_MS);
      }
    }

    return response;
  } catch (error) {
    if (apiKey) {
      recordMorrenusKeyUsage(apiKey, 0, error.message);
    }
    return {
      status: 0,
      error,
      data: null
    };
  }
}

function normalizeMorrenusTextPayload(payload) {
  if (typeof payload === 'string') return payload;
  if (Buffer.isBuffer(payload)) return payload.toString('utf8');
  if (payload == null) return '';
  return Buffer.from(payload).toString('utf8');
}

function isZipBuffer(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 4 &&
    buffer[0] === 0x50 && buffer[1] === 0x4B;
}

async function fetchAndStoreManifestFromMorrenus(appId, retryAttempt = 0) {
  const keyPool = getMorrenusApiKeyPool();
  if (keyPool.length === 0) {
    return {
      ok: false,
      code: 'MISSING_API_KEY',
      message: 'Morrenus API key is missing. Configure MORRENUS_API_KEY in .env.'
    };
  }

  // Check if any key is available before starting
  const availableKey = getMorrenusNextAvailableKey();
  if (!availableKey) {
    // 🤖 Thử auto-generate key mới bằng Playwright
    const autoKey = await morrenusAutoGenerateKey();
    if (autoKey) {
      // Retry với key mới
      console.log(`[Morrenus] 🔄 Retrying with auto-generated key for appId=${appId}`);
      return fetchAndStoreManifestFromMorrenus(appId);
    }

    // Thử hot-reload từ file (có thể user vừa paste key mới)
    if (morrenusHotReloadKey()) {
      console.log(`[Morrenus] 🔄 Hot-reloaded key, retrying for appId=${appId}`);
      return fetchAndStoreManifestFromMorrenus(appId);
    }

    const nextReset = getMorrenusNextResetTime();
    const status = getMorrenusKeyPoolStatus();
    const waitInfo = nextReset
      ? `Next key reset: ${new Date(nextReset).toISOString()} (${Math.ceil((nextReset - Date.now()) / 60000)} min)`
      : 'All keys expired/auth-failed. Update keys in .env or run: node scripts/morrenus_key_manager.js generate';
    return {
      ok: false,
      code: 'ALL_KEYS_EXHAUSTED',
      message: `All ${status.totalKeys} Morrenus key(s) exhausted. ${waitInfo}`,
      keyStatus: status,
    };
  }

  const attempts = [];
  let fallbackNotFound = false;

  // Smart rotation: try available keys only, skip exhausted ones
  for (let index = 0; index < keyPool.length; index++) {
    const apiKey = keyPool[index];

    // Skip keys that are known to be exhausted
    if (!isMorrenusKeyAvailable(apiKey)) {
      attempts.push({
        keyIndex: index + 1,
        endpoint: 'manifest',
        status: 0,
        error: 'Key skipped (exhausted/rate-limited)',
        skipped: true,
      });
      continue;
    }

    const manifestResponse = await requestMorrenusEndpoint(`/api/v1/manifest/${appId}`, {
      apiKey,
      responseType: 'arraybuffer'
    });

    attempts.push({
      keyIndex: index + 1,
      endpoint: 'manifest',
      status: manifestResponse.status || 0,
      error: manifestResponse.error?.message || null
    });

    if (manifestResponse.status === 200) {
      const buffer = Buffer.isBuffer(manifestResponse.data)
        ? manifestResponse.data
        : Buffer.from(manifestResponse.data || []);
      const zipPath = path.join(CONFIG.LUA_FILES_PATH, `${appId}.zip`);
      const luaPath = path.join(CONFIG.LUA_FILES_PATH, `${appId}.lua`);

      if (isZipBuffer(buffer)) {
        fs.writeFileSync(zipPath, buffer);
        return {
          ok: true,
          sourceEndpoint: 'manifest',
          sourceType: 'zip',
          keyIndex: index + 1,
          keyCount: keyPool.length,
          primaryFilePath: zipPath,
          savedFiles: [zipPath],
          keyStatus: getMorrenusKeyPoolStatus(),
        };
      }

      const textPayload = normalizeMorrenusTextPayload(buffer).trim();
      fs.writeFileSync(luaPath, textPayload, 'utf8');
      createStoredZipWithSingleEntry(zipPath, `${appId}.lua`, Buffer.from(textPayload, 'utf8'));

      return {
        ok: true,
        sourceEndpoint: 'manifest',
        sourceType: 'text',
        keyIndex: index + 1,
        keyCount: keyPool.length,
        primaryFilePath: zipPath,
        savedFiles: [zipPath, luaPath],
        keyStatus: getMorrenusKeyPoolStatus(),
      };
    }

    if (manifestResponse.status !== 404) {
      if (isMorrenusAuthOrRateStatus(manifestResponse.status)) {
        continue; // Key exhausted, try next key
      }
      if (manifestResponse.status >= 500 || manifestResponse.status === 0) {
        continue;
      }
    }

    // Skip lua fallback if this key just got exhausted
    if (!isMorrenusKeyAvailable(apiKey)) {
      continue;
    }

    const luaResponse = await requestMorrenusEndpoint(`/api/v1/lua/${appId}`, {
      apiKey,
      responseType: 'text'
    });

    attempts.push({
      keyIndex: index + 1,
      endpoint: 'lua',
      status: luaResponse.status || 0,
      error: luaResponse.error?.message || null
    });

    if (luaResponse.status === 200) {
      const luaText = normalizeMorrenusTextPayload(luaResponse.data).trim();
      const luaPath = path.join(CONFIG.LUA_FILES_PATH, `${appId}.lua`);
      const zipPath = path.join(CONFIG.LUA_FILES_PATH, `${appId}.zip`);

      fs.writeFileSync(luaPath, luaText, 'utf8');
      createStoredZipWithSingleEntry(zipPath, `${appId}.lua`, Buffer.from(luaText, 'utf8'));

      return {
        ok: true,
        sourceEndpoint: 'lua',
        sourceType: 'text',
        keyIndex: index + 1,
        keyCount: keyPool.length,
        primaryFilePath: zipPath,
        savedFiles: [zipPath, luaPath],
        keyStatus: getMorrenusKeyPoolStatus(),
      };
    }

    if (luaResponse.status === 404) {
      fallbackNotFound = true;
      continue;
    }
  }

  const statuses = attempts.filter(a => !a.skipped).map(item => item.status);
  const allAuthOrRate = statuses.length > 0 && statuses.every(status => isMorrenusAuthOrRateStatus(status));
  const hasRateLimit = statuses.includes(429);
  const hasAuthError = statuses.includes(401) || statuses.includes(403);
  const all404 = statuses.length > 0 && statuses.every(status => status === 404);
  const lastStatus = statuses.length ? statuses[statuses.length - 1] : 0;
  const keyStatus = getMorrenusKeyPoolStatus();

  if (all404 || (fallbackNotFound && !hasAuthError && !hasRateLimit)) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: 'No manifest/lua available on upstream for this AppID.',
      attempts,
      keyStatus,
    };
  }

  if (allAuthOrRate && hasRateLimit) {
    const nextReset = getMorrenusNextResetTime();
    const waitInfo = nextReset
      ? ` Next reset: ~${Math.ceil((nextReset - Date.now()) / 60000)} min.`
      : '';
    return {
      ok: false,
      code: 'RATE_LIMIT',
      message: `All Morrenus keys hit rate limit (429).${waitInfo} Go to https://manifest.morrenus.xyz/api-keys/user to generate a new key.`,
      attempts,
      keyStatus,
    };
  }

  if (allAuthOrRate || hasAuthError) {
    if (retryAttempt < 1) {
      const autoKey = await morrenusAutoGenerateKey();
      if (autoKey) {
        console.log(`[Morrenus] 🔄 Retrying after auth error with new key for appId=${appId}`);
        return fetchAndStoreManifestFromMorrenus(appId, retryAttempt + 1);
      }
    }

    return {
      ok: false,
      code: 'AUTH_ERROR',
      message: 'Morrenus API key unauthorized/expired. Go to https://manifest.morrenus.xyz/api-keys/user to generate a new key and update .env.',
      attempts,
      keyStatus,
    };
  }

  return {
    ok: false,
    code: 'UPSTREAM_ERROR',
    message: `Morrenus request failed (last status: ${lastStatus || 'network error'}).`,
    attempts,
    keyStatus,
  };
}

async function searchGameByName(query) {
  try {
    // Search directly from Steam Store API
    const steamResults = await searchSteamStore(query);

    if (steamResults.length > 0) {
      return steamResults.slice(0, 20).map(game => ({
        appId: game.appId,
        name: game.name,
        matchScore: 90
      }));
    }

    // Fallback: search in local files
    const normalizedQuery = normalizeGameName(query);
    const allGames = scanAllGames();
    const matches = [];

    for (const appId of allGames) {
      let gameName = gameNamesIndex[appId] || gameInfoCache[appId]?.data?.name;

      if (!gameName && matches.length < 20) {
        // Try Steam Store HTML first (less likely to be blocked than SteamDB)
        gameName = await getGameNameFromSteamHTML(appId, { log }) || await getGameNameFromSteamDB(appId, { log });
        if (gameName) {
          gameNamesIndex[appId] = gameName;
        }
      }

      if (gameName) {
        const normalizedName = normalizeGameName(gameName);
        if (normalizedName.includes(normalizedQuery)) {
          matches.push({
            appId,
            name: gameName,
            matchScore: calculateMatchScore(normalizedQuery, normalizedName)
          });
        }
      }

      if (matches.length >= 20) break;
    }

    matches.sort((a, b) => b.matchScore - a.matchScore);
    return matches;

  } catch (error) {
    log('ERROR', 'Failed to search games', { query, error: error.message });
    return [];
  }
}

async function handleSearchCommand(message, query) {
  try {
    const loadingMsg = await message.reply(`${ICONS.info} Searching on Steam...`);
    scheduleMessageDeletion(loadingMsg);

    const results = await searchGameByName(query);

    if (results.length === 0) {
      const embedNotFound = new EmbedBuilder()
        .setColor(0xE74C3C) // Red color
        .setTitle(`${ICONS.cross} Game Not Found`)
        .setDescription(`Could not find game "**${query}**" in the system.\n\n**Suggestions:**\n• Check the spelling of the game name\n• Use fewer keywords (e.g. "tekken" instead of "tekken 8 deluxe edition")\n• Try searching by AppID if you know it`)
        .setFooter({ text: 'Auto-deletes in 5min' });

      return loadingMsg.edit({ content: null, embeds: [embedNotFound] });
    }

    const embed = new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle(`${ICONS.game} Search Results: "**${query}**"`)
      .setDescription(`Found ${results.length} game(s). Use \`/gen appid:<appid>\` to view details.`);

    // Show results in pages if too many
    const maxDisplay = 10; // Giảm xuống 10 để hiển thị ảnh đẹp hơn
    const displayResults = results.slice(0, maxDisplay);

    const denuvoSet = new Set(DENUVO_GAMES.map(g => String(g.id)));

    // Nếu chỉ có 1 kết quả, hiển thị dạng Large Embed
    if (displayResults.length === 1) {
      const game = displayResults[0];
      const isDenuvo = denuvoSet.has(String(game.appId));
      const drmTag = isDenuvo ? ' • ⚠️ **Denuvo Anti-Tamper**' : '';

      const hasLua = findFiles(String(game.appId)).lua.length > 0;
      const hasOnlineFix = ONLINE_FIX_LINKS[game.appId] || fs.existsSync(path.join(CONFIG.ONLINE_FIX_PATH, `${game.appId}-online-fix.zip`));
      const hasCrack = CRACK_LINKS[game.appId];

      let statusIcons = [];
      if (hasLua) statusIcons.push('📜 Lua');
      if (hasOnlineFix) statusIcons.push('🌐 Online-Fix');
      if (hasCrack) statusIcons.push('🔥 Crack');
      const statusText = statusIcons.length > 0 ? `\n   ${statusIcons.join(' • ')}` : '';

      // Try SteamGridDB first, fallback to Steam Header
      let imageUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/header.jpg`;
      try {
        const gridUrl = await getGameGrid(game.appId);
        if (gridUrl) imageUrl = gridUrl;
      } catch (e) { /* ignore */ }

      embed.setThumbnail(imageUrl);
      embed.addFields({
        name: `1. ${game.name}${isDenuvo ? ' [DRM]' : ''}`,
        value: `AppID: \`${game.appId}\` • Command: \`!${game.appId}\`${drmTag}${statusText}`,
        inline: false
      });
    } else {
      // Hiển thị danh sách nhiều game
      // Discord không hỗ trợ ảnh cho từng field, nên ta chỉ có thể hiển thị text
      // Tuy nhiên, ta có thể set ảnh Thumbnail là game đầu tiên để đẹp hơn

      // Try SteamGridDB for first game
      let firstGameImage = `https://cdn.cloudflare.steamstatic.com/steam/apps/${displayResults[0].appId}/header.jpg`;
      try {
        const gridUrl = await getGameGrid(displayResults[0].appId);
        if (gridUrl) firstGameImage = gridUrl;
      } catch (e) { /* ignore */ }

      embed.setThumbnail(firstGameImage);

      displayResults.forEach((game, index) => {
        const isDenuvo = denuvoSet.has(String(game.appId));
        const drmTag = isDenuvo ? ' • ⚠️ **Denuvo Anti-Tamper**' : '';

        const hasLua = findFiles(String(game.appId)).lua.length > 0;
        const hasOnlineFix = ONLINE_FIX_LINKS[game.appId] || fs.existsSync(path.join(CONFIG.ONLINE_FIX_PATH, `${game.appId}-online-fix.zip`));
        const hasCrack = CRACK_LINKS[game.appId];

        let statusIcons = [];
        if (hasLua) statusIcons.push('📜');
        if (hasOnlineFix) statusIcons.push('🌐');
        if (hasCrack) statusIcons.push('🔥');

        const statusText = statusIcons.length > 0 ? ` [${statusIcons.join(' ')}]` : '';

        embed.addFields({
          name: `${index + 1}. ${game.name}`,
          value: `🆔 \`${game.appId}\`${statusText}${isDenuvo ? ' ⚠️ Denuvo' : ''} • \`!${game.appId}\``,
          inline: false
        });
      });
    }

    if (results.length > maxDisplay) {
      embed.addFields({
        name: '📋 More Results',
        value: `... and ${results.length - maxDisplay} more games. Refine your search for better results.`,
        inline: false
      });
    }

    const warningEmbeds = [];
    displayResults.forEach((game) => {
      const isDenuvo = denuvoSet.has(String(game.appId));
      if (!isDenuvo) return;
      const panel = new EmbedBuilder()
        .setColor(0xE74C3C)
        .setTitle('🔐 DRM/Restrictions detected')
        .setDescription(
          `**${game.name}**\n` +
          'Denuvo Anti-Tamper detected\n' +
          (/\bEA\b|\bEA SPORTS\b|Electronic Arts/i.test(game.name) ? 'EA App\n' : '') +
          'You may NOT be able to play this game. [More info](https://store.steampowered.com/app/' + game.appId + ')'
        )
        .setThumbnail(`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/capsule_184x69.jpg`);
      warningEmbeds.push(panel);
    });

    embed.setFooter({ text: 'Click AppID to view full info • Auto-deletes in 5min' });

    await loadingMsg.edit({ embeds: [embed, ...warningEmbeds] });

    database.stats.totalSearches++;
    saveDatabase();

    log('INFO', 'Search completed', { query, resultsCount: results.length });

  } catch (error) {
    log('ERROR', 'Error in handleSearchCommand', { query, error: error.message });
    message.reply(`${ICONS.cross} Error occurred!`).catch(() => {});
  }
}

// ============================================
// OTHER COMMANDS
// ============================================

async function handleHelpCommand(message) {
  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`${ICONS.game} Hướng dẫn sử dụng bot`)
    .setDescription(buildVietnameseUsageGuideText())
    .addFields(
      {
        name: `${ICONS.sparkles} Lệnh chính`,
        value: [
          '`/gen appid:<id-hoặc-tên-game>` - Lấy file lua/package đã có trong kho',
          '`/get appid:<id-hoặc-tên-game>` - Fetch từ upstream và lưu vào kho',
          '`/help` - Xem hướng dẫn sử dụng',
          '`/steam appid:<id-hoặc-tên-game>` - Xem thông tin game (nếu server đã bật lệnh này)',
        ].join('\n')
      },
      {
        name: `${ICONS.fire} Gợi ý`,
        value: [
          `${ICONS.check} Bấm nút download trong kết quả /gen để nhận file`,
          `${ICONS.check} Bot sẽ báo số lượt tải còn lại sau mỗi lần tải`,
          `${ICONS.check} Sau 10 giây bot gửi lại hướng dẫn nhanh để người mới dễ dùng`,
        ].join('\n')
      }
    )
    .setFooter({ text: `Bot hỗ trợ tiếng Việt • Tin nhắn tự xoá sau 5 phút` })
    .setTimestamp();

  if (isAdmin(message.author.id)) {
    embed.addFields({
      name: `${ICONS.warning} Admin Commands`,
      value: [
        '`!stats` - View statistics',
        '`!reload` - Reload database',
        '`!clearcache` - Clear cache',
        '`!toggleautodelete` - Toggle auto-delete',
        '`!collectlua` - Collect new Lua files',
        '`!backup` - Backup project to GitHub',
      ].join('\n')
    });
  }

  const helpMsg = await message.reply({ embeds: [embed] });
  scheduleMessageDeletion(helpMsg);
}

async function handleListCommand(message) {
  const allGames = scanAllGames();

  if (allGames.length === 0) {
    return message.reply(`${ICONS.cross} No games available yet!`);
  }

  const embed = new EmbedBuilder()
    .setColor(0x2ECC71)
    .setTitle(`${ICONS.game} Available Games`)
    .setDescription(`${ICONS.fire} Total: ${allGames.length} game(s)`)
    .addFields({
      name: 'AppIDs',
      value: allGames.slice(0, 20).map(id => `\`${id}\``).join(', ') +
             (allGames.length > 20 ? `\n... and ${allGames.length - 20} more games` : '')
    })
    .setFooter({ text: 'Use !<appid> to view details • Auto-deletes in 5min' });

  const listMsg = await message.reply({ embeds: [embed] });
  scheduleMessageDeletion(listMsg);
}

async function handleStatsCommand(message) {
  if (!isAdmin(message.author.id)) {
    return message.reply(`${ICONS.cross} Admin only!`);
  }

  const allGames = scanAllGames();
  const uniqueGames = global.gameStats?.uniqueGames || allGames.length;
  const totalFiles = global.gameStats?.totalFiles || 'N/A';
  const cachedGames = Object.keys(gameInfoCache).length;

  const embed = new EmbedBuilder()
    .setColor(0xFFAA00)
    .setTitle(`📊 BOT STATISTICS`)
    .addFields(
      { name: '🎮 Unique Games', value: `${uniqueGames}`, inline: true },
      { name: '📁 Total Files', value: `${totalFiles}`, inline: true },
      { name: '💾 Cached Info', value: `${cachedGames}`, inline: true },
      { name: '⬇️ Downloads', value: `${database.stats.totalDownloads}`, inline: true },
      { name: '🔍 Searches', value: `${database.stats.totalSearches}`, inline: true },
      { name: '⏱️ Uptime', value: `${Math.floor(process.uptime() / 3600)}h`, inline: true }
    )
    .setFooter({
      text: `Updated: ${new Date().toLocaleString('en-US')}`,
      iconURL: client.user?.avatarURL()
    })
    .setTimestamp();

  const statsMsg = await message.reply({ embeds: [embed] });
  scheduleMessageDeletion(statsMsg);
}

async function handleClearCacheCommand(message) {
  if (!isAdmin(message.author.id)) {
    return message.reply(`${ICONS.cross} Admin only!`);
  }

  gameInfoCache = {};
  saveGameInfoCache();

  const cacheMsg = await message.reply(`${ICONS.check} Cache cleared! All game data will be refreshed on next query.`);
  scheduleMessageDeletion(cacheMsg);
}

async function handleRefreshCommand(message, appId) {
  try {
    const loadingMsg = await message.reply(`${ICONS.info} Refreshing info from SteamDB...`);
    scheduleMessageDeletion(loadingMsg);

    // Force refresh from SteamDB
    const gameInfo = await getFullGameInfo(appId, true);

    if (!gameInfo) {
      return loadingMsg.edit(`${ICONS.cross} Cannot fetch new info for AppID: \`${appId}\``);
    }

    const refreshMsg = await loadingMsg.edit(
      `${ICONS.check} **Info updated successfully!**\n\n` +
      `${ICONS.game} Game: **${gameInfo.name}**\n` +
      `${ICONS.size} Size: **${gameInfo.sizeFormatted || 'Unknown'}**\n` +
      `${ICONS.price} Price: **${gameInfo.price}**\n` +
      `${ICONS.info} Use \`!${appId}\` to view details`
    );
    scheduleMessageDeletion(refreshMsg);

  } catch (error) {
    log('ERROR', 'Error in handleRefreshCommand', { appId, error: error.message });
    message.reply(`${ICONS.cross} Error refreshing info!`).catch(() => {});
  }
}

async function handleCollectLuaCommand(message) {
  if (!isAdmin(message.author.id)) {
    return message.reply(`${ICONS.cross} Admin only!`);
  }

  try {
    const loadingMsg = await message.reply(
      `${ICONS.info} **Collecting Lua files from multiple sources...**\n\n` +
      `${ICONS.sparkles} Sources: GitHub, Gists, Known Repos\n` +
      `${ICONS.warning} This process may take a few minutes...`
    );
    scheduleMessageDeletion(loadingMsg);

    // Import collector
    const { collectAllSources } = require('./lua_collector');

    // Run collection
    const startTime = Date.now();
    await collectAllSources();
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    // Count total files
    const allGames = scanAllGames();

    const resultMsg = await loadingMsg.edit(
      `${ICONS.check} **Collection complete!**\n\n` +
      `${ICONS.fire} Total games: **${allGames.length}**\n` +
      `${ICONS.info} Duration: **${duration}s**\n` +
      `${ICONS.sparkles} Use \`!list\` to view list`
    );
    scheduleMessageDeletion(resultMsg);

  } catch (error) {
    log('ERROR', 'Error in handleCollectLuaCommand', { error: error.message });
    message.reply(`${ICONS.cross} Error collecting Lua files!`).catch(() => {});
  }
}

async function handleBackupCommand(message) {
  if (!isAdmin(message.author.id)) {
    return message.reply(`${ICONS.cross} Admin only!`);
  }

  const loadingMsg = await message.reply(`${ICONS.info} **Starting backup to GitHub...** ⏳`);

  try {
    const success = await backupToGitHub();

    if (success) {
      await loadingMsg.edit(`${ICONS.check} **Backup successful!** Project source code pushed to GitHub.`);
    } else {
      await loadingMsg.edit(`${ICONS.cross} **Backup failed!** Check console logs for details.`);
    }
  } catch (error) {
    log('ERROR', 'Backup command failed', { error: error.message });
    await loadingMsg.edit(`${ICONS.cross} **Backup failed:** ${error.message}`);
  }

  scheduleMessageDeletion(loadingMsg);
}

async function handleToggleAutoDeleteCommand(message) {
  if (!isAdmin(message.author.id)) {
    return message.reply(`${ICONS.cross} Admin only!`);
  }

  CONFIG.ENABLE_AUTO_DELETE = !CONFIG.ENABLE_AUTO_DELETE;

  const toggleMsg = await message.reply(
    `${ICONS.check} Auto-delete is now **${CONFIG.ENABLE_AUTO_DELETE ? 'ENABLED' : 'DISABLED'}**\n` +
    `${ICONS.info} Messages will ${CONFIG.ENABLE_AUTO_DELETE ? 'auto-delete after 5 minutes' : 'NOT auto-delete'}.`
  );

  if (CONFIG.ENABLE_AUTO_DELETE) {
    scheduleMessageDeletion(toggleMsg);
  }
}

async function handleGenAutocomplete(interaction) {
  let focused;
  try {
    focused = interaction.options.getFocused(true);
  } catch (error) {
    log('WARN', 'Autocomplete focus read failed', { error: error.message });
    try { await interaction.respond([]); } catch (_) {}
    return;
  }

  if (!focused || focused.name !== 'appid') {
    try { await interaction.respond([]); } catch (_) {}
    return;
  }

  const query = String(focused.value || '');
  const localMatches = searchLocalGames(query, AUTOCOMPLETE_LIMIT);
  let matches = localMatches;

  try {
    const mergedMatches = await Promise.race([
      getAutocompleteGames(query, AUTOCOMPLETE_LIMIT),
      new Promise(resolve => setTimeout(() => resolve(null), AUTOCOMPLETE_RESPONSE_BUDGET_MS))
    ]);

    if (Array.isArray(mergedMatches) && mergedMatches.length > 0) {
      matches = mergedMatches;
    }
  } catch (error) {
    log('WARN', 'Autocomplete fallback to local results', {
      query,
      error: error.message
    });
  }

  const choices = buildAutocompleteChoices(matches);

  try {
    await interaction.respond(choices);
  } catch (error) {
    log('WARN', 'Autocomplete respond failed', {
      query,
      choices: choices.length,
      error: error.message
    });
    try { await interaction.respond([]); } catch (_) {}
  }
}

function buildSlashValidationErrorEmbed(rawInput, resolution, commandName = 'gen') {
  const embed = new EmbedBuilder()
    .setColor(0xED4245)
    .setTitle('Game not found')
    .setDescription(
      rawInput
        ? `Could not resolve \`${rawInput}\` to a valid game.\nUse the autocomplete list for exact results.`
        : 'You must fill the `appid` field with a Steam App ID or game name.'
    );

  if (resolution?.suggestions?.length) {
    const suggestionLines = resolution.suggestions
      .slice(0, 5)
      .map((game, idx) => `${idx + 1}. ${game.name} (\`${game.appId}\`)`);

    embed.addFields({
      name: 'Did you mean',
      value: suggestionLines.join('\n').slice(0, 1024),
      inline: false
    });
  }

  embed.setFooter({ text: `Tip: type /${commandName} then use autocomplete for appid.` });
  return embed;
}

function buildProcessingEmbed(displayName, appId) {
  return new EmbedBuilder()
    .setColor(0x00B8D9)
    .setTitle('Processing...')
    .setDescription(
      `**${displayName}** (Game ID: \`${appId}\`)\n\n` +
      'Generating files, please wait...\n' +
      'This may take a few seconds depending on game size.'
    )
    .setFooter({ text: 'Solus Gen | Preparing accurate game data and manifests' });
}

function appendQuickGuideField(embed, appId) {
  const fields = embed.data?.fields || [];
  if (fields.length >= 24) return;

  embed.addFields({
    name: 'Hướng dẫn nhanh',
    value: [
      '`/gen appid:<id-hoặc-tên-game>` - Lấy file lua/package',
      `Nếu chưa có file, dùng \`/get appid:${appId}\` rồi /gen lại`,
      '`/help` - Xem hướng dẫn đầy đủ',
    ].join('\n'),
    inline: false
  });
}

function buildGetProcessingEmbed(displayName, appId) {
  return new EmbedBuilder()
    .setColor(0xF1C40F)
    .setTitle('Preparing upstream fetch...')
    .setDescription(
      `**${displayName}** (Game ID: \`${appId}\`)\n\n` +
      'Checking upstream manifest/lua source and storing to local library.\n' +
      'Please wait while we process your request.'
    )
    .setFooter({ text: 'Solus Get | Upstream fetch queue in progress' });
}

async function handleGenSlashCommand(interaction) {
  const rawInput = interaction.options.getString('appid', true).trim();
  const checkManifest = interaction.options.getBoolean('check_manifest') ?? false;

  // Acknowledge early to avoid 3s interaction timeout on slow/network paths.
  await interaction.deferReply();

  if (!rawInput) {
    return interaction.editReply({
      embeds: [buildSlashValidationErrorEmbed(rawInput)],
    });
  }

  const resolution = await resolveAppIdInput(rawInput);
  if (!resolution.appId) {
    return interaction.editReply({
      embeds: [buildSlashValidationErrorEmbed(rawInput, resolution)],
    });
  }

  log('INFO', 'Slash /gen request resolved', {
    user: interaction.user.tag,
    input: rawInput,
    appId: resolution.appId,
    reason: resolution.reason,
    checkManifest
  });

  const resolvedName = resolution.resolvedName || getGameNameById(resolution.appId) || `App ${resolution.appId}`;
  await interaction.editReply({
    embeds: [buildProcessingEmbed(resolvedName, resolution.appId)],
    content: null,
    components: []
  });

  await sleep(CONFIG.GEN_PROCESSING_DELAY_MS);

  const proxyMessage = createInteractionMessageProxy(interaction, {
    genOptions: {
      checkManifest
    }
  });
  await handleGameCommand(proxyMessage, resolution.appId);
}

function formatSavedFilesList(savedFiles = []) {
  if (!Array.isArray(savedFiles) || savedFiles.length === 0) {
    return 'No files saved';
  }

  return savedFiles
    .map(filePath => `- \`${path.basename(filePath)}\``)
    .join('\n')
    .slice(0, 1024);
}

async function handleGetSlashCommand(interaction) {
  const rawInput = interaction.options.getString('appid', true).trim();
  await interaction.deferReply();

  if (!rawInput) {
    return interaction.editReply({
      embeds: [buildSlashValidationErrorEmbed(rawInput, null, GET_SLASH_COMMAND.name)],
    });
  }

  const resolution = await resolveAppIdInput(rawInput);
  if (!resolution.appId) {
    return interaction.editReply({
      embeds: [buildSlashValidationErrorEmbed(rawInput, resolution, GET_SLASH_COMMAND.name)],
    });
  }

  const appId = String(resolution.appId);
  const resolvedName = resolution.resolvedName || getGameNameById(appId) || `App ${appId}`;

  await interaction.editReply({
    embeds: [buildGetProcessingEmbed(resolvedName, appId)],
    content: null,
    components: []
  });

  await sleep(CONFIG.GET_PROCESSING_DELAY_MS);

  const fetchResult = await fetchAndStoreManifestFromMorrenus(appId);
  if (!fetchResult.ok) {
    const failureEmbed = new EmbedBuilder()
      .setColor(0xE74C3C)
      .setTitle('Upstream fetch failed')
      .setDescription(
        `${fetchResult.message}\n\n` +
        `You can retry later with \`/get appid:${appId}\`.`
      )
      .addFields({
        name: 'Next step',
        value: `If this game is unavailable upstream, use \`/gen appid:${appId}\` after adding files manually.`,
        inline: false
      });

    return interaction.editReply({
      embeds: [failureEmbed],
      components: []
    });
  }

  const primaryPath = fetchResult.primaryFilePath || fetchResult.savedFiles?.[0];
  let githubUrl = null;
  if (primaryPath && fs.existsSync(primaryPath)) {
    githubUrl = await uploadToGitHub(primaryPath, path.basename(primaryPath), 'lua_files');
  }

  if (!database.games[appId]) {
    database.games[appId] = {
      name: resolvedName,
      downloads: 0,
      lastAccessed: Date.now(),
    };
  } else if (!database.games[appId].name && resolvedName) {
    database.games[appId].name = resolvedName;
  }
  database.games[appId].lastAccessed = Date.now();
  saveDatabase();

  const successEmbed = new EmbedBuilder()
    .setColor(0x2ECC71)
    .setTitle('Fetch completed and stored')
    .setDescription(
      `Stored upstream data for **${resolvedName}** (\`${appId}\`).\n` +
      `Source endpoint: \`${fetchResult.sourceEndpoint}\``
    )
    .addFields(
      {
        name: 'Saved files',
        value: formatSavedFilesList(fetchResult.savedFiles),
        inline: false
      },
      {
        name: 'GitHub storage',
        value: githubUrl
          ? `Uploaded to \`lua_files/\` successfully.\n[Open raw file](${githubUrl})`
          : `Local save successful, but GitHub upload failed.\nReason: ${lastGitHubUploadError || 'Unknown'}`,
        inline: false
      },
      {
        name: 'Use now',
        value: `Run \`/gen appid:${appId}\` to serve this game.`,
        inline: false
      }
    )
    .setFooter({
      text: `Key ${fetchResult.keyIndex}/${fetchResult.keyCount} • Delay ${Math.round(CONFIG.GET_PROCESSING_DELAY_MS / 1000)}s`
    });

  return interaction.editReply({
    embeds: [successEmbed],
    components: []
  });
}

async function handleHelpSlashCommand(interaction) {
  await interaction.deferReply();

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('Hướng dẫn sử dụng bot')
    .setDescription(buildVietnameseUsageGuideText())
    .addFields(
      {
        name: 'Lệnh chính',
        value: [
          '`/gen appid:<id-hoặc-tên-game>` - Lấy file lua/package',
          '`/get appid:<id-hoặc-tên-game>` - Fetch và lưu vào kho',
          '`/help` - Xem hướng dẫn này',
        ].join('\n')
      },
      {
        name: 'Mẹo nhanh',
        value: [
          'Nếu `/gen` chưa có file, dùng `/get` trước rồi `/gen` lại.',
          'Sau mỗi lượt tải, bot sẽ báo số lượt còn lại trong ngày.',
        ].join('\n')
      }
    )
    .setFooter({ text: 'Tin nhắn tự xoá sau 5 phút' })
    .setTimestamp();

  return scheduleInteractionDeletion(interaction, {
    content: null,
    embeds: [embed],
    components: []
  });
}

async function handleMorrenusSlashCommand(interaction) {
  const userId = interaction.user?.id || '';
  const isAllowed = isAdmin(userId) || interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
  if (!isAllowed) {
    return interaction.reply({
      content: `${ICONS.cross} Only admins can use this command.`,
      ephemeral: true
    });
  }

  const action = interaction.options.getString('action', true);
  if (action === 'status') {
    const status = getMorrenusKeyPoolStatus();
    const hasSession = fs.existsSync(path.join(MORRENUS_SESSION_DIR, 'browser-data'))
      || fs.existsSync(path.join(MORRENUS_SESSION_DIR, 'state.json'));
    const lines = [
      `Keys: ${status.totalKeys} total, ${status.availableKeys} available`,
      `Remaining: ${status.totalRemaining}/${status.totalDailyLimit}`,
      `Last generate: ${morrenusLastGenerateResult || 'null'}`,
      `Last status error: ${morrenusLastStatusCheckError ? truncateText(morrenusLastStatusCheckError, 160) : 'none'}`,
      `Session: ${hasSession ? 'OK' : 'missing'}`,
    ];

    status.keys.forEach((key) => {
      lines.push(`- #${key.index} ${key.keyPrefix} remaining=${key.remaining} exhausted=${key.exhausted} last=${key.lastStatusCode || 'n/a'}`);
    });

    return interaction.reply({ content: lines.join('\n'), ephemeral: true });
  }

  if (action === 'regen') {
    await interaction.deferReply({ ephemeral: true });
    const newKey = await morrenusAutoGenerateKey();
    const status = getMorrenusKeyPoolStatus();
    const baseLines = [
      newKey
        ? `${ICONS.check} Generated new key: ${newKey.substring(0, 15)}...`
        : `${ICONS.cross} Auto-generate failed: ${morrenusLastGenerateResult || 'UNKNOWN'}`,
      `Keys: ${status.totalKeys} total, ${status.availableKeys} available`,
      `Remaining: ${status.totalRemaining}/${status.totalDailyLimit}`,
    ];
    return interaction.editReply({ content: baseLines.join('\n') });
  }
}

async function handleGetLegacyCommand(message, rawInput) {
  const input = String(rawInput || '').trim();
  if (!input) {
    const usageMsg = await message.reply(`${ICONS.info} Usage: \`/get appid:<appid-or-name>\``);
    scheduleMessageDeletion(usageMsg);
    return;
  }

  const resolution = await resolveAppIdInput(input);
  if (!resolution.appId) {
    const failMsg = await message.reply(`${ICONS.cross} Could not resolve \`${input}\`. Try exact AppID or use search first.`);
    scheduleMessageDeletion(failMsg);
    return;
  }

  const appId = String(resolution.appId);
  const resolvedName = resolution.resolvedName || getGameNameById(appId) || `App ${appId}`;
  const loadingMsg = await message.reply(
    `${ICONS.info} Queueing upstream fetch for **${resolvedName}** (\`${appId}\`)...\n` +
    `Please wait ${Math.round(CONFIG.GET_PROCESSING_DELAY_MS / 1000)}s.`
  );
  scheduleMessageDeletion(loadingMsg);

  await sleep(CONFIG.GET_PROCESSING_DELAY_MS);

  const fetchResult = await fetchAndStoreManifestFromMorrenus(appId);
  if (!fetchResult.ok) {
    await loadingMsg.edit(`${ICONS.cross} Upstream fetch failed for \`${appId}\`: ${fetchResult.message}`);
    return;
  }

  if (!database.games[appId]) {
    database.games[appId] = {
      name: resolvedName,
      downloads: 0,
      lastAccessed: Date.now(),
    };
  } else if (!database.games[appId].name && resolvedName) {
    database.games[appId].name = resolvedName;
  }
  database.games[appId].lastAccessed = Date.now();
  saveDatabase();

  const primaryPath = fetchResult.primaryFilePath || fetchResult.savedFiles?.[0];
  let githubUrl = null;
  if (primaryPath && fs.existsSync(primaryPath)) {
    githubUrl = await uploadToGitHub(primaryPath, path.basename(primaryPath), 'lua_files');
  }

  const successLines = [
    `${ICONS.check} Stored upstream data for \`${appId}\`.`,
    `Source: \`${fetchResult.sourceEndpoint}\` (key ${fetchResult.keyIndex}/${fetchResult.keyCount})`,
    `Saved: ${fetchResult.savedFiles.map(item => `\`${path.basename(item)}\``).join(', ') || 'none'}`,
    githubUrl ? `GitHub: ${githubUrl}` : 'GitHub upload: failed or skipped',
    `Now use \`/gen appid:${appId}\` to get the file.`
  ];

  await loadingMsg.edit(successLines.join('\n'));
}

async function upsertApplicationCommand(commandManager, commandData) {
  const commands = await commandManager.fetch();
  const sameName = commands.filter(cmd => cmd.name === commandData.name);

  if (sameName.length > 0) {
    // Keep one canonical command, update it, and delete stale duplicates.
    const canonical = sameName[0];
    await canonical.edit(commandData);

    const duplicates = sameName.slice(1);
    for (const duplicate of duplicates) {
      try {
        await duplicate.delete();
      } catch (error) {
        log('WARN', 'Failed to delete duplicate slash command', {
          commandName: duplicate.name,
          commandId: duplicate.id,
          error: error.message
        });
      }
    }

    return duplicates.length > 0 ? 'updated+deduplicated' : 'updated';
  }

  await commandManager.create(commandData);
  return 'created';
}

async function deleteCommandsByName(commandManager, commandName) {
  const commands = await commandManager.fetch();
  const matches = commands.filter(cmd => cmd.name === commandName);

  for (const command of matches) {
    try {
      await command.delete();
    } catch (error) {
      log('WARN', 'Failed to delete slash command', {
        commandName: command.name,
        commandId: command.id,
        error: error.message
      });
    }
  }

  return matches.length;
}

async function registerSlashCommandForGuild(guild) {
  try {
    const results = [];
    for (const commandDef of SLASH_COMMAND_DEFINITIONS) {
      const action = await upsertApplicationCommand(guild.commands, commandDef);
      results.push({ name: commandDef.name, action });
    }

    const commands = await guild.commands.fetch();
    const activeNames = Array.from(commands.values()).map(cmd => cmd.name).join(', ');
    log('INFO', 'Guild slash command set synced', {
      guildId: guild.id,
      guildName: guild.name,
      commandCount: commands.size,
      activeCommands: activeNames,
      updates: results
    });
    return { ok: true, guildId: guild.id };
  } catch (error) {
    log('WARN', 'Failed to register slash command for guild', {
      guildId: guild.id,
      guildName: guild.name,
      error: error.message
    });
    return { ok: false, guildId: guild.id, error: error.message };
  }
}

async function registerSlashCommands() {
  if (!client.application) {
    log('WARN', 'Cannot register slash commands: client.application missing');
    return;
  }

  if (CONFIG.REGISTER_GLOBAL_SLASH_COMMAND) {
    try {
      const globalResults = [];
      for (const commandDef of SLASH_COMMAND_DEFINITIONS) {
        const action = await upsertApplicationCommand(client.application.commands, commandDef);
        globalResults.push({ name: commandDef.name, action });
      }

      const commands = await client.application.commands.fetch();
      log('INFO', 'Global slash commands set synced', {
        commandCount: commands.size,
        updates: globalResults
      });
    } catch (error) {
      log('WARN', 'Failed to register global slash command', { error: error.message });
    }
  } else {
    try {
      await client.application.commands.set([]);
      log('INFO', 'Cleared all global slash commands for this application');
    } catch (error) {
      log('WARN', 'Failed to cleanup global slash commands', { error: error.message });
    }
  }

  let guilds = [];
  let successful = 0;

  if (CONFIG.REGISTER_GUILD_SLASH_COMMAND) {
    guilds = Array.from(client.guilds.cache.values());

    if (CONFIG.DISCORD_GUILD_ID) {
      guilds = guilds.filter(guild => guild.id === CONFIG.DISCORD_GUILD_ID);
      if (guilds.length === 0) {
        log('WARN', 'Configured DISCORD_GUILD_ID not found in bot guild cache', {
          configuredGuildId: CONFIG.DISCORD_GUILD_ID,
          guildCount: client.guilds.cache.size,
        });
      }
    }

    const guildResults = await Promise.all(guilds.map(registerSlashCommandForGuild));
    successful = guildResults.filter(item => item.ok).length;
  }

  log('INFO', 'Slash command registration finished', {
    globalEnabled: CONFIG.REGISTER_GLOBAL_SLASH_COMMAND,
    guildEnabled: CONFIG.REGISTER_GUILD_SLASH_COMMAND,
    guildTotal: guilds.length,
    guildSuccess: successful
  });
}

// ============================================
// MESSAGE HANDLER
// ============================================

client.on('messageCreate', async (message) => {
  if (CONFIG.DEBUG_MESSAGE_LOGGING) {
    try {
      safeConsole('log', `[DEBUG] messageCreate: author=${message.author?.tag || message.author?.id} id=${message.author?.id} channel=${message.channelId} content="${String(message.content).replace(/\n/g, ' ')}"`);
    } catch (e) { /* ignore logging errors */ }
  }

  if (message.author.bot) return;
  if (!message.content.startsWith(CONFIG.COMMAND_PREFIX)) return;

  // ============================================
  // PREVENT DUPLICATE MESSAGE PROCESSING
  // ============================================
  const messageKey = `${message.id}-${message.channelId}`;

  if (MESSAGE_HANDLERS.has(messageKey)) {
    log('WARN', 'Duplicate message detected (ignored)', { messageId: message.id });
    return;
  }

  MESSAGE_HANDLERS.add(messageKey);

  // Auto-cleanup after timeout
  setTimeout(() => {
    MESSAGE_HANDLERS.delete(messageKey);
  }, PROCESS_TIMEOUT);

  const args = message.content.slice(CONFIG.COMMAND_PREFIX.length).trim().split(/ +/);
  const command = args[0].toLowerCase();

  try {
    // Help command
    if (command === 'help') {
      return handleHelpCommand(message);
    }

    // Search command (support alias 'seach')
    if (command === 'search' || command === 'seach') {
      const query = args.slice(1).join(' ');
      if (!query) {
        const errorMsg = await message.reply(`${ICONS.cross} Usage: \`!search <game name>\``);
        scheduleMessageDeletion(errorMsg);
        return;
      }
      return handleSearchCommand(message, query);
    }

    // Request upstream fetch for missing games
    if (command === 'get' || command === 'add') {
      const query = args.slice(1).join(' ');
      return handleGetLegacyCommand(message, query);
    }

    // List command
    if (command === 'list') {
      return handleListCommand(message);
    }

    // Refresh command (available to all users)
    if (command === 'refresh') {
      const appId = args[1];
      if (!appId || !/^\d{4,8}$/.test(appId)) {
        const errorMsg = await message.reply(`${ICONS.cross} Usage: \`!refresh <appid>\``);
        scheduleMessageDeletion(errorMsg);
        return;
      }
      return handleRefreshCommand(message, appId);
    }

    // Admin commands
    if (isAdmin(message.author.id)) {
      if (command === 'stats') {
        return handleStatsCommand(message);
      }

      if (command === 'reload') {
        loadDatabase();
        loadGameInfoCache();
        const reloadMsg = await message.reply(`${ICONS.check} Database and cache reloaded!`);
        scheduleMessageDeletion(reloadMsg);
        return;
      }

      if (command === 'clearcache') {
        return handleClearCacheCommand(message);
      }

      if (command === 'toggleautodelete') {
        return handleToggleAutoDeleteCommand(message);
      }

      if (command === 'collectlua') {
        return handleCollectLuaCommand(message);
      }

      if (command === 'backup') {
        return handleBackupCommand(message);
      }

      if (command === 'fetchlua') {
        return handleFetchLuaCommand(message);
      }
    }

    // Default: treat as AppID
    const appId = command.replace(/\D/g, ''); // Remove non-digits
    if (appId && appId.length >= 1 && /^\d+$/.test(appId)) {
      return handleGameCommand(message, appId);
    }

    // Unknown command
    const unknownMsg = await message.reply(
      `${ICONS.cross} Unknown command! Use \`/help\` for help.`
    );
    scheduleMessageDeletion(unknownMsg);

  } catch (error) {
    log('ERROR', 'Error handling message', {
      command: message.content,
      error: error.message,
      stack: error.stack
    });

    const errorMsg = await message.reply(`${ICONS.cross} An error occurred! Please try again later.`);
    scheduleMessageDeletion(errorMsg);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      if (interaction.commandName === GEN_SLASH_COMMAND.name || interaction.commandName === GET_SLASH_COMMAND.name) {
        await handleGenAutocomplete(interaction);
      }
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === GEN_SLASH_COMMAND.name) {
      await handleGenSlashCommand(interaction);
      return;
    }

    if (interaction.commandName === GET_SLASH_COMMAND.name) {
      await handleGetSlashCommand(interaction);
      return;
    }

    if (interaction.commandName === HELP_SLASH_COMMAND.name) {
      await handleHelpSlashCommand(interaction);
      return;
    }

    if (interaction.commandName === MORRENUS_SLASH_COMMAND.name) {
      await handleMorrenusSlashCommand(interaction);
      return;
    }
  } catch (error) {
    log('ERROR', 'Slash command handler failed', {
      command: interaction.commandName,
      user: interaction.user?.tag,
      error: error.message
    });

    if (interaction.isAutocomplete()) {
      try { await interaction.respond([]); } catch (_) {}
      return;
    }

    const commandLabel = interaction.commandName ? `/${interaction.commandName}` : 'this command';

    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: `${ICONS.cross} Failed to execute ${commandLabel}. Please try again.`,
        ephemeral: true
      }).catch(() => {});
      return;
    }

    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({
        content: `${ICONS.cross} Failed to execute ${commandLabel}. Please try again.`
      }).catch(() => {});
    }
  }
});

// ============================================
// BUTTON HANDLER (Download files)
// ============================================

async function uploadToGitHub(filePath, fileName, targetFolder = 'online-fix') {
  lastGitHubUploadError = null;
  // ============================================
  // VALIDATE GITHUB CREDENTIALS
  // ============================================
  if (!CONFIG.GITHUB_TOKEN || !CONFIG.GITHUB_REPO_OWNER || !CONFIG.GITHUB_REPO_NAME) {
    lastGitHubUploadError = 'Missing GitHub credentials in runtime environment';
    log('ERROR', 'GitHub credentials not configured!', {
      hasToken: !!CONFIG.GITHUB_TOKEN,
      hasOwner: !!CONFIG.GITHUB_REPO_OWNER,
      hasRepo: !!CONFIG.GITHUB_REPO_NAME
    });
    return null;
  }

  // Validate file exists
  if (!fs.existsSync(filePath)) {
    lastGitHubUploadError = `Local file not found: ${filePath}`;
    log('ERROR', 'File not found for upload', { filePath, fileName });
    return null;
  }

  const fileContent = fs.readFileSync(filePath);
  const base64Content = fileContent.toString('base64');
  const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const sanitizedFolder = String(targetFolder || 'online-fix')
    .replace(/\\/g, '/')
    .replace(/[^a-zA-Z0-9/_-]/g, '')
    .replace(/^\/+|\/+$/g, '') || 'online-fix';
  const githubPath = `${sanitizedFolder}/${sanitizedFileName}`;
  const maxAttempts = Math.max(CONFIG.GITHUB_UPLOAD_MAX_RETRIES, 1);

  log('INFO', 'Starting GitHub upload', {
    fileName,
    sanitizedFileName,
    fileSizeBytes: fileContent.length,
    fileSizeMB: (fileContent.length / (1024 * 1024)).toFixed(2),
    repo: `${CONFIG.GITHUB_REPO_OWNER}/${CONFIG.GITHUB_REPO_NAME}`,
    maxAttempts,
    timeoutMs: CONFIG.GITHUB_UPLOAD_TIMEOUT_MS
  });

  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      let sha = null;

      try {
        const checkResponse = await axios.get(
          `https://api.github.com/repos/${CONFIG.GITHUB_REPO_OWNER}/${CONFIG.GITHUB_REPO_NAME}/contents/${githubPath}`,
          {
            headers: {
              Authorization: `token ${CONFIG.GITHUB_TOKEN}`,
              'User-Agent': 'Discord-Lua-Bot/2.0',
              'Accept': 'application/vnd.github.v3+json'
            },
            timeout: CONFIG.GITHUB_UPLOAD_TIMEOUT_MS,
          }
        );
        sha = checkResponse.data.sha;
      } catch (error) {
        if (error.response?.status === 404) {
          // File not found means create new file, which is valid.
        } else if (error.response?.status === 401) {
          lastGitHubUploadError = 'GitHub authentication failed (401): token invalid/expired or no repo access';
          log('ERROR', 'GitHub authentication failed! Token may be invalid or expired', {
            error: error.message,
            hint: 'Check your GITHUB_TOKEN in .env file'
          });
          return null;
        } else {
          throw error;
        }
      }

      const payload = {
        message: `[Bot] Upload ${sanitizedFileName} via Discord`,
        content: base64Content,
        branch: 'main',
      };

      if (sha) {
        payload.sha = sha;
      }

      const response = await axios.put(
        `https://api.github.com/repos/${CONFIG.GITHUB_REPO_OWNER}/${CONFIG.GITHUB_REPO_NAME}/contents/${githubPath}`,
        payload,
        {
          headers: {
            Authorization: `token ${CONFIG.GITHUB_TOKEN}`,
            'User-Agent': 'Discord-Lua-Bot/2.0',
            'Accept': 'application/vnd.github.v3+json',
            'Content-Type': 'application/json',
          },
          timeout: CONFIG.GITHUB_UPLOAD_TIMEOUT_MS,
        }
      );

      if (response.status === 200 || response.status === 201) {
        const downloadUrl = `https://raw.githubusercontent.com/${CONFIG.GITHUB_REPO_OWNER}/${CONFIG.GITHUB_REPO_NAME}/main/${githubPath}`;
        log('SUCCESS', 'Uploaded to GitHub', {
          fileName,
          downloadUrl,
          responseStatus: response.status,
          attempt
        });
        return downloadUrl;
      }

      throw new Error(`Unexpected GitHub status: ${response.status}`);
    } catch (error) {
      lastError = error;
      const isLast = attempt >= maxAttempts;
      log(isLast ? 'ERROR' : 'WARN', 'GitHub upload attempt failed', {
        fileName,
        attempt,
        maxAttempts,
        error: error.message,
        code: error.code,
        status: error.response?.status
      });

      if (!isLast) {
        await sleep(CONFIG.GITHUB_UPLOAD_RETRY_DELAY_MS);
      }
    }
  }

  log('ERROR', 'Failed to upload to GitHub after all retries', {
    fileName,
    attempts: maxAttempts,
    error: lastError?.message,
    code: lastError?.code,
    status: lastError?.response?.status,
    statusText: lastError?.response?.statusText,
    responseData: lastError?.response?.data,
    hint: 'Check GitHub token, repo exists, rate limits, and payload size'
  });

  lastGitHubUploadError = lastError?.response?.data?.message
    || lastError?.message
    || 'Unknown GitHub upload error';

  return null;
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const parts = interaction.customId.split('_');
  const [action, rawType, appId, fileIdx] = parts;
  const allowedUserId = parts[4] || null;
  let type = rawType;
  if (action !== 'dl') return;

  // Only the user who ran the command can download
  if (allowedUserId && interaction.user.id !== allowedUserId) {
    return interaction.reply({
      content: '❌ Chỉ người dùng lệnh mới được tải file này.',
      ephemeral: true
    });
  }

  try {
    const quotaBeforeDownload = await getDailyDownloadQuota(interaction.user.id);
    if (quotaBeforeDownload.enabled && quotaBeforeDownload.remaining <= 0) {
      const resetUnix = getNextDailyResetUnix();
      return interaction.reply({
        content:
          `Daily download limit reached (${quotaBeforeDownload.limit}/${quotaBeforeDownload.limit}).\n` +
          `Try again <t:${resetUnix}:R> (reset at 00:00 ${CONFIG.DAILY_LIMIT_TIMEZONE}).`,
        ephemeral: true
      });
    }

    // Handle Direct Crack Link
    if (type === 'crack') {
      const crackLink = CRACK_LINKS[appId];
      if (!crackLink) {
        return interaction.reply({
          content: '❌ **Link does not exist or has been deleted!**',
          ephemeral: true
        });
      }

      const gameInfo = await getFullGameInfo(appId);
      let requirements = 'Extract and overwrite game folder.';

      if (gameInfo) {
        if (gameInfo.publisher?.isUbisoft || gameInfo.name.toLowerCase().includes('assassin') || gameInfo.name.toLowerCase().includes('ubisoft')) {
          requirements = '🛠️ **Requirement:** Install **Ubisoft Connect** and login with emulator account (if needed).';
        } else if (gameInfo.isEAGame || gameInfo.name.toLowerCase().includes('fifa') || gameInfo.name.toLowerCase().includes('ea sports')) {
          requirements = '🛠️ **Requirement:** Install **EA App** to run the game.';
        } else if (gameInfo.publisher?.isRockstar || gameInfo.publisher?.name?.includes('Rockstar')) {
          requirements = '🛠️ **Requirement:** Install **Rockstar Games Launcher**.';
        }
      }

      // Support multiple crack links - show all in one beautiful embed
      const crackLinks = Array.isArray(crackLink) ? crackLink : [crackLink];

      // GIF for crack button
      const crackGif = "https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExbmllMmp2eWV5ODFoM2N4OXhqd3B6OTVucXA5NW82ZjZpOXJmMWY5ZSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/AHeTfHgVFPHgs/giphy.gif";

      // Get file sizes for all links
      await interaction.deferReply({ ephemeral: true });

      const linksWithSizes = await Promise.all(
        crackLinks.map(async (link, idx) => {
          const fileSize = await getFileSizeFromUrl(link);
          const sizeText = fileSize ? ` \`${formatFileSize(fileSize)}\`` : '';
          return {
            number: idx + 1,
            url: link,
            size: fileSize,
            sizeText: sizeText
          };
        })
      );

      const linksField = linksWithSizes.map(item =>
        `**[🔗 Download Link ${item.number}](${item.url})**${item.sizeText}`
      ).join('\n');

      const totalSize = linksWithSizes.reduce((sum, item) => sum + (item.size || 0), 0);
      const totalSizeText = totalSize > 0 ? `\n\n**📊 Total Size:** \`${formatFileSize(totalSize)}\`` : '';

      // Custom instructions for specific games
      let instructions = '```\n1. Download the crack file(s)\n2. Extract the archive\n3. Copy files to game directory\n4. Overwrite existing files\n5. Run the game\n```';

      // FC 26 Showcase Custom Guide
      if (appId === '3629260') {
        requirements = '🛠️ **Requirement:** EA App installed, clean game files.';
        instructions =
          '**1. Copy files**\n' +
          'Copy all extracted files into the game’s folder.\n' +
          'When prompted, click **Replace the file in the destination** (this may appear multiple times).\n\n' +

          '**2. Replace the executable**\n' +
          'Delete `FC26_Showcase.exe`\n' +
          'Rename `FC26_Showcase fixed.exe` to `FC26_Showcase.exe`\n\n' +

          '**3. Generate the Denuvo token**\n' +
          'Open `EA.Denuvo.Token.Dumper.exe`\n' +
          'Click **Start**\n' +
          '⚠️ **Important:** Make sure "Add DenuvoToken to anadius.cfg even if it exists" is **unchecked**\n\n' +

          '**4. Apply the Denuvo token**\n' +
          'Copy the generated Denuvo token\n' +
          'Open `anadius.cfg` in the game folder\n' +
          'Find `DenuvoToken` (use CTRL + F)\n' +
          'Replace `PASTE_A_VALID_DENUVO_TOKEN_HERE` with your copied token';
      }

      await interaction.editReply({
        embeds: [{
          color: 0xFF0000,
          title: '🔥 CRACK DOWNLOAD',
          description: `**Game:** ${gameInfo?.name || appId}\n\n${crackLinks.length > 1 ? `**${crackLinks.length} download links available:**` : '**Download link:**'}${totalSizeText}`,
          thumbnail: { url: crackGif },
          fields: [
            {
              name: '⬇️ DOWNLOAD LINKS',
              value: linksField || 'No links available',
              inline: false
            },
            {
              name: '🛠️ Installation Requirements',
              value: requirements,
              inline: false
            },
            {
              name: appId === '3629260' ? '📋 Installation Guide' : '📋 Instructions',
              value: instructions,
              inline: false
            },
            {
              name: '⚠️ Security Notice',
              value: '***Links are provided directly. Use at your own risk. Always scan files with antivirus.***',
              inline: false
            }
          ],
          footer: {
            text: `App ID: ${appId} • Auto-deletes in 5 minutes`,
            iconURL: 'https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/clans/3703047/e5b0f06e3b8c705c1e58f5e0a7e8e2e8e5b0f06e.png'
          },
          timestamp: new Date().toISOString()
        }]
      });

      const crackQuota = await registerSuccessfulDownload({
        appId,
        gameName: gameInfo?.name,
        fileType: 'crack-link',
        fileName: `crack-link-${appId}`,
        fileSize: totalSizeText || 'N/A',
        user: interaction.user
      });
      return;
    }

    // Handle Direct Online-Fix Link
    if (type === 'online') {
      const onlineLink = ONLINE_FIX_LINKS[appId];
      if (!onlineLink) {
        return interaction.reply({
          content: '❌ **Link does not exist or has been deleted!**',
          ephemeral: true
        });
      }

      const gameInfo = await getFullGameInfo(appId);

      // GIF for online-fix button
      const onlineFixGif = "https://media1.giphy.com/media/v1.Y2lkPTc5MGI3NjExbml3azA3Ym01NmozNG1odjF0d3RqbWx6cW52anNlbzZucXlwaTlyYiZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9cw/HhOg2ijdiymuoHDb1k/giphy.gif";

      // Get file size from URL
      await interaction.deferReply({ ephemeral: true });

      const fileSize = await getFileSizeFromUrl(onlineLink);
      const sizeText = fileSize ? ` \`${formatFileSize(fileSize)}\`` : '';

      await interaction.editReply({
        embeds: [{
          color: 0x00FF00,
          title: '🌐 ONLINE-FIX DOWNLOAD',
          description: `**Game:** ${gameInfo?.name || appId}\n\n**Download link:**${sizeText ? `\n**📊 File Size:**${sizeText}` : ''}`,
          thumbnail: { url: onlineFixGif },
          fields: [
            {
              name: '⬇️ DOWNLOAD LINK',
              value: `**[🔗 Click Here to Download](${onlineLink})**`,
              inline: false
            },
            {
              name: '📋 Installation Instructions',
              value: '```\n1. Download the Online-Fix file\n2. Extract the archive\n3. Copy all files to game directory\n4. Overwrite existing files\n5. Launch Steam (must be running)\n6. Run the game\n```',
              inline: false
            },
            {
              name: '⚙️ Important Notes',
              value: '• **Steam must be running** to play\n• You can play with friends online\n• No Steam account required\n• Works with cracked games',
              inline: false
            },
            {
              name: '⚠️ Security Notice',
              value: '***Link is provided directly. Use at your own risk. Always scan files with antivirus.***',
              inline: false
            }
          ],
          footer: {
            text: `App ID: ${appId} • Auto-deletes in 5 minutes`,
            iconURL: 'https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/clans/3703047/e5b0f06e3b8c705c1e58f5e0a7e8e2e8e5b0f06e.png'
          },
          timestamp: new Date().toISOString()
        }]
      });

      const onlineQuota = await registerSuccessfulDownload({
        appId,
        gameName: gameInfo?.name,
        fileType: 'online-link',
        fileName: `online-link-${appId}`,
        fileSize: sizeText || 'N/A',
        user: interaction.user
      });
      return;
    }

    // Handle Legacy Online-Fix File (if any)
    if (type === 'onlinefile') {
      // Legacy handling...
      // Re-map type to 'online' for finding file
      type = 'online';
    } else {
       // Proceed with existing logic for other types
    }

    await interaction.deferReply({ ephemeral: true });

    // Get game info to find files by name
    const gameInfo = await getFullGameInfo(appId);
    const files = findFiles(appId, gameInfo?.name);
    let fileToSend = null;

    const idx = parseInt(fileIdx || '0');

    // Determine which file type to send
    if (type === 'lua' && files.lua[idx]) {
      fileToSend = files.lua[idx];
    } else if (type === 'fix' && files.fix[idx]) {
      fileToSend = files.fix[idx];
    } else if (type === 'online' && files.onlineFix[idx]) { // This now only triggers for legacy 'onlinefile' remapped to 'online'
      fileToSend = files.onlineFix[idx];
    }

    if (!fileToSend || !fs.existsSync(fileToSend.path)) {
      if (type === 'lua') {
        const notFoundEmbed = new EmbedBuilder()
          .setColor(0xF1C40F)
          .setTitle(`⚠️ No Lua/Package Available: App ${appId}`)
          .setDescription(
            'Game was found, but Lua/Package files are not available yet.\n' +
            'Use `/get` to request upstream fetch into the bot library.'
          )
          .addFields(
            {
              name: 'Links',
              value: `[Steam Store](https://store.steampowered.com/app/${appId})\n[SteamDB](https://steamdb.info/app/${appId})`,
              inline: false
            },
            {
              name: 'App ID',
              value: `\`${appId}\``,
              inline: false
            },
            {
              name: 'Request fetch',
              value: `\`/get appid:${appId}\``,
              inline: false
            }
          );

        await scheduleInteractionDeletion(interaction, {
          content: `${ICONS.warning} Game found, but this title has no Lua/Package in library.\nUse \`/get appid:${appId}\` to request fetch.`,
          embeds: [notFoundEmbed],
          components: []
        });
        return;
      }

      await scheduleInteractionDeletion(interaction, {
        content: `❌ **File not found!**\n\n` +
                 `⏱️ *This message will auto-delete in 5 minutes*`
      });
      return;
    }

    const selectedManifestMeta = type === 'lua' ? getManifestFileMeta(fileToSend.name) : null;
    const summaryLines = type === 'lua'
      ? buildManifestSummaryLines({
          gameInfo: { name: gameInfo?.name || `App ${appId}` },
          appId,
          files: { lua: [fileToSend] },
          canEmbed: true
        })
      : [];

    let archiveInspection = null;
    if (type === 'lua' && selectedManifestMeta?.kind === 'archive') {
      archiveInspection = await inspectArchiveManifestCount(fileToSend.path);
      if (archiveInspection) {
        if (archiveInspection.manifestCount > 0) {
          summaryLines.push(`📂 Archive contains **${archiveInspection.manifestCount}** \`.manifest\` file(s).`);
        } else {
          summaryLines.push('⚠️ Archive scan found **0** `.manifest` file(s).');
        }
      }
    }

    let fileChecksum = null;
    const checksumLimitBytes = CONFIG.CHECKSUM_MAX_SIZE_MB * 1024 * 1024;
    const shouldComputeChecksum = CONFIG.CHECKSUM_ENABLED
      && Number.isFinite(fileToSend.size)
      && fileToSend.size > 0
      && fileToSend.size <= checksumLimitBytes;

    if (shouldComputeChecksum) {
      fileChecksum = await computeFileChecksum(fileToSend.path, {
        algorithm: 'sha256',
        timeoutMs: 30000,
        log,
      });

      if (fileChecksum && type === 'lua') {
        summaryLines.push(`🔐 SHA-256: \`${fileChecksum}\``);
      }
    }

    const summaryContent = summaryLines.join('\n');
    const sizeMB = fileToSend.size / (1024 * 1024);
    const likelyGitHubContentsLimitIssue =
      type !== 'online' && sizeMB > CONFIG.GITHUB_CONTENTS_SAFE_LIMIT_MB;

    // For Online-Fix files OR large files (>25MB), upload to GitHub
    if (type === 'online' || sizeMB > CONFIG.MAX_FILE_SIZE_MB) {
      await scheduleInteractionDeletion(interaction, {
        content: `⏳ **Processing** \`${fileToSend.name}\`...\n\n` +
                 `✨ Please wait...`
      });

      let downloadUrl = null;
      let deliveryMethod = 'github';

      downloadUrl = await uploadToGitHub(fileToSend.path, fileToSend.name);

      if (!downloadUrl && !CONFIG.DISABLE_DIRECT_DOWNLOAD_FALLBACK) {
        downloadUrl = createTemporaryDownloadLink(fileToSend.path, fileToSend.name);
        if (downloadUrl) {
          deliveryMethod = 'direct';
        }
      }

      if (!downloadUrl) {
        const fallbackHint = CONFIG.DISABLE_DIRECT_DOWNLOAD_FALLBACK
          ? '• Direct fallback is disabled by configuration\n'
          : '• Set PUBLIC_BASE_URL for direct fallback links\n';

        await scheduleInteractionDeletion(interaction, {
          content: `❌ **Failed to process file for download!**\n\n` +
                   `🔧 **Troubleshooting:**\n` +
                   `• Check if GitHub token is configured\n` +
                   `• Check if repository exists and bot has access\n` +
                   `• Upload retries: ${CONFIG.GITHUB_UPLOAD_MAX_RETRIES}, timeout each: ${Math.round(CONFIG.GITHUB_UPLOAD_TIMEOUT_MS / 1000)}s\n` +
                   (likelyGitHubContentsLimitIssue
                     ? `• File may be too large for GitHub Contents API (>${CONFIG.GITHUB_CONTENTS_SAFE_LIMIT_MB} MB after Base64 overhead)\n`
                     : '') +
                   fallbackHint +
                   `• File size: ${fileToSend.sizeFormatted}\n\n` +
                   `⏱️ *This message will auto-delete in 5 minutes*`
        });
        return;
      }

      // Beautiful embed for large files uploaded to GitHub
      const fileTypeName = type === 'online'
        ? 'Online-Fix'
        : type === 'lua'
        ? (selectedManifestMeta?.label || 'Manifest File')
        : 'File';
      const fileTypeGif = type === 'online'
        ? "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaDB1anh5dGRqOThzcWtuMzltcGdrdGtkbWtmNDN4OHp2d3NieW8zbCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/YO7P8VC7nlQlO/giphy.gif"
        : type === 'lua'
        ? "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaDB1anh5dGRqOThzcWtuMzltcGdrdGtkbWtmNDN4OHp2d3NieW8zbCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/EnrH0xdlmT5uBZ9BCe/giphy.gif"
        : null;

      await scheduleInteractionDeletion(interaction, {
        content: type === 'lua' ? summaryContent : null,
        embeds: [{
          color: 0x00ff00,
          title: `✅ ${fileTypeName.toUpperCase()} DOWNLOAD READY!`,
          description: `**Game:** ${gameInfo?.name || appId}\n\n` +
            (deliveryMethod === 'github'
              ? '**✅ File uploaded to GitHub successfully!**'
              : '**✅ Direct download link generated from server!**'),
          thumbnail: fileTypeGif ? { url: fileTypeGif } : undefined,
          fields: [
            {
              name: '📁 File Information',
              value: `**Name:** \`${fileToSend.name}\`\n**Size:** \`${fileToSend.sizeFormatted}\`${fileChecksum ? `\n**SHA-256:** \`${fileChecksum}\`` : ''}`,
              inline: false
            },
            {
              name: '🔗 Download Link',
              value: `**[⬇️ CLICK HERE TO DOWNLOAD](${downloadUrl})**`,
              inline: false
            },
            {
              name: '💡 Download Tips',
              value: deliveryMethod === 'github'
                ? '• Link is stable on GitHub\n• No Discord file size limit\n• Good for repeated downloads'
                : `• Link expires in ${CONFIG.DIRECT_DOWNLOAD_TTL_MINUTES} minutes\n• Works for very large files\n• Re-generate if expired`,
              inline: false
            }
          ],
          footer: {
            text: `App ID: ${appId} • Auto-deletes in 5 minutes • ${deliveryMethod === 'github' ? 'GitHub Link' : 'Direct Link'}`,
            iconURL: 'https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/clans/3703047/e5b0f06e3b8c705c1e58f5e0a7e8e2e8e5b0f06e.png'
          },
          timestamp: new Date().toISOString()
        }]
      });

      const largeFileQuota = await registerSuccessfulDownload({
        appId,
        gameName: gameInfo?.name,
        fileType: type,
        fileName: fileToSend.name,
        fileSize: fileToSend.sizeFormatted,
        user: interaction.user
      });
      return;
    }

    // GIF for manifest button (lua/package)
    const manifestGif = type === 'lua'
      ? "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExaDB1anh5dGRqOThzcWtuMzltcGdrdGtkbWtmNDN4OHp2d3NieW8zbCZlcD12MV9naWZzX3NlYXJjaCZjdD1n/EnrH0xdlmT5uBZ9BCe/giphy.gif"
      : null;

    // Send small files directly via Discord
    const replyContent = {
      files: [{
        attachment: fileToSend.path,
        name: fileToSend.name
      }]
    };

    // Beautiful embed for manifest files
    if (manifestGif && type === 'lua') {
      if (summaryContent) {
        replyContent.content = summaryContent;
      }

      replyContent.embeds = [{
        color: 0x2ECC71,
        title: `${(selectedManifestMeta?.label || 'Manifest File').toUpperCase()} READY`,
        description: `**Game:** ${gameInfo?.name || appId}\n\n**File ready for download.**`,
        thumbnail: { url: manifestGif },
        fields: [
          {
            name: '📁 File Information',
            value: `**Name:** \`${fileToSend.name}\`\n**Size:** \`${fileToSend.sizeFormatted}\`${fileChecksum ? `\n**SHA-256:** \`${fileChecksum}\`` : ''}`,
            inline: false
          },
          {
            name: '📋 Usage Instructions',
            value: selectedManifestMeta?.instruction || '```\n1. Download the file\n2. Place it in your game directory\n3. Launch the game\n```',
            inline: false
          },
          {
            name: '💡 Tips',
            value: selectedManifestMeta?.kind === 'archive'
              ? '- Extract archive fully before use\n- Keep original package as backup\n- Replace files in the correct game folder'
              : '- Lua files are small and load quickly\n- Make sure your Lua loader is compatible\n- Backup original files if needed',
            inline: false
          }
        ],
        footer: {
          text: `App ID: ${appId} • Auto-deletes in 5 minutes`,
          iconURL: 'https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/clans/3703047/e5b0f06e3b8c705c1e58f5e0a7e8e2e8e5b0f06e.png'
        },
        timestamp: new Date().toISOString()
      }];
    } else {
      // Fallback for other file types
      replyContent.content = `✅ **Sending** \`${fileToSend.name}\` (\`${fileToSend.sizeFormatted}\`)\n\n🚀 Download started!`;
    }

    await scheduleInteractionDeletion(interaction, replyContent);

    const directFileQuota = await registerSuccessfulDownload({
      appId,
      gameName: gameInfo?.name,
      fileType: type,
      fileName: fileToSend.name,
      fileSize: fileToSend.sizeFormatted,
      user: interaction.user
    });

  } catch (error) {
    console.error('❌ Button Handler Error:', error);
    log('ERROR', 'Error sending file', {
      appId,
      type,
      error: error.message,
      stack: error.stack
    });

    try {
      if (!interaction.replied) {
        await scheduleInteractionDeletion(interaction, {
          content: `❌ **Error:** \`${error.message}\`\n\n` +
                   `⏱️ *This message will auto-delete in 5 minutes*`
        });
      }
    } catch (e) {
      console.error('❌ Failed to send error message:', e);
    }
  }
});

// ============================================
// BOT READY EVENT
// ============================================

client.once('clientReady', async () => {
  loginState.readyAt = new Date().toISOString();
  loginState.lastError = null;

  console.log('\n' + '='.repeat(70));
  console.log('🚀 DISCORD LUA BOT - ENHANCED VERSION 2.0');
  console.log('   Multi-source data + Auto-delete + Online-Fix Integration');
  console.log('='.repeat(70));
  console.log(`✅ Logged in as: ${client.user.tag}`);
  console.log(`🎮 Bot ID: ${client.user.id}`);
  console.log(`🆔 Discord app ID (configured): ${CONFIG.DISCORD_APP_ID || 'NOT SET'}`);
  console.log(`🏠 Discord guild ID (configured): ${CONFIG.DISCORD_GUILD_ID || 'NOT SET'}`);
  console.log(`🔐 Discord token source: ${loginState.tokenSource}`);
  console.log(`📊 Legacy command prefix: ${enableMessageContentIntent ? CONFIG.COMMAND_PREFIX : `${CONFIG.COMMAND_PREFIX} (disabled in slash-only mode)`}`);
  console.log(`Slash command: /${GEN_SLASH_COMMAND.name} appid:<Steam App ID or game name>`);
  console.log(`Slash command: /${GET_SLASH_COMMAND.name} appid:<Steam App ID or game name>`);
  console.log(`Slash command (admin): /${MORRENUS_SLASH_COMMAND.name} action:<status|regen>`);
  console.log(`📝 Message Content Intent: ${enableMessageContentIntent ? 'ENABLED' : 'DISABLED (slash-only mode)'}`);
  const allGames = scanAllGames();
  console.log(`🎯 Total available games: ${global.gameStats?.uniqueGames || allGames.length} (${global.gameStats?.totalFiles || 'N/A'} files)`);
  console.log(`💾 Cached game info: ${Object.keys(gameInfoCache).length} games`);
  console.log(`🔄 Auto-delete: ${CONFIG.ENABLE_AUTO_DELETE ? 'ENABLED (5 min)' : 'DISABLED'}`);
  console.log(`🧱 Daily download limit: ${CONFIG.ENABLE_DAILY_DOWNLOAD_LIMIT ? `${CONFIG.MAX_DAILY_DOWNLOADS_PER_USER}/user/day (${CONFIG.DAILY_LIMIT_TIMEZONE} reset)` : 'DISABLED'}`);
  console.log(`🗃️ Quota storage: ${isUpstashQuotaEnabled() ? 'Upstash Redis' : 'Local JSON database'}`);
  console.log(`🌐 Discord REST precheck: ${CONFIG.DISCORD_REST_PRECHECK_ENABLED ? 'ENABLED' : 'DISABLED'}`);
  console.log(`🌍 Public base URL: ${CONFIG.PUBLIC_BASE_URL || 'NOT SET (direct large-file links disabled)'}`);
  console.log(`🔗 Direct download TTL: ${CONFIG.DIRECT_DOWNLOAD_TTL_MINUTES} minutes`);
  console.log(`📁 Folders:`);
  console.log(`   - Lua files: ${CONFIG.LUA_FILES_PATH}`);
  console.log(`   - Fix files: ${CONFIG.FIX_FILES_PATH}`);
  console.log(`   - Online-Fix: ${CONFIG.ONLINE_FIX_PATH}`);
  console.log('='.repeat(70) + '\n');

  try {
    if (CONFIG.DISCORD_APP_ID && CONFIG.DISCORD_APP_ID !== client.user.id) {
      log('WARN', 'Configured DISCORD_APP_ID does not match logged-in bot ID', {
        configuredAppId: CONFIG.DISCORD_APP_ID,
        loggedInBotId: client.user.id,
      });
    }

    await registerSlashCommands();
  } catch (error) {
    log('WARN', 'Slash command registration failed on ready', { error: error.message });
  }

  // Set bot presence
  client.user.setPresence({
    activities: [{
      name: `/gen | /get appid:<id-or-name>`,
      type: ActivityType.Watching
    }],
    status: 'online',
  });

  log('INFO', 'Bot started successfully', {
    uniqueGames: global.gameStats?.uniqueGames || 0,
    totalFiles: global.gameStats?.totalFiles || 0,
    cachedGames: Object.keys(gameInfoCache).length,
    autoDelete: CONFIG.ENABLE_AUTO_DELETE
  });
});

client.on('guildCreate', async (guild) => {
  if (CONFIG.REGISTER_GUILD_SLASH_COMMAND) {
    if (CONFIG.DISCORD_GUILD_ID && guild.id !== CONFIG.DISCORD_GUILD_ID) {
      return;
    }
    await registerSlashCommandForGuild(guild);
  }
});

// ============================================
// ERROR HANDLERS
// ============================================

client.on('error', error => {
  console.error('❌ Discord client error:', error);
  log('ERROR', 'Discord client error', {
    error: error.message,
    stack: error.stack
  });
});

client.on('warn', warning => {
  console.warn('⚠️ Discord client warning:', warning);
  log('WARN', 'Discord client warning', { warning });
});

client.on('shardReady', (id) => {
  log('INFO', 'Discord shard ready', { shardId: id });
});

client.on('shardError', (error, shardId) => {
  const message = error?.message || String(error);
  loginState.lastError = `Shard ${shardId ?? 'unknown'} error: ${message}`;
  log('ERROR', 'Discord shard error', {
    shardId,
    error: message
  });
});

client.on('shardDisconnect', (event, shardId) => {
  const code = event?.code;
  const reason = event?.reason;
  loginState.lastError = `Shard ${shardId ?? 'unknown'} disconnected (code ${code ?? 'N/A'})`;
  log('WARN', 'Discord shard disconnected', {
    shardId,
    code,
    reason
  });
});

client.on('shardReconnecting', (shardId) => {
  log('WARN', 'Discord shard reconnecting', { shardId });
});

process.on('unhandledRejection', error => {
  if (isBrokenPipeError(error)) return;
  safeConsole('error', 'Unhandled promise rejection:', error);
  log('ERROR', 'Unhandled rejection', {
    error: error?.message || String(error),
    stack: error?.stack
  });
});

process.on('uncaughtException', error => {
  if (isBrokenPipeError(error)) return;
  safeConsole('error', 'Uncaught exception:', error);
  log('ERROR', 'Uncaught exception', {
    error: error?.message || String(error),
    stack: error?.stack
  });
});

process.on('SIGINT', () => {
  console.log('\n\n🛑 Gracefully shutting down bot...');
  console.log('💾 Saving database and cache...');

  saveDatabase();
  saveGameInfoCache();

  console.log('✅ Data saved successfully!');
  console.log('👋 Goodbye!\n');

  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Received SIGTERM, shutting down...');
  saveDatabase();
  saveGameInfoCache();
  client.destroy();
  process.exit(0);
});

// ============================================
// START BOT
// ============================================

console.log('🚀 Starting Discord Lua Bot - Enhanced v2.0...\n');
console.log('📂 Initializing folders...');
initializeFolders();

console.log('💾 Loading database...');
loadDatabase();

console.log('🗄️ Loading game info cache...');
loadGameInfoCache();

console.log('🔐 Logging in to Discord...\n');

function getLoginRetryDelayMs(retries) {
  return Math.min(
    60000 * Math.pow(2, Math.min(retries, 4)),
    CONFIG.DISCORD_LOGIN_RETRY_MAX_DELAY_MS
  );
}

function scheduleLoginRetry(nextRetries, reason, delayOverrideMs = null) {
  if (loginRetryTimer) {
    clearTimeout(loginRetryTimer);
    loginRetryTimer = null;
  }

  const delay = Number.isFinite(delayOverrideMs) && delayOverrideMs > 0
    ? delayOverrideMs
    : getLoginRetryDelayMs(nextRetries);
  loginState.nextRetryAt = new Date(Date.now() + delay).toISOString();
  console.log(
    `⏳ Retrying Discord login in ${Math.round(delay / 1000)}s (attempt ${nextRetries + 1})` +
    (reason ? ` - ${reason}` : '')
  );

  loginRetryTimer = setTimeout(() => {
    loginRetryTimer = null;
    loginState.nextRetryAt = null;
    attemptLogin(nextRetries);
  }, delay);
}

async function checkDiscordRestReachability() {
  const startedAt = Date.now();
  const response = await axios.get('https://discord.com/api/v10/gateway', {
    timeout: CONFIG.DISCORD_REST_CHECK_TIMEOUT_MS,
    headers: {
      'User-Agent': 'LuatoolBot/2.0'
    },
    validateStatus: () => true
  });

  loginState.lastRestCheckAt = new Date().toISOString();

  if (response.status >= 200 && response.status < 300) {
    loginState.lastGatewayUrl = response.data?.url || null;
    return {
      latencyMs: Date.now() - startedAt,
      gatewayUrl: loginState.lastGatewayUrl
    };
  }

  if (response.status === 429) {
    const retryHeaderSeconds = Number.parseFloat(response.headers?.['retry-after']);
    const retryBodySeconds = Number.parseFloat(response.data?.retry_after);
    const retrySeconds = Number.isFinite(retryHeaderSeconds)
      ? retryHeaderSeconds
      : (Number.isFinite(retryBodySeconds) ? retryBodySeconds : 60);

    const rateLimitError = new Error(`Discord REST rate limited (429). retry_after=${retrySeconds}s`);
    rateLimitError.code = 'DISCORD_RATE_LIMIT';
    rateLimitError.retryAfterMs = Math.max(Math.ceil(retrySeconds * 1000), 1000);
    throw rateLimitError;
  }

  throw new Error(`Discord REST check failed with status ${response.status}`);
}

function createLoginTimeoutPromise() {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(`Discord login timed out after ${CONFIG.DISCORD_LOGIN_TIMEOUT_MS}ms`));
    }, CONFIG.DISCORD_LOGIN_TIMEOUT_MS);
  });
}

// Start Discord login with retries, but DO NOT exit process on failure.
async function attemptLogin(retries = 0) {
  if (loginState.inProgress) return;

  loginState.inProgress = true;
  loginState.attempts = retries + 1;
  loginState.lastAttemptAt = new Date().toISOString();

  if (!CONFIG.BOT_TOKEN) {
    const errorMessage = 'Missing Discord token. Set BOT_TOKEN (preferred) or DISCORD_TOKEN in environment variables.';
    loginState.lastError = errorMessage;
    console.error('\n❌ FAILED TO LOGIN TO DISCORD! (missing token)\n');
    console.error(errorMessage);
    loginState.inProgress = false;
    scheduleLoginRetry(retries + 1, 'missing token');
    return;
  }

  if (CONFIG.DISCORD_REST_PRECHECK_ENABLED) {
    try {
      const rest = await checkDiscordRestReachability();
      console.log(`🌐 Discord gateway reachable (${rest.latencyMs}ms)`);
    } catch (error) {
      if (error?.code === 'DISCORD_RATE_LIMIT') {
        loginState.lastError = `Discord REST precheck rate limited: ${error.message}`;
        console.error('\n⚠️ Discord REST precheck rate limited. Backing off before next login attempt.\n');
        console.error('Error:', error.message);
        loginState.inProgress = false;
        scheduleLoginRetry(retries + 1, 'discord rest rate limited', (error.retryAfterMs || 60000) + 5000);
        return;
      } else {
        loginState.lastError = `Discord REST precheck failed: ${error.message}`;
        console.error('\n⚠️ Discord REST precheck failed. Continuing with direct Discord login attempt.\n');
        console.error('Error:', error.message);
      }
    }
  }

  try {
    await Promise.race([
      client.login(CONFIG.BOT_TOKEN),
      createLoginTimeoutPromise()
    ]);
    loginState.lastError = null;
    console.log('\n✅ Discord login successful');
  } catch (error) {
    loginState.lastError = error.message;
    console.error('\n❌ FAILED TO LOGIN TO DISCORD! (will retry)\n');
    console.error('Error:', error.message);
    if (retries === 0) {
      console.error('\n💡 Troubleshooting tips:');
      console.error('   1. Check if BOT_TOKEN exists in .env file');
      console.error('   2. Verify the token is correct');
      console.error('   3. Make sure bot has proper permissions');
      console.error('   4. Check if bot is banned from the server\n');
    }
    try {
      client.destroy();
    } catch (_) {}
    loginState.inProgress = false;
    scheduleLoginRetry(retries + 1, 'discord login failed');
    return;
  }

  loginState.inProgress = false;
}

attemptLogin();

// ============================================
// HEALTH CHECK SERVER (for hosting services)
// ============================================

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    uptimeFormatted: formatUptime(process.uptime()),
    bot: {
      username: client.user?.tag || 'Not logged in',
      id: client.user?.id || 'N/A',
      status: client.user ? 'online' : 'offline',
      tokenConfigured: loginState.tokenConfigured,
      tokenSource: loginState.tokenSource,
      loginAttempts: loginState.attempts,
      lastLoginAttemptAt: loginState.lastAttemptAt,
      readyAt: loginState.readyAt,
      lastLoginError: loginState.lastError,
      loginInProgress: loginState.inProgress,
      nextRetryAt: loginState.nextRetryAt,
      lastRestCheckAt: loginState.lastRestCheckAt,
      gatewayUrl: loginState.lastGatewayUrl
    },
    stats: {
      totalGames: Object.keys(database.games).length,
      cachedGames: Object.keys(gameInfoCache).length,
      totalDownloads: database.stats.totalDownloads,
      totalSearches: database.stats.totalSearches,
    },
    morrenus: getMorrenusKeyPoolStatus(),
    config: {
      autoDelete: CONFIG.ENABLE_AUTO_DELETE,
      autoDeleteTimeout: CONFIG.AUTO_DELETE_TIMEOUT / 1000 + 's',
      cacheTimeout: CONFIG.CACHE_DURATION / 1000 / 60 + ' minutes'
    },
    timestamp: new Date().toISOString(),
    year: new Date().getFullYear(),
  });
});

app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// ============================================
// MORRENUS KEY STATUS ENDPOINT
// ============================================
app.get('/morrenus-status', (req, res) => {
  const status = getMorrenusKeyPoolStatus();
  res.status(200).json({
    ...status,
    autoRegen: {
      enabled: MORRENUS_AUTO_REGEN_ON_LIMIT || MORRENUS_AUTO_REGEN_ON_EXPIRY,
      onLimit: MORRENUS_AUTO_REGEN_ON_LIMIT,
      onExpiry: MORRENUS_AUTO_REGEN_ON_EXPIRY,
      expiryThresholdHours: MORRENUS_AUTO_REGEN_EXPIRY_HOURS,
      limitThreshold: MORRENUS_AUTO_REGEN_LIMIT_THRESHOLD,
      checkIntervalMs: MORRENUS_AUTO_REGEN_CHECK_INTERVAL_MS,
      lastCheckAt: morrenusLastRegenCheck ? new Date(morrenusLastRegenCheck).toISOString() : null,
    generateInProgress: morrenusAutoGenerateInProgress,
    lastGenerateAttempt: morrenusLastAutoGenerateAttempt ? new Date(morrenusLastAutoGenerateAttempt).toISOString() : null,
    lastGenerateResult: morrenusLastGenerateResult,
    lastStatusCheckError: morrenusLastStatusCheckError,
      hasPlaywrightSession: fs.existsSync(path.join(MORRENUS_SESSION_DIR, 'browser-data')) || fs.existsSync(path.join(MORRENUS_SESSION_DIR, 'state.json')),
      keyExpiry: morrenusKeyExpiry ? morrenusKeyExpiry.toISOString() : null,
    },
    timestamp: new Date().toISOString(),
    tip: status.availableKeys === 0
      ? 'All keys exhausted. Auto-regen will trigger if Playwright session is available.'
      : `${status.totalRemaining} requests remaining across ${status.availableKeys} active key(s).`,
  });
});

// ============================================
// MORRENUS KEY HOT-UPDATE ENDPOINT
// ============================================
// POST /update-morrenus-key - Cập nhật key mới mà không cần restart bot
// Body: { "key": "smm_..." } hoặc { "key": "smm_...", "admin_token": "..." }
app.post('/update-morrenus-key', express.json(), (req, res) => {
  // Auth check
  const token = req.headers['x-admin-token'] || req.body?.admin_token;
  if (token !== CONFIG.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Invalid admin token. Send X-Admin-Token header or admin_token in body.' });
  }

  const newKey = String(req.body?.key || '').trim();
  if (!newKey || !newKey.startsWith('smm_')) {
    return res.status(400).json({ error: 'Invalid key. Must start with smm_' });
  }

  const pool = getMorrenusApiKeyPool();
  if (pool.includes(newKey)) {
    return res.status(200).json({ message: 'Key already in pool.', totalKeys: pool.length });
  }

  // Add to pool
  CONFIG.MORRENUS_API_KEY = newKey;
  const existing = String(CONFIG.MORRENUS_API_KEYS || '').split(',').map(k => k.trim()).filter(Boolean);
  existing.push(newKey);
  CONFIG.MORRENUS_API_KEYS = existing.join(',');
  morrenusKeyState.delete(newKey); // Reset state
  morrenusDisabledKeys.delete(newKey);

  // Save to hot-reload file
  try {
    fs.writeFileSync(path.join(__dirname, '..', '.morrenus_active_key'), newKey);
  } catch (_) {}

  const newStatus = getMorrenusKeyPoolStatus();
  console.log(`[Morrenus] 🔑 Key hot-updated via API: ${newKey.substring(0, 15)}...`);
  res.status(200).json({
    message: 'Key added successfully!',
    totalKeys: newStatus.totalKeys,
    availableKeys: newStatus.availableKeys,
    totalRemaining: newStatus.totalRemaining,
  });
});

// POST /update-morrenus-session - update Playwright session state (base64)
// Body: { "stateB64": "..." } or { "state_b64": "...", "admin_token": "..." }
app.post('/update-morrenus-session', express.json({ limit: '3mb' }), (req, res) => {
  const token = req.headers['x-admin-token'] || req.body?.admin_token;
  if (token !== CONFIG.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Invalid admin token. Send X-Admin-Token header or admin_token in body.' });
  }

  const stateB64 = String(req.body?.stateB64 || req.body?.state_b64 || '').trim();
  if (!stateB64) {
    return res.status(400).json({ error: 'Missing stateB64.' });
  }

  let decoded;
  try {
    decoded = Buffer.from(stateB64, 'base64').toString('utf8');
  } catch (error) {
    return res.status(400).json({ error: `Invalid base64: ${error.message}` });
  }

  if (!decoded.trim().startsWith('{')) {
    return res.status(400).json({ error: 'Session JSON invalid (must start with "{").' });
  }

  try {
    const sessionFile = path.join(MORRENUS_SESSION_DIR, 'state.json');
    const dir = path.dirname(sessionFile);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(sessionFile, decoded);
    morrenusLastStatusCheckError = null;
    console.log('[Morrenus] ✅ Session updated via API.');
    return res.status(200).json({ message: 'Session updated', path: sessionFile });
  } catch (error) {
    return res.status(500).json({ error: `Failed to write session: ${error.message}` });
  }
});

// POST /trigger-morrenus-generate - Trigger auto-generate key mới (cần Playwright session)
app.post('/trigger-morrenus-generate', async (req, res) => {
  const token = req.headers['x-admin-token'] || req.body?.admin_token;
  if (token !== CONFIG.ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Invalid admin token.' });
  }

  if (morrenusAutoGenerateInProgress) {
    return res.status(429).json({ error: 'Auto-generate already in progress.' });
  }

  res.status(202).json({ message: 'Auto-generate triggered. Check /morrenus-status for result.' });

  // Run in background
  const newKey = await morrenusAutoGenerateKey();
  if (newKey) {
    console.log(`[Morrenus] ✅ Auto-generated key via API trigger: ${newKey.substring(0, 15)}...`);
  }
});

app.get('/download/:token', (req, res) => {
  const { token } = req.params;
  const entry = temporaryDownloads.get(token);

  if (!entry) {
    return res.status(404).json({ error: 'Download link not found or expired.' });
  }

  if (entry.expiresAt <= Date.now()) {
    temporaryDownloads.delete(token);
    return res.status(410).json({ error: 'Download link expired.' });
  }

  if (!fs.existsSync(entry.filePath)) {
    temporaryDownloads.delete(token);
    return res.status(410).json({ error: 'File no longer available on server.' });
  }

  res.setHeader('Cache-Control', 'private, max-age=60');
  res.setHeader('X-Link-Expires-At', new Date(entry.expiresAt).toISOString());
  res.download(entry.filePath, entry.fileName, (error) => {
    if (error && !res.headersSent) {
      return res.status(500).json({ error: 'Failed to stream file.' });
    }
  });
});

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Discord Lua Bot v2.0</title>
      <style>
        body {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
        }
        .container {
          text-align: center;
          padding: 40px;
          background: rgba(0,0,0,0.3);
          border-radius: 20px;
          backdrop-filter: blur(10px);
        }
        h1 { font-size: 3em; margin: 0; }
        p { font-size: 1.2em; opacity: 0.9; }
        .status {
          display: inline-block;
          padding: 10px 20px;
          background: #00ff00;
          color: #000;
          border-radius: 20px;
          font-weight: bold;
          margin-top: 20px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>🎮 Discord Lua Bot v2.0</h1>
        <p>Enhanced with Auto-Delete & Online-Fix</p>
        <div class="status">✅ Bot is running!</div>
        <p style="margin-top: 30px; opacity: 0.7;">
          © ${new Date().getFullYear()} • Uptime: ${formatUptime(process.uptime())}
        </p>
      </div>
    </body>
    </html>
  `);
});

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);

  return parts.join(' ');
}

const START_PORT = process.env.PORT || 3000;
const START_HOST = process.env.HOST || '0.0.0.0';

function startServer(port) {
  const server = app.listen(port, START_HOST, () => {
    console.log(`✅ Health check server running on ${START_HOST}:${port}`);
    console.log(`🌐 Local access: http://localhost:${port}`);
    console.log(`📊 Health endpoint: /health`);
    console.log(`🔑 Morrenus status: /morrenus-status\n`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Required port ${port} already in use. On Render we must bind to PORT; exiting so the service can restart.`);
    } else {
      console.error('❌ Server error:', error);
    }
    // Exit to let the platform restart the process on the correct PORT
    process.exit(1);
  });
}

// Explicit HEAD handler so uptime monitors receive a fast 200 even when using HEAD
app.head('/health', (req, res) => {
  res.status(200).end();
});

app.head('/healthz', (req, res) => {
  res.status(200).end();
});

// ============================================
// DIAGNOSTIC ENDPOINT – Deep network checks
// ============================================
app.get('/diagnostic', async (req, res) => {
  const results = {
    timestamp: new Date().toISOString(),
    runtime: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: formatUptime(process.uptime()),
      env: process.env.RENDER ? 'Render' : (process.env.RAILWAY_ENVIRONMENT ? 'Railway' : 'unknown'),
      region: process.env.RENDER_REGION || process.env.RAILWAY_REGION || 'N/A',
    },
    config: {
      DISCORD_REST_PRECHECK_ENABLED: CONFIG.DISCORD_REST_PRECHECK_ENABLED,
      DISCORD_FORCE_IPV4: CONFIG.DISCORD_FORCE_IPV4,
      DISCORD_LOGIN_TIMEOUT_MS: CONFIG.DISCORD_LOGIN_TIMEOUT_MS,
      tokenConfigured: Boolean(CONFIG.BOT_TOKEN),
      tokenSource: DISCORD_TOKEN_SOURCE,
    },
    loginState: { ...loginState },
    tests: {},
  };

  // 1. Outbound IP check
  try {
    const ipRes = await axios.get('https://api.ipify.org?format=json', { timeout: 8000 });
    results.tests.outboundIP = { status: 'ok', ip: ipRes.data?.ip };
  } catch (err) {
    results.tests.outboundIP = { status: 'error', error: err.message };
  }

  // 2. DNS resolution for discord.com & gateway.discord.gg
  const dnsResolve = promisify(dns.resolve4);
  for (const host of ['discord.com', 'gateway.discord.gg']) {
    try {
      const addresses = await dnsResolve(host);
      results.tests[`dns_${host.replace(/\./g, '_')}`] = { status: 'ok', addresses };
    } catch (err) {
      results.tests[`dns_${host.replace(/\./g, '_')}`] = { status: 'error', error: err.message };
    }
  }

  // 3. Discord REST /gateway (unauthenticated – just connectivity)
  try {
    const t0 = Date.now();
    const restRes = await axios.get('https://discord.com/api/v10/gateway', {
      timeout: 10000,
      headers: { 'User-Agent': 'LuatoolBot/2.0' },
      validateStatus: () => true,
    });
    const latency = Date.now() - t0;
    results.tests.discordRestGateway = {
      status: restRes.status < 300 ? 'ok' : 'blocked',
      httpStatus: restRes.status,
      latencyMs: latency,
      body: restRes.status === 429
        ? { retryAfter: restRes.data?.retry_after, message: restRes.data?.message }
        : restRes.data,
    };
  } catch (err) {
    results.tests.discordRestGateway = { status: 'error', error: err.message };
  }

  // 4. Discord REST /gateway/bot (authenticated – checks token & rate limit)
  if (CONFIG.BOT_TOKEN) {
    try {
      const t0 = Date.now();
      const botRes = await axios.get('https://discord.com/api/v10/gateway/bot', {
        timeout: 10000,
        headers: {
          Authorization: `Bot ${CONFIG.BOT_TOKEN}`,
          'User-Agent': 'LuatoolBot/2.0',
        },
        validateStatus: () => true,
      });
      const latency = Date.now() - t0;
      results.tests.discordRestGatewayBot = {
        status: botRes.status < 300 ? 'ok' : (botRes.status === 429 ? 'rate_limited' : 'error'),
        httpStatus: botRes.status,
        latencyMs: latency,
        body: botRes.status === 429
          ? { retryAfter: botRes.data?.retry_after, global: botRes.data?.global }
          : (botRes.status < 300
            ? { url: botRes.data?.url, shards: botRes.data?.shards, sessionStartLimit: botRes.data?.session_start_limit }
            : { message: botRes.data?.message, code: botRes.data?.code }),
      };
    } catch (err) {
      results.tests.discordRestGatewayBot = { status: 'error', error: err.message };
    }
  }

  // 5. Raw TCP connection test to Discord Gateway (port 443)
  try {
    const net = require('net');
    const tcpResult = await new Promise((resolve) => {
      const t0 = Date.now();
      const socket = new net.Socket();
      socket.setTimeout(8000);
      socket.connect(443, 'gateway.discord.gg', () => {
        const latency = Date.now() - t0;
        socket.destroy();
        resolve({ status: 'ok', latencyMs: latency });
      });
      socket.on('error', (err) => {
        socket.destroy();
        resolve({ status: 'error', error: err.message });
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve({ status: 'timeout', error: 'TCP handshake timed out (8s)' });
      });
    });
    results.tests.tcpGateway = tcpResult;
  } catch (err) {
    results.tests.tcpGateway = { status: 'error', error: err.message };
  }

  // 6. WebSocket upgrade test (TLS + WS handshake to Discord Gateway)
  try {
    const https = require('https');
    const wsResult = await new Promise((resolve) => {
      const t0 = Date.now();
      const reqWs = https.request({
        hostname: 'gateway.discord.gg',
        port: 443,
        path: '/?v=10&encoding=json',
        method: 'GET',
        headers: {
          'Connection': 'Upgrade',
          'Upgrade': 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'),
          'User-Agent': 'LuatoolBot/2.0',
        },
        timeout: 10000,
      }, (response) => {
        const latency = Date.now() - t0;
        response.destroy();
        reqWs.destroy();
        if (response.statusCode === 101) {
          resolve({ status: 'ok', latencyMs: latency, wsUpgrade: true });
        } else {
          resolve({
            status: 'blocked',
            httpStatus: response.statusCode,
            latencyMs: latency,
            wsUpgrade: false,
          });
        }
      });
      reqWs.on('upgrade', (response) => {
        const latency = Date.now() - t0;
        response.destroy();
        reqWs.destroy();
        resolve({ status: 'ok', latencyMs: latency, wsUpgrade: true });
      });
      reqWs.on('error', (err) => {
        reqWs.destroy();
        resolve({ status: 'error', error: err.message });
      });
      reqWs.on('timeout', () => {
        reqWs.destroy();
        resolve({ status: 'timeout', error: 'WebSocket handshake timed out (10s)' });
      });
      reqWs.end();
    });
    results.tests.websocketGateway = wsResult;
  } catch (err) {
    results.tests.websocketGateway = { status: 'error', error: err.message };
  }

  // Summary: determine root cause
  const blockers = [];
  if (results.tests.outboundIP?.status !== 'ok') {
    blockers.push('Cannot determine outbound IP – general network issue.');
  }
  for (const host of ['dns_discord_com', 'dns_gateway_discord_gg']) {
    if (results.tests[host]?.status !== 'ok') {
      blockers.push(`DNS resolution failed for ${host.replace('dns_', '').replace(/_/g, '.')}.`);
    }
  }
  if (results.tests.discordRestGateway?.httpStatus === 429) {
    const ra = results.tests.discordRestGateway.body?.retryAfter;
    blockers.push(`Discord REST rate limited (429). Retry after ${ra}s. This means Render's shared IP is throttled by Discord.`);
  } else if (results.tests.discordRestGateway?.status !== 'ok') {
    blockers.push(`Discord REST /gateway unreachable: ${results.tests.discordRestGateway?.error || results.tests.discordRestGateway?.httpStatus}`);
  }
  if (results.tests.discordRestGatewayBot?.httpStatus === 429) {
    const ra = results.tests.discordRestGatewayBot.body?.retryAfter;
    blockers.push(`Authenticated /gateway/bot rate limited (429). Retry after ${ra}s.`);
  } else if (results.tests.discordRestGatewayBot?.httpStatus === 401) {
    blockers.push('Bot token is INVALID (401 Unauthorized). Regenerate on Discord Developer Portal.');
  }
  if (results.tests.tcpGateway?.status !== 'ok') {
    blockers.push(`TCP connection to gateway.discord.gg:443 failed: ${results.tests.tcpGateway?.error || results.tests.tcpGateway?.status}`);
  }
  if (results.tests.websocketGateway?.status !== 'ok') {
    blockers.push(`WebSocket upgrade to Discord Gateway failed: ${results.tests.websocketGateway?.error || results.tests.websocketGateway?.status}`);
  }

  results.diagnosis = {
    blockerCount: blockers.length,
    blockers,
    recommendation: blockers.length === 0
      ? 'All network tests passed. Try restarting the service.'
      : blockers.some(b => b.includes('rate limited') || b.includes('429'))
        ? 'Render shared IP is rate-limited by Discord. Create a new Render service in a different region or use a dedicated IP.'
        : blockers.some(b => b.includes('INVALID') || b.includes('401'))
          ? 'Bot token is invalid. Regenerate at https://discord.com/developers/applications'
          : 'Network connectivity issue. Check Render logs and outbound firewall rules.',
  };

  res.status(200).json(results);
});

startServer(START_PORT);


