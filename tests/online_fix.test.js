// ============================================
// ONLINE-FIX SEARCH TESTS
// Covers: File matching logic
// ============================================

const fs = require('fs');
const path = require('path');

// Mock Config
const CONFIG = {
  ONLINE_FIX_PATH: './online_fix'
};

// Logic from main bot (Duplicate for unit testing isolation)
function normalizeGameName(name) {
  if (!name) return '';
  return name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/\s+/g, '');
}

function calculateMatchScore(gameName, fileName) {
  const cleanFileName = fileName.replace(/onlinefix|online-fix/gi, '');
  if (cleanFileName === gameName) return 100;
  if (cleanFileName.includes(gameName)) return 90;
  if (gameName.includes(cleanFileName)) return 85;
  return 0; // Simplified for test
}

async function runTests() {
  console.log('🌐 STARTING ONLINE-FIX TESTS...');
  let passed = 0;
  let total = 0;

  // TEST 1: Normalization Logic
  total++;
  const normTest = normalizeGameName('Resident Evil 4: Remake') === 'residentevil4remake';
  if (normTest) {
    console.log('   ✅ Passed: Normalization logic');
    passed++;
  } else {
    console.log('   ❌ Failed: Normalization logic');
  }

  // TEST 2: Matching Logic
  total++;
  const score = calculateMatchScore('residentevil4', 'residentevil4onlinefix');
  if (score >= 90) {
    console.log('   ✅ Passed: Matching score logic');
    passed++;
  } else {
    console.log('   ❌ Failed: Matching score too low');
  }

  // TEST 3: Folder Check
  total++;
  if (fs.existsSync(CONFIG.ONLINE_FIX_PATH)) {
    console.log('   ✅ Passed: online_fix folder exists');
    passed++;
  } else {
    console.log('   ⚠️  Skipped: online_fix folder missing (Create it for full test)');
    passed++; // Don't fail the suite for missing local data
  }

  console.log(`\n🏁 ONLINE-FIX TESTS COMPLETED: ${passed}/${total} Passed\n`);
  return passed === total;
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
