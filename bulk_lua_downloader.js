// bulk_lua_downloader.js
// Script tự động tải hàng loạt file .lua từ GitHub repos công khai
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ============================================
// CẤU HÌNH
// ============================================
const CONFIG = {
  OUTPUT_DIR: './lua_files',
  DELAY_MS: 500,
  
  // Danh sách repos công khai có nhiều file .lua
  REPOS: [
    // Garry's Mod addons
    'FPtje/DarkRP',
    'Facepunch/garrysmod',
    'wiremod/wire',
    'thegrb93/StarfallEx',
    
    // Steam Workshop collections
    'Be1zebub/Small-GLua-Things',
    'Kefta/GLua',
    
    // Game cheats/trainers có lua scripts
    'unknowncheats/lua-scripts',
    
    // Cheat Engine lua scripts
    'cheatengine/cheatengine',
    
    // Game specific
    'pmdevita/starbound-projects',
  ],
  
  // Hoặc dùng GitHub trending/popular (không cần token)
  USE_TRENDING: true,
};

// ============================================
// UTILS
// ============================================

const stats = {
  totalFound: 0,
  totalDownloaded: 0,
  totalFailed: 0,
  duplicates: 0,
};

function log(msg, type = 'INFO') {
  const colors = {
    INFO: '\x1b[36m',
    SUCCESS: '\x1b[32m',
    ERROR: '\x1b[31m',
    WARN: '\x1b[33m',
  };
  console.log(`${colors[type]}[${type}]\x1b[0m ${msg}`);
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9_.-]/gi, '_').substring(0, 200);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ============================================
// GITHUB REPO CRAWLER (KHÔNG CẦN TOKEN)
// ============================================

async function getRepoContents(owner, repo, path = '') {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    
    log(`📂 Scanning: ${owner}/${repo}/${path}`);
    
    const response = await axios.get(url, {
      timeout: 15000,
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Mozilla/5.0',
      }
    });
    
    return response.data;
    
  } catch (error) {
    if (error.response?.status === 403) {
      log('⚠️ Rate limit! Waiting 60s...', 'WARN');
      await delay(60000);
      return getRepoContents(owner, repo, path);
    }
    
    log(`❌ Error: ${error.message}`, 'ERROR');
    return [];
  }
}

async function crawlRepo(owner, repo, currentPath = '', depth = 0) {
  if (depth > 3) return; // Giới hạn độ sâu
  
  const contents = await getRepoContents(owner, repo, currentPath);
  
  for (const item of contents) {
    if (item.type === 'file' && item.name.endsWith('.lua')) {
      stats.totalFound++;
      await downloadLuaFile(item, owner, repo);
      await delay(CONFIG.DELAY_MS);
      
    } else if (item.type === 'dir') {
      // Bỏ qua một số folder không cần thiết
      const skipDirs = ['node_modules', '.git', 'test', 'tests', 'docs'];
      if (!skipDirs.includes(item.name)) {
        await crawlRepo(owner, repo, item.path, depth + 1);
      }
    }
  }
}

async function downloadLuaFile(item, owner, repo) {
  try {
    // Download raw content
    const response = await axios.get(item.download_url, { 
      timeout: 15000,
      responseType: 'text',
    });
    
    const content = response.data;
    
    // Validate lua content
    if (typeof content !== 'string' || content.length < 20) {
      return false;
    }
    
    // Tạo filename unique
    const repoName = sanitizeFilename(repo);
    const itemPath = sanitizeFilename(item.path.replace(/\//g, '_'));
    const fileName = `${repoName}_${itemPath}`;
    const filePath = path.join(CONFIG.OUTPUT_DIR, fileName);
    
    // Check duplicate
    if (fs.existsSync(filePath)) {
      stats.duplicates++;
      return false;
    }
    
    // Save file
    fs.writeFileSync(filePath, content);
    stats.totalDownloaded++;
    
    const sizeMB = (content.length / 1024).toFixed(1);
    log(`💾 ${fileName} (${sizeMB} KB)`, 'SUCCESS');
    
    return true;
    
  } catch (error) {
    stats.totalFailed++;
    log(`❌ Failed: ${item.name}`, 'ERROR');
    return false;
  }
}

// ============================================
// ALTERNATIVE: ScrapeGitHub.com API (FREE)
// ============================================

async function searchViaScrape(keyword, page = 1) {
  try {
    // Dùng GitHub web search (không cần auth)
    const searchUrl = `https://github.com/search`;
    const params = {
      q: `${keyword} extension:lua`,
      type: 'code',
      p: page,
    };
    
    log(`🔍 Searching via web: "${keyword}" page ${page}`);
    
    const response = await axios.get(searchUrl, {
      params,
      timeout: 15000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      }
    });
    
    // Parse HTML để lấy links (basic parsing)
    const html = response.data;
    const regex = /href="(\/[^\/]+\/[^\/]+\/blob\/[^"]+\.lua)"/g;
    const matches = [...html.matchAll(regex)];
    
    const files = matches.map(match => {
      const url = match[1];
      const parts = url.split('/');
      return {
        owner: parts[1],
        repo: parts[2],
        path: parts.slice(5).join('/'),
        url: `https://github.com${url}`,
        rawUrl: `https://raw.githubusercontent.com${url.replace('/blob/', '/')}`,
      };
    });
    
    log(`✅ Found ${files.length} files`, 'SUCCESS');
    return files;
    
  } catch (error) {
    log(`❌ Search error: ${error.message}`, 'ERROR');
    return [];
  }
}

async function downloadFromWebSearch() {
  const keywords = [
    'steam game',
    'garry mod',
    'cheat engine',
    'game trainer',
  ];
  
  for (const keyword of keywords) {
    log(`\n🔍 Searching: "${keyword} lua"`);
    
    const files = await searchViaScrape(keyword, 1);
    
    for (const file of files) {
      try {
        const response = await axios.get(file.rawUrl, { 
          timeout: 10000,
          responseType: 'text',
        });
        
        const content = response.data;
        if (typeof content !== 'string' || content.length < 20) continue;
        
        const fileName = sanitizeFilename(`${file.owner}_${file.repo}_${file.path}`);
        const filePath = path.join(CONFIG.OUTPUT_DIR, fileName);
        
        if (fs.existsSync(filePath)) {
          stats.duplicates++;
          continue;
        }
        
        fs.writeFileSync(filePath, content);
        stats.totalDownloaded++;
        stats.totalFound++;
        
        log(`💾 ${fileName}`, 'SUCCESS');
        
      } catch (error) {
        stats.totalFailed++;
      }
      
      await delay(CONFIG.DELAY_MS);
    }
    
    await delay(2000);
  }
}

// ============================================
// KNOWN REPOS WITH LUA FILES
// ============================================

async function downloadFromKnownRepos() {
  log('\n📦 Crawling known repositories...\n');
  
  for (const repoFull of CONFIG.REPOS) {
    const [owner, repo] = repoFull.split('/');
    
    log(`\n📚 Repository: ${owner}/${repo}`);
    
    try {
      await crawlRepo(owner, repo);
      await delay(2000); // Delay between repos
    } catch (error) {
      log(`❌ Failed to crawl ${repoFull}`, 'ERROR');
    }
  }
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 BULK LUA DOWNLOADER - GitHub Crawler v2');
  console.log('='.repeat(60));
  console.log(`📁 Output: ${CONFIG.OUTPUT_DIR}`);
  console.log(`📦 Repos to crawl: ${CONFIG.REPOS.length}`);
  console.log('='.repeat(60) + '\n');
  
  ensureDir(CONFIG.OUTPUT_DIR);
  
  const startTime = Date.now();
  
  // Method 1: Crawl known repos (không cần token)
  await downloadFromKnownRepos();
  
  // Method 2: Web search scraping (backup method)
  if (CONFIG.USE_TRENDING && stats.totalDownloaded < 100) {
    log('\n🌐 Trying web search method...\n');
    await downloadFromWebSearch();
  }
  
  // Summary
  const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ DOWNLOAD COMPLETED!');
  console.log('='.repeat(60));
  console.log(`📊 Found:       ${stats.totalFound} files`);
  console.log(`💾 Downloaded:  ${stats.totalDownloaded} files`);
  console.log(`🔄 Duplicates:  ${stats.duplicates} files`);
  console.log(`❌ Failed:      ${stats.totalFailed} files`);
  console.log(`⏱️  Duration:    ${duration} minutes`);
  console.log(`📁 Location:    ${path.resolve(CONFIG.OUTPUT_DIR)}`);
  console.log('='.repeat(60) + '\n');
  
  if (stats.totalDownloaded < 10) {
    log('💡 TIP: Thêm repos vào CONFIG.REPOS để tải nhiều hơn!', 'WARN');
    log('   - Tìm repos trên GitHub: github.com/search?q=lua+game', 'WARN');
    log('   - Thêm vào array REPOS theo format: "owner/repo"', 'WARN');
  }
}

// Run
main().catch(error => {
  console.error('\n❌ FATAL ERROR:', error);
  process.exit(1);
});