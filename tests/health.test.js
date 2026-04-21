// ============================================
// HEALTH CHECK TESTS
// Covers: Environment, Dependencies, Syntax
// ============================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');

async function runTests() {
  console.log('🏥 STARTING HEALTH TESTS...');
  let passed = 0;
  let total = 0;

  // TEST 1: Check Environment Variables
  total++;
  const requiredEnvs = ['BOT_TOKEN', 'GITHUB_TOKEN', 'STEAM_API_KEY'];
  const missingEnvs = requiredEnvs.filter(env => !process.env[env]);
  
  if (missingEnvs.length === 0) {
    console.log('   ✅ Passed: All required ENV variables present');
    passed++;
  } else {
    console.log(`   ❌ Failed: Missing ENVs: ${missingEnvs.join(', ')}`);
  }

  // TEST 2: Check Folder Structure
  total++;
  const requiredFolders = ['src', 'scripts', 'data', 'docs', 'tests'];
  const missingFolders = requiredFolders.filter(f => !fs.existsSync(path.join(__dirname, '..', f)));

  if (missingFolders.length === 0) {
    console.log('   ✅ Passed: Project structure is valid');
    passed++;
  } else {
    console.log(`   ❌ Failed: Missing folders: ${missingFolders.join(', ')}`);
  }

  // TEST 3: Syntax Check (Main Bot File)
  total++;
  try {
    const botPath = path.join(__dirname, '../src/lua_discord_bot.js');
    const content = fs.readFileSync(botPath, 'utf8');
    // Basic syntax check: Ensure it has critical imports
    if (content.includes("require('discord.js')") && content.includes("require('dotenv')")) {
      console.log('   ✅ Passed: Main bot file syntax looks valid');
      passed++;
    } else {
      console.log('   ❌ Failed: Main bot file missing critical requires');
    }
  } catch (error) {
    console.log(`   ❌ Failed: Could not read bot file: ${error.message}`);
  }

  console.log(`\n🏁 HEALTH TESTS COMPLETED: ${passed}/${total} Passed\n`);
  return passed === total;
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
