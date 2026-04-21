const path = require('path');

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function getGameTitleStatusIcon(hasManifest) {
  return hasManifest
    ? (process.env.GAME_TITLE_ICON_OK || '<a:blackverified:1471752403421237360>')
    : (process.env.GAME_TITLE_ICON_MISSING || '<:xicon:1471753191564640437>');
}

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const DATA_ROOT = process.env.BOT_DATA_DIR
  || process.env.RENDER_DISK_MOUNT_PATH
  || PROJECT_ROOT;

const RESOLVED_DISCORD_TOKEN = String(process.env.BOT_TOKEN || process.env.DISCORD_TOKEN || '').trim();
const DISCORD_TOKEN_SOURCE = process.env.BOT_TOKEN
  ? 'BOT_TOKEN'
  : (process.env.DISCORD_TOKEN ? 'DISCORD_TOKEN' : 'NONE');

const CONFIG = {
  BOT_TOKEN: RESOLVED_DISCORD_TOKEN,
  DISCORD_APP_ID: String(process.env.DISCORD_APP_ID || '').trim(),
  DISCORD_GUILD_ID: String(process.env.DISCORD_GUILD_ID || '').trim(),
  STEAM_API_KEY: process.env.STEAM_API_KEY,
  STEAMGRIDDB_API_KEY: process.env.STEAMGRIDDB_API_KEY,
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  GITHUB_REPO_OWNER: process.env.GITHUB_REPO_OWNER,
  GITHUB_REPO_NAME: process.env.GITHUB_REPO_NAME,
  COMMAND_PREFIX: '!',

  LUA_FILES_PATH: path.join(PROJECT_ROOT, 'lua_files'),
  FIX_FILES_PATH: path.join(PROJECT_ROOT, 'fix_files'),
  ONLINE_FIX_PATH: path.join(PROJECT_ROOT, 'online_fix'),
  LOGS_PATH: path.join(PROJECT_ROOT, 'logs'),
  DATABASE_PATH: path.join(DATA_ROOT, 'database.json'),
  DATABASE_BACKUP_PATH: path.join(DATA_ROOT, 'database.backup.json'),
  GAME_INFO_CACHE_PATH: path.join(DATA_ROOT, 'game_info_cache.json'),

  ADMIN_USER_IDS: ['898595655562432584'],
  MAX_FILE_SIZE_MB: 25,
  GITHUB_CONTENTS_SAFE_LIMIT_MB: parsePositiveInt(process.env.GITHUB_CONTENTS_SAFE_LIMIT_MB, 70),
  GITHUB_UPLOAD_TIMEOUT_MS: parsePositiveInt(process.env.GITHUB_UPLOAD_TIMEOUT_MS, 120000),
  GITHUB_UPLOAD_MAX_RETRIES: parsePositiveInt(process.env.GITHUB_UPLOAD_MAX_RETRIES, 6),
  GITHUB_UPLOAD_RETRY_DELAY_MS: parsePositiveInt(process.env.GITHUB_UPLOAD_RETRY_DELAY_MS, 4000),
  DISABLE_DIRECT_DOWNLOAD_FALLBACK: parseBoolean(process.env.DISABLE_DIRECT_DOWNLOAD_FALLBACK, false),
  PUBLIC_BASE_URL: (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, ''),
  DIRECT_DOWNLOAD_TTL_MINUTES: parsePositiveInt(process.env.DIRECT_DOWNLOAD_TTL_MINUTES, 360),
  ENABLE_STEAM_AUTOCOMPLETE: parseBoolean(process.env.ENABLE_STEAM_AUTOCOMPLETE, true),
  AUTOCOMPLETE_STEAM_TIMEOUT_MS: parsePositiveInt(process.env.AUTOCOMPLETE_STEAM_TIMEOUT_MS, 800),
  CACHE_DURATION: 0,
  ENABLE_DAILY_DOWNLOAD_LIMIT: parseBoolean(process.env.ENABLE_DAILY_DOWNLOAD_LIMIT, true),
  MAX_DAILY_DOWNLOADS_PER_USER: parsePositiveInt(process.env.MAX_DAILY_DOWNLOADS_PER_USER, 25),
  DAILY_LIMIT_TIMEZONE: process.env.DAILY_LIMIT_TIMEZONE || 'Asia/Ho_Chi_Minh',
  UPSTASH_REDIS_REST_URL: (process.env.UPSTASH_REDIS_REST_URL || '').replace(/\/+$/, ''),
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN || '',
  UPSTASH_DAILY_QUOTA_PREFIX: process.env.UPSTASH_DAILY_QUOTA_PREFIX || 'luatool:quota',
  REGISTER_GLOBAL_SLASH_COMMAND: parseBoolean(process.env.REGISTER_GLOBAL_SLASH_COMMAND, false),
  REGISTER_GUILD_SLASH_COMMAND: parseBoolean(process.env.REGISTER_GUILD_SLASH_COMMAND, true),
  GEN_PROCESSING_DELAY_MS: Math.min(
    Math.max(parsePositiveInt(process.env.GEN_PROCESSING_DELAY_MS, 3500), 3000),
    4000
  ),
  GET_PROCESSING_DELAY_MS: Math.min(
    Math.max(parsePositiveInt(process.env.GET_PROCESSING_DELAY_MS, 9000), 5000),
    18000
  ),
  MORRENUS_API_BASE_URL: (process.env.MORRENUS_API_BASE_URL || 'https://manifest.morrenus.xyz').replace(/\/+$/, ''),
  MORRENUS_API_KEY: (process.env.MORRENUS_API_KEY || '').trim(),
  MORRENUS_API_KEYS: process.env.MORRENUS_API_KEYS || '',
  MORRENUS_REQUEST_TIMEOUT_MS: parsePositiveInt(process.env.MORRENUS_REQUEST_TIMEOUT_MS, 120000),
  ADMIN_TOKEN: process.env.ADMIN_TOKEN || '',
  DISCORD_REST_PRECHECK_ENABLED: parseBoolean(process.env.DISCORD_REST_PRECHECK_ENABLED, false),
  DISCORD_REST_CHECK_TIMEOUT_MS: parsePositiveInt(process.env.DISCORD_REST_CHECK_TIMEOUT_MS, 10000),
  DISCORD_LOGIN_TIMEOUT_MS: parsePositiveInt(process.env.DISCORD_LOGIN_TIMEOUT_MS, 120000),
  DISCORD_LOGIN_RETRY_MAX_DELAY_MS: parsePositiveInt(process.env.DISCORD_LOGIN_RETRY_MAX_DELAY_MS, 300000),
  DISCORD_FORCE_IPV4: parseBoolean(process.env.DISCORD_FORCE_IPV4, true),
  DISCORD_NOISY_LOG_SUPPRESS: parseBoolean(process.env.DISCORD_NOISY_LOG_SUPPRESS, true),
  DISCORD_NOISY_LOG_COOLDOWN_MS: parsePositiveInt(process.env.DISCORD_NOISY_LOG_COOLDOWN_MS, 60000),
  AUTO_DELETE_TIMEOUT: 5 * 60 * 1000,
  ENABLE_AUTO_DELETE: true,
  ENABLE_DETAILED_LOGGING: parseBoolean(process.env.ENABLE_DETAILED_LOGGING, true),
  DEBUG_MESSAGE_LOGGING: parseBoolean(process.env.DEBUG_MESSAGE_LOGGING, false),
  LOG_TO_FILE: parseBoolean(process.env.LOG_TO_FILE, true),
  LOG_MAX_SIZE_MB: parsePositiveInt(process.env.LOG_MAX_SIZE_MB, 10),
  LOG_MAX_FILES: parsePositiveInt(process.env.LOG_MAX_FILES, 7),
  CHECKSUM_ENABLED: parseBoolean(process.env.CHECKSUM_ENABLED, true),
  CHECKSUM_MAX_SIZE_MB: parsePositiveInt(process.env.CHECKSUM_MAX_SIZE_MB, 200),
};

module.exports = {
  CONFIG,
  DATA_ROOT,
  DISCORD_TOKEN_SOURCE,
  getGameTitleStatusIcon,
  parseBoolean,
  parsePositiveInt,
};
