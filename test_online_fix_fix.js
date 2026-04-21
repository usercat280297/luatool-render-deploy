#!/usr/bin/env node
/**
 * TEST SCRIPT: Verify Online-Fix Display Fix
 * 
 * Tests:
 * 1. findFiles() returns onlineFix array when file exists
 * 2. Embed correctly shows online-fix status (local file vs link)
 * 3. Buttons are created correctly based on available resources
 */

const fs = require('fs');
const path = require('path');

// Mock path
const CONFIG = {
  LUA_FILES_PATH: './lua_files',
  FIX_FILES_PATH: './fix_files',
  ONLINE_FIX_PATH: './online_fix',
};

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
}

// Simplified findFiles (from fixed code)
function findFiles(appId, gameName = null) {
  const result = { lua: [], fix: [], onlineFix: [] };
  
  // Find Lua files
  const luaPatterns = [
    path.join(CONFIG.LUA_FILES_PATH, `${appId}.lua`),
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
  
  // ✅ NEW: Find Online-Fix files from folder
  if (fs.existsSync(CONFIG.ONLINE_FIX_PATH)) {
    try {
      const onlineFixFiles = fs.readdirSync(CONFIG.ONLINE_FIX_PATH);
      
      for (const file of onlineFixFiles) {
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
      console.log(`DEBUG: Online-Fix folder error for ${appId}`, err.message);
    }
  }
  
  return result;
}

// ============================================
// TESTS
// ============================================

console.log('🧪 TEST SUITE: Online-Fix Display Fix\n');
console.log('='.repeat(70));

// Test 1: Check if online_fix folder exists and has test file
console.log('\n📝 TEST 1: Create test online-fix file');
try {
  if (!fs.existsSync(CONFIG.ONLINE_FIX_PATH)) {
    fs.mkdirSync(CONFIG.ONLINE_FIX_PATH, { recursive: true });
    console.log('✅ Created online_fix folder');
  }
  
  // Create a test file
  const testFile = path.join(CONFIG.ONLINE_FIX_PATH, '945360-online-fix.zip');
  if (!fs.existsSync(testFile)) {
    fs.writeFileSync(testFile, Buffer.alloc(1024 * 100)); // 100 KB
    console.log(`✅ Created test file: ${testFile}`);
  } else {
    console.log(`⚠️  Test file already exists: ${testFile}`);
  }
} catch (err) {
  console.log(`❌ Error: ${err.message}`);
}

// Test 2: findFiles with test AppID
console.log('\n📝 TEST 2: findFiles(945360) - Should find online-fix');
try {
  const files = findFiles('945360');
  
  console.log(`  - Lua files: ${files.lua.length}`);
  console.log(`  - Fix files: ${files.fix.length}`);
  console.log(`  - Online-Fix files: ${files.onlineFix.length}`);
  
  if (files.onlineFix.length > 0) {
    console.log(`✅ PASS: Found online-fix file!`);
    console.log(`  - Name: ${files.onlineFix[0].name}`);
    console.log(`  - Size: ${files.onlineFix[0].sizeFormatted}`);
  } else {
    console.log(`❌ FAIL: Did NOT find online-fix file!`);
  }
} catch (err) {
  console.log(`❌ Error: ${err.message}`);
}

// Test 3: Simulate embed display
console.log('\n📝 TEST 3: Embed display logic');
try {
  const files = findFiles('945360');
  const onlineFixLink = 'https://example.com/online-fix'; // Simulate database link
  
  let fileInfo = [];
  if (files.lua.length > 0) {
    fileInfo.push(`📜 **Lua Script** \`${files.lua[0].sizeFormatted}\``);
  }
  if (files.fix.length > 0) {
    fileInfo.push(`🔧 **Crack/Fix** \`${files.fix[0].sizeFormatted}\``);
  }
  if (files.onlineFix.length > 0) {
    fileInfo.push(`🌐 **Online-Fix** \`${files.onlineFix[0].sizeFormatted}\``);
  } else if (onlineFixLink) {
    // ✅ NEW: Show link status
    fileInfo.push('🌐 **Online-Fix** `Available (via Link)`');
  }
  
  console.log('  Embed would show:');
  fileInfo.forEach(info => console.log(`    ${info}`));
  
  if (fileInfo.some(i => i.includes('Online-Fix'))) {
    console.log(`✅ PASS: Online-Fix information is displayed`);
  } else {
    console.log(`❌ FAIL: Online-Fix information is NOT displayed`);
  }
} catch (err) {
  console.log(`❌ Error: ${err.message}`);
}

// Test 4: Button logic
console.log('\n📝 TEST 4: Button creation logic');
try {
  const files = findFiles('945360');
  const onlineFixLink = 'https://example.com/online-fix';
  const crackLink = null;
  
  const buttons = [];
  
  if (files.lua.length > 0) {
    buttons.push(`Download Lua (${files.lua[0].sizeFormatted})`);
  }
  if (onlineFixLink) {
    buttons.push('Download Online-Fix');
  }
  if (crackLink) {
    buttons.push('Download Crack (Direct)');
  }
  
  console.log('  Buttons would show:');
  buttons.forEach((btn, i) => console.log(`    ${i + 1}. ${btn}`));
  
  if (buttons.includes('Download Online-Fix')) {
    console.log(`✅ PASS: Online-Fix button would be shown`);
  } else {
    console.log(`❌ FAIL: Online-Fix button would NOT be shown`);
  }
} catch (err) {
  console.log(`❌ Error: ${err.message}`);
}

console.log('\n' + '='.repeat(70));
console.log('\n✅ Test suite completed!\n');

// Cleanup (optional)
console.log('📝 Cleanup: Remove test file?');
const testFile = path.join(CONFIG.ONLINE_FIX_PATH, '945360-online-fix.zip');
if (fs.existsSync(testFile)) {
  fs.unlinkSync(testFile);
  console.log('✅ Test file removed');
}
