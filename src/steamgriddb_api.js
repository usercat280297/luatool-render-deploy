const axios = require('axios');

const CONFIG = {
  API_KEY: process.env.STEAMGRIDDB_API_KEY,
  BASE_URL: 'https://www.steamgriddb.com/api/v2'
};

async function getGameGrid(appId) {
  if (!CONFIG.API_KEY) {
    console.warn('⚠️ STEAMGRIDDB_API_KEY is missing in .env');
    return null;
  }

  try {
    // 1. Search for game by Steam AppID
    // SteamGridDB requires searching by game ID first if not using their internal ID
    // But they support searching by 'steam' platform ID directly in search/steam endpoint?
    // Actually, the correct endpoint to find grids by Steam AppID is /grids/steam/{gameId}
    
    // https://www.steamgriddb.com/api/v2/grids/steam/{id}
    const response = await axios.get(`${CONFIG.BASE_URL}/grids/steam/${appId}`, {
      headers: {
        'Authorization': `Bearer ${CONFIG.API_KEY}`
      },
      params: {
        dimensions: ['600x900', '920x430', '460x215'], // Prefer capsule/poster sizes
        styles: ['alternate', 'official', 'material'],
        types: ['static'] // Prefer static images for stability
      },
      timeout: 5000
    });

    if (response.data && response.data.success && response.data.data && response.data.data.length > 0) {
      // Return the URL of the first (best match) grid
      return response.data.data[0].url;
    }

    return null;
  } catch (error) {
    // 404 means no grid found, which is fine
    if (error.response && error.response.status === 404) {
      return null;
    }
    console.error(`[SteamGridDB] Error fetching grid for ${appId}:`, error.message);
    return null;
  }
}

async function getGameHero(appId) {
    if (!CONFIG.API_KEY) return null;
    
    try {
        const response = await axios.get(`${CONFIG.BASE_URL}/heroes/steam/${appId}`, {
            headers: { 'Authorization': `Bearer ${CONFIG.API_KEY}` },
            timeout: 5000
        });
        
        if (response.data?.success && response.data?.data?.length > 0) {
            return response.data.data[0].url;
        }
        return null;
    } catch (error) {
        return null;
    }
}

async function getGameIcon(appId) {
  if (!CONFIG.API_KEY) return null;
  
  try {
    const response = await axios.get(`${CONFIG.BASE_URL}/icons/steam/${appId}`, {
      headers: { 'Authorization': `Bearer ${CONFIG.API_KEY}` },
      params: {
        dimensions: ['32x32', '64x64', '128x128', '256x256'],
        styles: ['official', 'alternate', 'material'],
        types: ['static']
      },
      timeout: 5000
    });
    
    if (response.data?.success && Array.isArray(response.data?.data) && response.data.data.length > 0) {
      return response.data.data[0].url;
    }
    
    return null;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return null;
    }
    return null;
  }
}

module.exports = { getGameGrid, getGameHero, getGameIcon };
