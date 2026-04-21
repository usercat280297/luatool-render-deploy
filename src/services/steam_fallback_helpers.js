const axios = require('axios');
const { fetchSteamDbInfo } = require('../engines/steamdb_engine');

function safeLog(log, type, message, data = {}) {
  if (typeof log === 'function') {
    log(type, message, data);
  }
}

async function getGameInfoFromSteamDB(appId, options = {}) {
  const { log, timeoutMs = 10000 } = options;
  try {
    const info = await fetchSteamDbInfo(appId, { log, timeoutMs });
    if (!info) return null;

    const result = {};
    if (info.name) result.name = info.name;
    if (info.lastUpdate) {
      const parsedDate = new Date(info.lastUpdate);
      result.lastUpdate = Number.isNaN(parsedDate.getTime())
        ? info.lastUpdate
        : parsedDate.toLocaleDateString('vi-VN');
    }
    if (Number.isFinite(Number(info.size)) && Number(info.size) > 0) {
      result.size = Number(info.size);
    }

    return Object.keys(result).length > 0 ? result : null;
  } catch (error) {
    safeLog(log, 'WARN', `Failed to get info from SteamDB for ${appId}`, { error: error.message });
    return null;
  }
}

async function getGameNameFromSteamDB(appId, options = {}) {
  const { log, timeoutMs = 10000 } = options;
  try {
    const info = await fetchSteamDbInfo(appId, { log, timeoutMs });
    const gameName = String(info?.name || '').trim();
    if (gameName && gameName.length > 2) {
      safeLog(log, 'SUCCESS', `Got game name from SteamDB: ${gameName}`);
      return gameName;
    }
    return null;
  } catch (error) {
    safeLog(log, 'WARN', `Failed to get game name from SteamDB for ${appId}`, { error: error.message });
    return null;
  }
}

async function getGameNameFromSteamHTML(appId, options = {}) {
  const { log, timeoutMs = 8000 } = options;
  try {
    const response = await axios.get(`https://store.steampowered.com/app/${appId}`, {
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    const html = response.data;

    const ogMatch = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
    if (ogMatch && ogMatch[1]) {
      const name = ogMatch[1].trim();
      if (name.length > 2) return name;
    }

    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch && titleMatch[1]) {
      return titleMatch[1].replace(/\s*on Steam.*$/i, '').trim();
    }

    return null;
  } catch (error) {
    safeLog(log, 'WARN', `Failed to get name from Steam HTML for ${appId}`, { error: error.message });
    return null;
  }
}

async function getSizeFromSteamHTML(appId, options = {}) {
  const { log, timeoutMs = 8000 } = options;
  try {
    const response = await axios.get(`https://store.steampowered.com/app/${appId}`, {
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const html = response.data;
    const patterns = [
      /Storage:\s*(\d+(?:\.\d+)?)\s*(GB|MB)\s+available/i,
      /Storage:\s*(\d+(?:\.\d+)?)\s*(GB|MB)/i,
      /(\d+(?:\.\d+)?)\s*(GB|MB)\s+available\s+space/i,
      /Hard\s+Drive:\s*(\d+(?:\.\d+)?)\s*(GB|MB)/i,
      /<strong>Minimum:<\/strong>[\s\S]{0,500}?(\d+(?:\.\d+)?)\s*GB/i,
    ];

    for (const pattern of patterns) {
      const sizeMatch = html.match(pattern);
      if (!sizeMatch) continue;

      const size = parseFloat(sizeMatch[1]);
      const unit = sizeMatch[2]?.toUpperCase() || 'GB';
      if (size >= 0.5 && size <= 500) {
        const bytes = unit === 'GB' ? size * 1024 * 1024 * 1024 : size * 1024 * 1024;
        safeLog(log, 'SUCCESS', `Got size from HTML: ${size} ${unit}`);
        return bytes;
      }
    }

    return null;
  } catch (error) {
    safeLog(log, 'WARN', `HTML scraping failed for ${appId}`, { error: error.message });
    return null;
  }
}

async function getSizeFromSteamDB(appId, options = {}) {
  const { log, timeoutMs = 8000 } = options;
  try {
    const info = await fetchSteamDbInfo(appId, { log, timeoutMs });
    const size = Number(info?.size || 0);
    if (Number.isFinite(size) && size > 0) {
      safeLog(log, 'SUCCESS', `Got size from SteamDB: ${size} bytes`);
      return size;
    }
    return null;
  } catch (error) {
    safeLog(log, 'WARN', `SteamDB fetch failed for ${appId}`, { error: error.message });
    return null;
  }
}

const KNOWN_SIZES = {
  // 2024-2025 AAA Games
  2358720: 100 * 1024 * 1024 * 1024, // Mortal Kombat 1
  2519830: 100 * 1024 * 1024 * 1024, // Tekken 8
  2245450: 120 * 1024 * 1024 * 1024, // Black Myth: Wukong
  1623730: 25 * 1024 * 1024 * 1024,  // Palworld
  2399830: 148 * 1024 * 1024 * 1024, // Dragon's Dogma 2
  1086940: 150 * 1024 * 1024 * 1024, // Baldur's Gate 3
  2246460: 140 * 1024 * 1024 * 1024, // Monster Hunter Wilds
  1174180: 150 * 1024 * 1024 * 1024, // Red Dead Redemption 2
  1091500: 70 * 1024 * 1024 * 1024,  // Cyberpunk 2077
  2357570: 60 * 1024 * 1024 * 1024,  // Elden Ring
  1966720: 125 * 1024 * 1024 * 1024, // Starfield
  1938090: 149 * 1024 * 1024 * 1024, // Call of Duty: MW III
  1593500: 70 * 1024 * 1024 * 1024,  // God of War
  1817190: 75 * 1024 * 1024 * 1024,  // Spider-Man
  2050650: 100 * 1024 * 1024 * 1024, // Persona 3 Reload
  2124490: 50 * 1024 * 1024 * 1024,  // Silent Hill 2 Remake

  // Popular Games
  413150: 500 * 1024 * 1024,         // Stardew Valley
  1426210: 50 * 1024 * 1024 * 1024,  // It Takes Two
  892970: 1 * 1024 * 1024 * 1024,    // Valheim
  730: 85 * 1024 * 1024 * 1024,      // CS2
  1172470: 75 * 1024 * 1024 * 1024,  // Apex Legends
  578080: 40 * 1024 * 1024 * 1024,   // PUBG
};

function getKnownGameSize(appId, options = {}) {
  const { log } = options;
  const numAppId = parseInt(appId, 10);
  const knownSize = KNOWN_SIZES[numAppId];
  if (knownSize) {
    safeLog(log, 'SUCCESS', `Got size from known database: ${knownSize} bytes`);
    return knownSize;
  }
  return null;
}

async function getAccurateGameSize(appId, options = {}) {
  const { log } = options;
  const [steamDBSize, htmlSize, knownSize] = await Promise.all([
    getSizeFromSteamDB(appId, { log }),
    getSizeFromSteamHTML(appId, { log }),
    Promise.resolve(getKnownGameSize(appId, { log })),
  ]);

  const size = steamDBSize || htmlSize || knownSize;
  if (!size) {
    safeLog(log, 'WARN', `All size detection methods failed for ${appId}`);
  }
  return size;
}

module.exports = {
  getAccurateGameSize,
  getGameInfoFromSteamDB,
  getGameNameFromSteamDB,
  getGameNameFromSteamHTML,
  getKnownGameSize,
  getSizeFromSteamDB,
  getSizeFromSteamHTML,
};
