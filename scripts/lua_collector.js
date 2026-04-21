// ============================================
// LUA FILES COLLECTOR - Multi-Source Scraper
// Thu thập lua files từ GitHub, cs.rin.ru, Reddit
// ============================================
require('dotenv').config();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const CONFIG = {
  LUA_FILES_PATH: './lua_files',
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  COLLECTED_LOG: './collected_lua_log.json',
  MAX_RETRIES: 3,
  DELAY_MS: 2000,
};

let collectedLog = { total: 0, sources: {}, lastUpdate: null };

// ============================================
// UTILITY FUNCTIONS
// ============================================

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function log(type, message, data = {}) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${type}] ${message}`, data);
}

function loadCollectedLog() {
  if (fs.existsSync(CONFIG.COLLECTED_LOG)) {
    try {
      collectedLog = JSON.parse(fs.readFileSync(CONFIG.COLLECTED_LOG, 'utf8'));
    } catch (error) {
      log('WARN', 'Failed to load collected log', { error: error.message });
    }
  }
}

function saveCollectedLog() {
  try {
    collectedLog.lastUpdate = new Date().toISOString();
    fs.writeFileSync(CONFIG.COLLECTED_LOG, JSON.stringify(collectedLog, null, 2));
  } catch (error) {
    log('ERROR', 'Failed to save collected log', { error: error.message });
  }
}

function saveLuaFile(appId, content) {
  try {
    const filePath = path.join(CONFIG.LUA_FILES_PATH, `${appId}.lua`);
    
    // Check if file already exists
    if (fs.existsSync(filePath)) {
      log('INFO', `File already exists: ${appId}.lua`);
      return false;
    }
    
    // Validate content format
    if (!content.includes('addappid') && !content.includes('setManifestid')) {
      log('WARN', `Invalid lua content for ${appId}`);
      return false;
    }
    
    fs.writeFileSync(filePath, content, 'utf8');
    log('SUCCESS', `Saved lua file: ${appId}.lua`);
    return true;
  } catch (error) {
    log('ERROR', `Failed to save lua file ${appId}`, { error: error.message });
    return false;
  }
}

// ============================================
// SOURCE 1: GITHUB REPOSITORIES
// ============================================

async function collectFromGitHub() {
  log('INFO', '🔍 Searching GitHub for lua files...');
  
  const queries = [
    'addappid filename:.lua',
    'setManifestid filename:.lua',
    'steam manifest lua',
    'steamcmd lua script',
  ];
  
  let totalFound = 0;
  
  for (const query of queries) {
    try {
      await delay(CONFIG.DELAY_MS);
      
      const response = await axios.get('https://api.github.com/search/code', {
        params: {
          q: query,
          per_page: 100,
        },
        headers: {
          'Authorization': `token ${CONFIG.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Lua-Collector-Bot/1.0',
        },
        timeout: 15000,
      });
      
      if (response.data.items && response.data.items.length > 0) {
        log('INFO', `Found ${response.data.items.length} files for query: ${query}`);
        
        for (const item of response.data.items) {
          try {
            // Extract appId from filename
            const match = item.name.match(/(\d{4,8})\.lua$/);
            if (!match) continue;
            
            const appId = match[1];
            
            // Download file content
            await delay(1000);
            const contentResponse = await axios.get(item.url, {
              headers: {
                'Authorization': `token ${CONFIG.GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3.raw',
                'User-Agent': 'Lua-Collector-Bot/1.0',
              },
              timeout: 10000,
            });
            
            if (saveLuaFile(appId, contentResponse.data)) {
              totalFound++;
              collectedLog.total++;
              collectedLog.sources.github = (collectedLog.sources.github || 0) + 1;
            }
            
          } catch (error) {
            log('WARN', `Failed to download file: ${item.name}`, { error: error.message });
          }
        }
      }
      
    } catch (error) {
      log('ERROR', `GitHub search failed for query: ${query}`, { error: error.message });
    }
  }
  
  log('SUCCESS', `✅ GitHub collection complete: ${totalFound} new files`);
  return totalFound;
}

// ============================================
// SOURCE 2: GITHUB GISTS
// ============================================

async function collectFromGitHubGists() {
  log('INFO', '🔍 Searching GitHub Gists...');
  
  let totalFound = 0;
  
  try {
    const response = await axios.get('https://api.github.com/gists/public', {
      params: {
        per_page: 100,
      },
      headers: {
        'Authorization': `token ${CONFIG.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Lua-Collector-Bot/1.0',
      },
      timeout: 15000,
    });
    
    for (const gist of response.data) {
      for (const [filename, fileData] of Object.entries(gist.files)) {
        if (filename.endsWith('.lua')) {
          const match = filename.match(/(\d{4,8})\.lua$/);
          if (!match) continue;
          
          const appId = match[1];
          
          try {
            await delay(500);
            const contentResponse = await axios.get(fileData.raw_url, { timeout: 10000 });
            
            if (saveLuaFile(appId, contentResponse.data)) {
              totalFound++;
              collectedLog.total++;
              collectedLog.sources.gists = (collectedLog.sources.gists || 0) + 1;
            }
          } catch (error) {
            log('WARN', `Failed to download gist: ${filename}`, { error: error.message });
          }
        }
      }
    }
    
  } catch (error) {
    log('ERROR', 'GitHub Gists search failed', { error: error.message });
  }
  
  log('SUCCESS', `✅ Gists collection complete: ${totalFound} new files`);
  return totalFound;
}

// ============================================
// SOURCE 3: SPECIFIC KNOWN REPOSITORIES
// ============================================

async function collectFromKnownRepos() {
  log('INFO', '🔍 Checking known repositories...');
  
  const knownRepos = [
    'usercat280297/Luatool',
    'SteamRE/DepotDownloader',
    'lutris/lutris',
  ];
  
  let totalFound = 0;
  
  for (const repo of knownRepos) {
    try {
      await delay(CONFIG.DELAY_MS);
      
      // Search for lua files in repo
      const response = await axios.get(`https://api.github.com/repos/${repo}/git/trees/main?recursive=1`, {
        headers: {
          'Authorization': `token ${CONFIG.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Lua-Collector-Bot/1.0',
        },
        timeout: 15000,
      });
      
      if (response.data.tree) {
        const luaFiles = response.data.tree.filter(item => 
          item.path.endsWith('.lua') && /\d{4,8}\.lua$/.test(item.path)
        );
        
        log('INFO', `Found ${luaFiles.length} lua files in ${repo}`);
        
        for (const file of luaFiles) {
          const match = file.path.match(/(\d{4,8})\.lua$/);
          if (!match) continue;
          
          const appId = match[1];
          
          try {
            await delay(1000);
            const contentResponse = await axios.get(
              `https://raw.githubusercontent.com/${repo}/main/${file.path}`,
              { timeout: 10000 }
            );
            
            if (saveLuaFile(appId, contentResponse.data)) {
              totalFound++;
              collectedLog.total++;
              collectedLog.sources.knownRepos = (collectedLog.sources.knownRepos || 0) + 1;
            }
          } catch (error) {
            log('WARN', `Failed to download from ${repo}: ${file.path}`, { error: error.message });
          }
        }
      }
      
    } catch (error) {
      log('ERROR', `Failed to check repo: ${repo}`, { error: error.message });
    }
  }
  
  log('SUCCESS', `✅ Known repos collection complete: ${totalFound} new files`);
  return totalFound;
}

// ============================================
// SOURCE 4: CS.RIN.RU SCRAPER (Basic)
// ============================================

async function collectFromCSRinRu() {
  log('INFO', '🔍 Attempting to collect from cs.rin.ru...');
  log('WARN', 'cs.rin.ru requires authentication - skipping for now');
  
  // Note: cs.rin.ru requires login and has anti-scraping measures
  // This would need a more sophisticated approach with cookies/sessions
  
  return 0;
}

// ============================================
// SOURCE 5: REDDIT SCRAPER
// ============================================

async function collectFromReddit() {
  log('INFO', '🔍 Searching Reddit for lua files...');
  
  const subreddits = ['CrackWatch', 'Piracy', 'SteamCMD'];
  let totalFound = 0;
  
  for (const subreddit of subreddits) {
    try {
      await delay(CONFIG.DELAY_MS);
      
      const response = await axios.get(`https://www.reddit.com/r/${subreddit}/search.json`, {
        params: {
          q: 'lua OR manifest OR depot',
          limit: 100,
          sort: 'new',
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        timeout: 15000,
      });
      
      if (response.data?.data?.children) {
        log('INFO', `Found ${response.data.data.children.length} posts in r/${subreddit}`);
        
        for (const post of response.data.data.children) {
          const postData = post.data;
          
          // Check if post contains lua file links
          if (postData.selftext) {
            const luaMatches = postData.selftext.match(/(\d{4,8})\.lua/g);
            if (luaMatches) {
              log('INFO', `Found potential lua references in post: ${postData.title}`);
              // Would need to extract actual file content from links
            }
          }
        }
      }
      
    } catch (error) {
      log('ERROR', `Reddit search failed for r/${subreddit}`, { error: error.message });
    }
  }
  
  log('SUCCESS', `✅ Reddit collection complete: ${totalFound} new files`);
  return totalFound;
}

// ============================================
// MAIN COLLECTION FUNCTION
// ============================================

async function collectAllSources() {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 LUA FILES COLLECTOR - Starting Collection');
  console.log('='.repeat(70) + '\n');
  
  if (!fs.existsSync(CONFIG.LUA_FILES_PATH)) {
    fs.mkdirSync(CONFIG.LUA_FILES_PATH, { recursive: true });
  }
  
  loadCollectedLog();
  
  const startTime = Date.now();
  let totalNewFiles = 0;
  
  // Collect from all sources
  try {
    totalNewFiles += await collectFromGitHub();
    totalNewFiles += await collectFromGitHubGists();
    totalNewFiles += await collectFromKnownRepos();
    totalNewFiles += await collectFromCSRinRu();
    totalNewFiles += await collectFromReddit();
  } catch (error) {
    log('ERROR', 'Collection process failed', { error: error.message });
  }
  
  saveCollectedLog();
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log('\n' + '='.repeat(70));
  console.log('✅ COLLECTION COMPLETE');
  console.log('='.repeat(70));
  console.log(`📊 New files collected: ${totalNewFiles}`);
  console.log(`📁 Total files in collection: ${collectedLog.total}`);
  console.log(`⏱️  Duration: ${duration}s`);
  console.log('\n📈 Sources breakdown:');
  Object.entries(collectedLog.sources).forEach(([source, count]) => {
    console.log(`   - ${source}: ${count} files`);
  });
  console.log('='.repeat(70) + '\n');
}

// ============================================
// RUN COLLECTOR
// ============================================

if (require.main === module) {
  collectAllSources().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { collectAllSources };
