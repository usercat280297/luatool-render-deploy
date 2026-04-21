const { fetchLuaFromOpenCloud } = require('../src/openlua_scraper');

async function runTests() {
  console.log('☁️ STARTING OPENLUA SCRAPER TESTS...');
  let passed = 0;
  let total = 0;

  // TEST 1: Module Structure
  total++;
  console.log('\n[1/1] Testing Module Structure...');
  if (typeof fetchLuaFromOpenCloud === 'function') {
    console.log('   ✅ Passed: Function exported successfully');
    passed++;
  } else {
    console.log('   ❌ Failed: fetchLuaFromOpenCloud is not a function');
  }

  console.log(`\n🏁 OPENLUA TESTS COMPLETED: ${passed}/${total} Passed\n`);
  return passed === total;
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
