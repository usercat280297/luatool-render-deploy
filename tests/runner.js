// ============================================
// MAIN TEST RUNNER
// Executes all test modules sequentially
// ============================================

const searchTests = require('./search.test');
const uiTests = require('./ui.test');
const onlineFixTests = require('./online_fix.test');
const openLuaTests = require('./openlua.test');
const healthTests = require('./health.test');

async function runAllTests() {
  console.log('🚀 STARTING FULL TEST SUITE\n');
  const startTime = Date.now();
  let passedModules = 0;
  let totalModules = 0;

  // 1. Health Checks
  totalModules++;
  if (await healthTests.runTests()) passedModules++;

  // 2. Search Logic
  totalModules++;
  if (await searchTests.runTests()) passedModules++;

  // 3. UI Generation
  totalModules++;
  if (await uiTests.runTests()) passedModules++;

  // 4. Online Fix Logic
  totalModules++;
  if (await onlineFixTests.runTests()) passedModules++;

  // 5. OpenLua Scraper
  totalModules++;
  if (await openLuaTests.runTests()) passedModules++;

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log('='.repeat(50));
  console.log(`📊 TEST SUMMARY`);
  console.log('='.repeat(50));
  console.log(`Modules Passed: ${passedModules}/${totalModules}`);
  console.log(`Duration: ${duration}s`);
  
  if (passedModules === totalModules) {
    console.log('\n✅ ALL SYSTEMS GO! READY FOR DEPLOYMENT.');
    process.exit(0);
  } else {
    console.log('\n❌ SOME TESTS FAILED. CHECK LOGS.');
    process.exit(1);
  }
}

runAllTests();
