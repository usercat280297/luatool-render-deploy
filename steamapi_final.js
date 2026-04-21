require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');

class SteamAPIService {
  constructor() {
    this.apiKey = process.env.STEAM_API_KEY;
    this.cachePath = path.join(__dirname, 'steam_cache');
    this.CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours
    this.requestDelay = 5000; // 5 seconds between requests
    this.lastRequestTime = 0;
    this.retryDelay = 30000; // 30 seconds retry delay
    this.maxRetries = 3;
    
    // Ensure cache directory exists
    if (!fs.existsSync(this.cachePath)) {
      fs.mkdirSync(this.cachePath, { recursive: true });
      console.log('✅ Created steam_cache directory');
    }
  }

  // Rate limiting
  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.requestDelay) {
      await new Promise(resolve => setTimeout(resolve, this.requestDelay - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();
  }

  // Get game details from Steam Store API
  async getGameDetails(appId, retryCount = 0) {
    try {
      // Check cache first
      const cached = this.getCachedGameData(appId);
      if (cached) {
        return cached;
      }

      await this.waitForRateLimit();

      const url = `https://store.steampowered.com/api/appdetails?appids=${appId}&l=english&cc=us`;
      const response = await axios.get(url, {
        timeout: 20000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json,text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Referer': 'https://store.steampowered.com/',
          'Connection': 'keep-alive',
          'Cache-Control': 'max-age=0'
        }
      });

      if (response.data && response.data[appId] && response.data[appId].success) {
        const gameData = response.data[appId].data;
        const transformed = this.transformSteamData(gameData, appId);
        
        // Cache it
        this.cacheGameData(appId, transformed);
        
        return transformed;
      }

      return null;
    } catch (error) {
      if (error.response && error.response.status === 403) {
        if (retryCount < this.maxRetries) {
          const waitTime = this.retryDelay * (retryCount + 1); // Exponential backoff
          console.log(`⚠️  403 Forbidden for ${appId}, waiting ${waitTime/1000}s... (${retryCount + 1}/${this.maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          return this.getGameDetails(appId, retryCount + 1);
        }
        console.log(`❌ Failed ${appId} after ${this.maxRetries} retries`);
      } else if (error.response && error.response.status === 429) {
        console.log(`⏱️  Rate limited, waiting 60s...`);
        await new Promise(resolve => setTimeout(resolve, 60000));
        if (retryCount < this.maxRetries) {
          return this.getGameDetails(appId, retryCount + 1);
        }
      }
      return null;
    }
  }

  // Transform Steam data to our format
  transformSteamData(steamData, appId) {
    const basePrice = steamData.is_free ? 0 : 
                     (steamData.price_overview ? steamData.price_overview.initial / 100 : 0);
    const currentPrice = steamData.is_free ? 0 :
                        (steamData.price_overview ? steamData.price_overview.final / 100 : basePrice);
    const discount = steamData.price_overview ? steamData.price_overview.discount_percent : 0;

    return {
      id: appId,
      steamAppId: appId,
      title: steamData.name || `Game ${appId}`,
      name: steamData.name || `Game ${appId}`,
      description: steamData.short_description || steamData.detailed_description || 'No description available',
      
      // Images
      cover: steamData.header_image || `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`,
      headerImage: steamData.header_image,
      capsuleImage: steamData.capsule_image,
      backgroundImage: `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/page_bg_generated.jpg`,
      screenshots: steamData.screenshots ? steamData.screenshots.map(s => s.path_full) : [],
      
      // Developer & Publisher
      developer: steamData.developers ? steamData.developers.join(', ') : 'Unknown',
      publisher: steamData.publishers ? steamData.publishers.join(', ') : 'Unknown',
      
      // Release
      releaseDate: steamData.release_date ? steamData.release_date.date : 'TBA',
      comingSoon: steamData.release_date ? steamData.release_date.coming_soon : false,
      
      // Categories & Genres
      genres: steamData.genres ? steamData.genres.map(g => g.description).join(', ') : 'Unknown',
      categories: steamData.categories ? steamData.categories.map(c => c.description) : [],
      tags: steamData.categories ? steamData.categories.map(c => c.description) : [],
      
      // Pricing
      isFree: steamData.is_free || false,
      originalPrice: basePrice > 0 ? `$${basePrice.toFixed(2)}` : 'Free',
      salePrice: currentPrice > 0 ? `$${currentPrice.toFixed(2)}` : 'Free',
      discount: discount,
      onSale: discount > 0,
      
      // Ratings
      rating: steamData.metacritic ? `${steamData.metacritic.score}%` : 'N/A',
      metacriticScore: steamData.metacritic ? steamData.metacritic.score : null,
      recommendations: steamData.recommendations ? steamData.recommendations.total : 0,
      
      // Platforms
      platforms: {
        windows: steamData.platforms ? steamData.platforms.windows : false,
        mac: steamData.platforms ? steamData.platforms.mac : false,
        linux: steamData.platforms ? steamData.platforms.linux : false
      },
      oslist: this.getPlatformString(steamData.platforms),
      
      // Requirements
      pcRequirements: steamData.pc_requirements || {},
      macRequirements: steamData.mac_requirements || {},
      linuxRequirements: steamData.linux_requirements || {},
      
      // Additional
      type: steamData.type || 'game',
      tool: steamData.type === 'tool' || steamData.type === 'application',
      dlc: steamData.dlc || [],
      achievements: steamData.achievements ? steamData.achievements.total : 0,
      featured: false,
      
      // Content
      aboutGame: steamData.about_the_game || '',
      languages: steamData.supported_languages || '',
      website: steamData.website || '',
      supportUrl: steamData.support_info ? steamData.support_info.url : '',
      
      // Size estimation
      size: 'Check Steam',
      
      // Metadata
      lastFetched: new Date().toISOString()
    };
  }

  getPlatformString(platforms) {
    if (!platforms) return 'windows';
    const platformList = [];
    if (platforms.windows) platformList.push('windows');
    if (platforms.mac) platformList.push('mac');
    if (platforms.linux) platformList.push('linux');
    return platformList.join(',') || 'windows';
  }

  // Cache management
  cacheGameData(appId, data) {
    try {
      const cacheFile = path.join(this.cachePath, `${appId}.json`);
      fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
    } catch (error) {
      // Silent fail for caching
    }
  }

  getCachedGameData(appId) {
    try {
      const cacheFile = path.join(this.cachePath, `${appId}.json`);
      
      if (!fs.existsSync(cacheFile)) {
        return null;
      }

      const stats = fs.statSync(cacheFile);
      const age = Date.now() - stats.mtimeMs;
      
      if (age > this.CACHE_DURATION) {
        return null;
      }

      const data = fs.readFileSync(cacheFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  // Batch fetch with progress
  async batchFetchGames(appIds, onProgress) {
    const results = [];
    const total = appIds.length;
    let successCount = 0;
    let failCount = 0;
    
    console.log(`\n🔄 Starting batch fetch for ${total} games from Steam API...`);
    console.log(`⏱️  Estimated time: ${Math.round(total * 3 / 60)} minutes\n`);
    
    for (let i = 0; i < appIds.length; i++) {
      const appId = appIds[i];
      const gameData = await this.getGameDetails(appId);
      
      if (gameData) {
        results.push(gameData);
        successCount++;
      } else {
        failCount++;
      }
      
      if (onProgress) {
        onProgress(i + 1, total, gameData);
      }
      
      // Show progress every 100 games
      if ((i + 1) % 100 === 0) {
        const percent = Math.round((i + 1) / total * 100);
        console.log(`📊 Progress: ${i + 1}/${total} (${percent}%) | ✅ ${successCount} | ❌ ${failCount}`);
      }
    }
    
    console.log(`\n✅ Batch complete: ${successCount}/${total} games fetched successfully`);
    console.log(`❌ Failed: ${failCount} games\n`);
    return results;
  }

  // Clear cache
  clearCache() {
    try {
      const files = fs.readdirSync(this.cachePath);
      files.forEach(file => {
        fs.unlinkSync(path.join(this.cachePath, file));
      });
      console.log('🗑️  Cache cleared');
    } catch (error) {
      console.error('Error clearing cache:', error);
    }
  }

  // Get cache stats
  getCacheStats() {
    try {
      if (!fs.existsSync(this.cachePath)) {
        return { total: 0, valid: 0, expired: 0 };
      }

      const files = fs.readdirSync(this.cachePath);
      const now = Date.now();
      let valid = 0;
      let expired = 0;

      files.forEach(file => {
        const filePath = path.join(this.cachePath, file);
        const stats = fs.statSync(filePath);
        const age = now - stats.mtimeMs;
        
        if (age > this.CACHE_DURATION) {
          expired++;
        } else {
          valid++;
        }
      });

      return {
        total: files.length,
        valid: valid,
        expired: expired,
        cacheDuration: this.CACHE_DURATION / 1000 / 60 / 60 + ' hours'
      };
    } catch (error) {
      return { total: 0, valid: 0, expired: 0 };
    }
  }
}

module.exports = new SteamAPIService();