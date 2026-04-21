#!/usr/bin/env node

/**
 * ============================================
 * BOT VERIFICATION SCRIPT - v2.0
 * Test tất cả tính năng chính của bot
 * ============================================
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Color codes for terminal
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(type, message, details = '') {
  const timestamp = new Date().toLocaleTimeString();
  let prefix = '';
  
  switch(type) {
    case 'SUCCESS':
      prefix = `${colors.green}✅${colors.reset}`;
      break;
    case 'ERROR':
      prefix = `${colors.red}❌${colors.reset}`;
      break;
    case 'WARN':
      prefix = `${colors.yellow}⚠️${colors.reset}`;
      break;
    case 'INFO':
      prefix = `${colors.blue}ℹ️${colors.reset}`;
      break;
    case 'TEST':
      prefix = `${colors.cyan}🧪${colors.reset}`;
      break;
    default:
      prefix = '📝';
  }
  
  console.log(`[${timestamp}] ${prefix} ${message}`);
  if (details) console.log(`           ${colors.cyan}${details}${colors.reset}`);
}

async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 BOT VERIFICATION SCRIPT - v2.0');
  console.log('Testing all major features');
  console.log('='.repeat(70) + '\n');
  
  let passed = 0;
  let failed = 0;
  
  // ============================================
  // TEST 1: Environment Variables
  // ============================================
  log('TEST', 'Checking Environment Variables');
  
  const envFile = '.env';
  if (fs.existsSync(envFile)) {
    require('dotenv').config();
    const required = ['BOT_TOKEN', 'GITHUB_TOKEN', 'GITHUB_REPO_OWNER', 'GITHUB_REPO_NAME'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length === 0) {
      log('SUCCESS', 'All required environment variables are set', 
        `BOT_TOKEN: ${process.env.BOT_TOKEN.substring(0, 10)}...`);
      passed++;
    } else {
      log('ERROR', 'Missing environment variables:', missing.join(', '));
      failed++;
    }
  } else {
    log('ERROR', '.env file not found!');
    log('INFO', 'Create .env file with BOT_TOKEN, GITHUB_TOKEN, etc.');
    failed++;
  }
  
  // ============================================
  // TEST 2: Folder Structure
  // ============================================
  log('TEST', 'Checking Folder Structure');
  
  const folders = ['lua_files', 'fix_files', 'online_fix', 'logs'];
  let folderError = false;
  
  for (const folder of folders) {
    if (!fs.existsSync(folder)) {
      log('WARN', `Folder missing: ${folder}`, 'Creating...');
      fs.mkdirSync(folder, { recursive: true });
    }
  }
  
  if (!folderError) {
    log('SUCCESS', 'All required folders exist or created', 
      `Folders: ${folders.join(', ')}`);
    passed++;
  }
  
  // ============================================
  // TEST 3: Database Files
  // ============================================
  log('TEST', 'Checking Database Files');
  
  const dbFile = 'database.json';
  const cacheFile = 'game_info_cache.json';
  
  if (fs.existsSync(dbFile) && fs.existsSync(cacheFile)) {
    try {
      const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
      const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      
      log('SUCCESS', 'Database files are valid JSON',
        `Games in DB: ${Object.keys(db.games || {}).length}, ` +
        `Cached games: ${Object.keys(cache).length}`);
      passed++;
    } catch (e) {
      log('ERROR', 'Database files are corrupted!', e.message);
      failed++;
    }
  } else {
    log('INFO', 'Database files will be created on first run');
    passed++;
  }
  
  // ============================================
  // TEST 4: Lua Files
  // ============================================
  log('TEST', 'Scanning Lua Files');
  
  if (fs.existsSync('lua_files')) {
    const luaFiles = fs.readdirSync('lua_files').filter(f => f.endsWith('.lua'));
    
    if (luaFiles.length > 0) {
      log('SUCCESS', `Found ${luaFiles.length} Lua files`,
        `Examples: ${luaFiles.slice(0, 3).join(', ')}`);
      passed++;
    } else {
      log('WARN', 'No Lua files found in lua_files/ folder');
    }
  }
  
  // ============================================
  // TEST 5: Online-Fix Files
  // ============================================
  log('TEST', 'Scanning Online-Fix Files');
  
  if (fs.existsSync('online_fix')) {
    const files = fs.readdirSync('online_fix')
      .filter(f => /\.(zip|rar|7z)$/i.test(f));
    
    if (files.length > 0) {
      log('SUCCESS', `Found ${files.length} Online-Fix files`,
        `Examples: ${files.slice(0, 3).join(', ')}`);
      
      // Check naming convention
      const badNames = files.filter(f => !f.includes('online-fix') && !f.includes('onlinefix'));
      if (badNames.length > 0) {
        log('WARN', `${badNames.length} files don't follow naming convention`,
          'Name should include "online-fix": ' + badNames.slice(0, 2).join(', '));
      }
      
      passed++;
    } else {
      log('INFO', 'No Online-Fix files found (this is optional)');
      passed++;
    }
  }
  
  // ============================================
  // TEST 6: Steam API Connectivity
  // ============================================
  log('TEST', 'Testing Steam API Connectivity');
  
  try {
    const response = await axios.get('https://store.steampowered.com/api/appdetails?appids=1623730', {
      timeout: 5000
    });
    
    if (response.status === 200 && response.data[1623730]) {
      const gameName = response.data[1623730].data.name;
      log('SUCCESS', 'Steam API is working', `Test game: ${gameName}`);
      passed++;
    } else {
      log('ERROR', 'Steam API returned unexpected response');
      failed++;
    }
  } catch (error) {
    log('ERROR', 'Cannot reach Steam API', error.message);
    failed++;
  }
  
  // ============================================
  // TEST 7: SteamDB Fallback
  // ============================================
  log('TEST', 'Testing SteamDB Fallback');
  
  try {
    const response = await axios.get('https://steamdb.info/app/1623730/', {
      timeout: 5000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    if (response.status === 200 && response.data.includes('Palworld')) {
      log('SUCCESS', 'SteamDB fallback is working', 'Can fetch game names from SteamDB');
      passed++;
    } else {
      log('WARN', 'SteamDB may have changed format');
    }
  } catch (error) {
    log('WARN', 'Cannot reach SteamDB', 'This is optional - Steam API is primary');
  }
  
  // ============================================
  // TEST 8: Node Modules
  // ============================================
  log('TEST', 'Checking Node Modules');
  
  const required_modules = ['discord.js', 'axios', 'dotenv', 'express'];
  let all_modules_ok = true;
  
  for (const module of required_modules) {
    try {
      require(module);
    } catch (e) {
      log('ERROR', `Module '${module}' not found!`, 'Run: npm install');
      all_modules_ok = false;
      failed++;
    }
  }
  
  if (all_modules_ok) {
    log('SUCCESS', 'All required Node modules are installed');
    passed++;
  }
  
  // ============================================
  // TEST 9: Package.json
  // ============================================
  log('TEST', 'Checking package.json');
  
  try {
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    if (pkg.name && pkg.version && pkg.dependencies) {
      log('SUCCESS', `Bot v${pkg.version}`, `Name: ${pkg.name}`);
      passed++;
    }
  } catch (e) {
    log('ERROR', 'Invalid package.json', e.message);
    failed++;
  }
  
  // ============================================
  // TEST 10: Documentation
  // ============================================
  log('TEST', 'Checking Documentation');
  
  const docs = ['README.md', 'ONLINE_FIX_GUIDE_VI.md'];
  let docsOk = true;
  
  for (const doc of docs) {
    if (!fs.existsSync(doc)) {
      log('WARN', `Documentation missing: ${doc}`);
      docsOk = false;
    }
  }
  
  if (docsOk) {
    log('SUCCESS', 'All documentation files present');
    passed++;
  } else {
    log('INFO', 'Documentation files will help with setup');
  }
  
  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n' + '='.repeat(70));
  console.log('📊 TEST RESULTS');
  console.log('='.repeat(70));
  
  const total = passed + failed;
  const percentage = Math.round((passed / total) * 100);
  
  console.log(`${colors.green}✅ Passed: ${passed}/${total}${colors.reset}`);
  console.log(`${colors.red}❌ Failed: ${failed}/${total}${colors.reset}`);
  console.log(`📈 Success Rate: ${percentage}%`);
  
  if (percentage === 100) {
    console.log(`\n${colors.green}🎉 All tests passed! Bot is ready to run!${colors.reset}`);
    console.log(`\n${colors.cyan}Start bot with:${colors.reset}`);
    console.log(`  npm start`);
    console.log(`  or`);
    console.log(`  node lua_discord_bot.js`);
  } else if (percentage >= 80) {
    console.log(`\n${colors.yellow}⚠️  Bot is mostly ready, but fix the ${failed} issue(s) above${colors.reset}`);
  } else {
    console.log(`\n${colors.red}❌ Please fix the issues above before running the bot${colors.reset}`);
  }
  
  console.log('\n' + '='.repeat(70) + '\n');
  
  process.exit(percentage === 100 ? 0 : 1);
}

// Run main
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
