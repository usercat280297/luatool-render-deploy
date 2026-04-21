// ============================================
// UI & EMBED TESTS
// Covers: Embed generation, formatting
// ============================================

const { createBeautifulGameEmbed, COLORS } = require('../src/embed_styles');

// Mock Data
const mockGameInfo = {
  name: 'Test Game: Edition',
  price: '500.000₫',
  sizeFormatted: '50 GB',
  sizeType: 'FULL',
  lastUpdate: '2024-01-01',
  dlcCount: 5,
  languageCount: 10,
  rating: 'Very Positive',
  reviewCount: 1000,
  recommendations: 1000,
  developers: ['Test Dev'],
  publisher: { name: 'Test Pub' },
  headerImage: 'http://example.com/image.jpg',
  shortDescription: 'A test game description.',
  drm: {
    severity: 'critical',
    isDRMFree: false,
    type: 'Denuvo',
    icon: '🚫'
  },
  isEAGame: false,
  isEarlyAccess: false
};

const mockFiles = {
  lua: [],
  fix: [],
  onlineFix: [{ sizeFormatted: '100 MB' }]
};

async function runTests() {
  console.log('🎨 STARTING UI TESTS...');
  let passed = 0;
  let total = 0;

  // TEST 1: Embed Creation
  total++;
  try {
    console.log('\n[1/2] Testing Embed Generation...');
    const embed = await createBeautifulGameEmbed(123456, mockGameInfo, mockFiles);
    
    // Check if critical fields exist
    const hasTitle = embed.data.title.includes('Test Game');
    const hasColor = embed.data.color === COLORS.critical;
    const hasFields = embed.data.fields.length > 0;

    if (hasTitle && hasColor && hasFields) {
      console.log('   ✅ Passed: Embed structure is valid');
      passed++;
    } else {
      console.log('   ❌ Failed: Missing title, color, or fields');
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  // TEST 2: Mobile Optimization Check
  total++;
  try {
    console.log('\n[2/2] Testing Mobile Layout Optimization...');
    const embed = await createBeautifulGameEmbed(123456, mockGameInfo, mockFiles);
    
    // Check for code blocks in values (Mobile high contrast)
    const priceField = embed.data.fields.find(f => f.name.includes('Price'));
    const isOptimized = priceField && priceField.value.includes('`');

    if (isOptimized) {
      console.log('   ✅ Passed: Mobile optimization (code blocks) detected');
      passed++;
    } else {
      console.log('   ❌ Failed: No code blocks found in fields');
    }
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
  }

  console.log(`\n🏁 UI TESTS COMPLETED: ${passed}/${total} Passed\n`);
  return passed === total;
}

if (require.main === module) {
  runTests();
}

module.exports = { runTests };
