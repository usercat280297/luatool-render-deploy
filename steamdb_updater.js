// ============================================
// STEAMDB REAL-TIME UPDATER
// Lấy thông tin mới nhất từ SteamDB
// ============================================
require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');

const CONFIG = {
  GAME_INFO_CACHE_PATH: './game_info_cache.json',
  CACHE_DURATION: 3600000, // 1 hour (giảm từ 12h xuống 1h)
  FORCE_REFRESH_THRESHOLD: 86400000, // 24 hours - force refresh
  STEAMDB_BASE_URL: 'https://steamdb.info',
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
};

let gameInfoCache = {};

function log(type, message, data = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${type}] ${message}`, data);
}

function loadCache() {
  if (fs.existsSync(CONFIG.GAME_INFO_CACHE_PATH)) {
    try {
      gameInfoCache = JSON.parse(fs.readFileSync(CONFIG.GAME_INFO_CACHE_PATH, 'utf8'));
      log('INFO', `Loaded ${Object.keys(gameInfoCache).length} cached games`);
    } catch (error) {
      log('ERROR', 'Failed to load cache', { error: error.message });
    }
  }
}

function saveCache() {
  try {
    fs.writeFileSync(CONFIG.GAME_INFO_CACHE_PATH, JSON.stringify(gameInfoCache, null, 2));
    log('SUCCESS', 'Cache saved successfully');
  } catch (error) {
    log('ERROR', 'Failed to save cache', { error: error.message });
  }
}

// ============================================
// STEAMDB SCRAPER - REAL-TIME DATA
// ============================================

async function fetchFromSteamDB(appId) {
  try {
    log('INFO', `Fetching real-time data from SteamDB for ${appId}...`);
    
    const response = await axios.get(`${CONFIG.STEAMDB_BASE_URL}/app/${appId}/`, {
      headers: {
        'User-Agent': CONFIG.USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout: 15000,
    });
    
    const $ = cheerio.load(response.data);
    const data = {};
    
    // Extract game name
    const title = $('h1').first().text().trim();
    if (title) {
      data.name = title;
    }
    
    // Extract price
    const priceText = $('.price').first().text().trim();
    if (priceText) {
      data.price = priceText;
    }
    
    // Extract release date
    $('td').each((i, elem) => {
      const text = $(elem).text().trim();
      if (text.includes('Release Date')) {
        const dateCell = $(elem).next();
        if (dateCell.length) {
          data.releaseDate = dateCell.text().trim();
        }
      }
    });
    
    // Extract download size
    const sizeMatch = response.data.match(/Download\s+Size[:\s]+([\d.]+)\s*(GB|MB)/i);
    if (sizeMatch) {
      const size = parseFloat(sizeMatch[1]);
      const unit = sizeMatch[2].toUpperCase();
      data.size = unit === 'GB' ? size * 1024 * 1024 * 1024 : size * 1024 * 1024;
      data.sizeFormatted = `${size} ${unit}`;
    }
    
    // Extract last update time
    const lastUpdateMatch = response.data.match(/Last\s+Update[:\s]+(\d+\s+\w+\s+ago)/i);
    if (lastUpdateMatch) {
      data.lastUpdate = lastUpdateMatch[1];
    }
    
    // Extract player count
    const playersMatch = response.data.match(/(\d+(?:,\d+)*)\s+players/i);
    if (playersMatch) {
      data.currentPlayers = parseInt(playersMatch[1].replace(/,/g, ''));
    }
    
    // Extract peak players
    const peakMatch = response.data.match(/Peak:\s+(\d+(?:,\d+)*)/i);
    if (peakMatch) {
      data.peakPlayers = parseInt(peakMatch[1].replace(/,/g, ''));
    }
    
    // Extract DRM info
    if (response.data.toLowerCase().includes('denuvo')) {
      data.hasDenuvo = true;
    }
    
    data.timestamp = Date.now();
    data.source = 'steamdb';
    
    log('SUCCESS', `Got real-time data from SteamDB for ${appId}`, {
      name: data.name,
      size: data.sizeFormatted,
      price: data.price,
    });
    
    return data;
    
  } catch (error) {
    log('ERROR', `Failed to fetch from SteamDB for ${appId}`, { error: error.message });
    return null;
  }
}

// ============================================
// SMART CACHE MANAGER
// ============================================

function shouldRefreshCache(appId) {
  const cached = gameInfoCache[appId];
  
  if (!cached) {
    return true; // No cache, need to fetch
  }
  
  const age = Date.now() - cached.timestamp;
  
  // Force refresh if older than 24 hours
  if (age > CONFIG.FORCE_REFRESH_THRESHOLD) {
    log('INFO', `Cache too old for ${appId}, forcing refresh`);
    return true;
  }
  
  // Normal refresh if older than 1 hour
  if (age > CONFIG.CACHE_DURATION) {
    log('INFO', `Cache expired for ${appId}, refreshing`);
    return true;
  }
  
  return false;
}

async function getGameInfo(appId, forceRefresh = false) {
  if (!forceRefresh && !shouldRefreshCache(appId)) {
    log('INFO', `Using cached data for ${appId}`);
    return gameInfoCache[appId].data;
  }
  
  // Fetch fresh data from SteamDB
  const steamDBData = await fetchFromSteamDB(appId);
  
  if (steamDBData) {
    gameInfoCache[appId] = {
      data: steamDBData,
      timestamp: Date.now(),
    };
    saveCache();
    return steamDBData;
  }
  
  // Fallback to cached data if fetch failed
  if (gameInfoCache[appId]) {
    log('WARN', `Using stale cache for ${appId} due to fetch failure`);
    return gameInfoCache[appId].data;
  }
  
  return null;
}

// ============================================
// BATCH UPDATE FUNCTION
// ============================================

async function updateAllCachedGames() {
  console.log('\n' + '='.repeat(70));
  console.log('🔄 UPDATING ALL CACHED GAMES FROM STEAMDB');
  console.log('='.repeat(70) + '\n');
  
  loadCache();
  
  const appIds = Object.keys(gameInfoCache);
  let updated = 0;
  let failed = 0;
  
  for (const appId of appIds) {
    try {
      if (shouldRefreshCache(appId)) {
        log('INFO', `Updating ${appId}...`);
        await getGameInfo(appId, true);
        updated++;
        
        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (error) {
      log('ERROR', `Failed to update ${appId}`, { error: error.message });
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ UPDATE COMPLETE');
  console.log('='.repeat(70));
  console.log(`📊 Updated: ${updated} games`);
  console.log(`❌ Failed: ${failed} games`);
  console.log(`📁 Total cached: ${Object.keys(gameInfoCache).length} games`);
  console.log('='.repeat(70) + '\n');
}

// ============================================
// EXPORT FUNCTIONS
// ============================================

module.exports = {
  getGameInfo,
  updateAllCachedGames,
  shouldRefreshCache,
  loadCache,
  saveCache,
};

// ============================================
// CLI USAGE
// ============================================

if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args[0] === 'update-all') {
    updateAllCachedGames().catch(error => {
      console.error('❌ Fatal error:', error);
      process.exit(1);
    });
  } else if (args[0] && /^\d+$/.test(args[0])) {
    const appId = args[0];
    loadCache();
    getGameInfo(appId, true).then(data => {
      console.log('\n📊 Game Info:');
      console.log(JSON.stringify(data, null, 2));
    }).catch(error => {
      console.error('❌ Error:', error);
      process.exit(1);
    });
  } else {
    console.log('Usage:');
    console.log('  node steamdb_updater.js <appid>     - Fetch specific game');
    console.log('  node steamdb_updater.js update-all  - Update all cached games');
  }
}
