require('dotenv').config();
const mongoose = require('mongoose');
const Game = require('./models/Game');
const steamGridDB = require('./services/SteamGridDBService');
const fs = require('fs');

// ========================================
// CONFIGURATION
// ========================================
const CONFIG = {
  BATCH_SIZE: 100,              // Process 100 games at a time
  DELAY_BETWEEN_REQUESTS: 350,  // 350ms delay = ~170 requests/min (under 200 limit)
  DELAY_BETWEEN_BATCHES: 5000,  // 5 second pause between batches
  PROGRESS_FILE: './sync-progress.json',
  RESUME: true                  // Set to false to start fresh
};

// ========================================
// PROGRESS TRACKING
// ========================================
class ProgressTracker {
  constructor() {
    this.data = this.load();
  }

  load() {
    if (CONFIG.RESUME && fs.existsSync(CONFIG.PROGRESS_FILE)) {
      try {
        const data = JSON.parse(fs.readFileSync(CONFIG.PROGRESS_FILE, 'utf8'));
        console.log(`📂 Resuming from batch ${data.currentBatch + 1}`);
        return data;
      } catch (error) {
        console.log('⚠️  Could not load progress, starting fresh');
      }
    }
    return {
      currentBatch: 0,
      processedGames: 0,
      successCount: 0,
      fallbackCount: 0,
      errorCount: 0,
      startTime: Date.now(),
      lastBatchTime: Date.now()
    };
  }

  save() {
    fs.writeFileSync(CONFIG.PROGRESS_FILE, JSON.stringify(this.data, null, 2));
  }

  update(updates) {
    Object.assign(this.data, updates);
    this.save();
  }

  getStats() {
    const elapsed = Date.now() - this.data.startTime;
    const rate = this.data.processedGames / (elapsed / 1000 / 60); // games per minute
    const remaining = this.totalGames - this.data.processedGames;
    const eta = remaining / rate; // minutes

    return {
      elapsed: Math.floor(elapsed / 1000),
      rate: rate.toFixed(1),
      eta: Math.floor(eta)
    };
  }
}

const progress = new ProgressTracker();

// ========================================
// IMAGE UPDATE FUNCTIONS
// ========================================
async function updateGameImages(game) {
  try {
    // Fetch SteamGridDB images
    const sgdbImages = await steamGridDB.getAllImagesBySteamId(game.appId);
    
    const images = {
      cover: sgdbImages?.cover || null,
      coverThumb: sgdbImages?.coverThumb || null,
      hero: sgdbImages?.hero || null,
      heroThumb: sgdbImages?.heroThumb || null,
      logo: sgdbImages?.logo || null,
      logoThumb: sgdbImages?.logoThumb || null,
      icon: sgdbImages?.icon || null,
      iconThumb: sgdbImages?.iconThumb || null,
      
      // Steam CDN fallbacks
      steamHeader: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/header.jpg`,
      steamLibrary: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/library_hero.jpg`,
      steamBackground: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/page_bg_generated_v6b.jpg`,
      screenshots: generateSteamScreenshots(game.appId, 6)
    };

    // Update game in database
    await Game.findByIdAndUpdate(game._id, { 
      images,
      updatedAt: new Date()
    });

    const hasSGDBImages = sgdbImages && (sgdbImages.cover || sgdbImages.hero || sgdbImages.logo);
    return hasSGDBImages ? 'success' : 'fallback';
  } catch (error) {
    console.error(`  ❌ Error updating ${game.appId}:`, error.message);
    
    // Still add Steam fallbacks even if error
    try {
      await Game.findByIdAndUpdate(game._id, {
        images: {
          steamHeader: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/header.jpg`,
          steamLibrary: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/library_hero.jpg`,
          steamBackground: `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/page_bg_generated_v6b.jpg`,
          screenshots: generateSteamScreenshots(game.appId, 6)
        }
      });
    } catch (fallbackError) {
      // Silent fail
    }
    
    return 'error';
  }
}

function generateSteamScreenshots(appId, count = 6) {
  const screenshots = [];
  for (let i = 0; i < count; i++) {
    screenshots.push(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/ss_${i}.jpg`);
  }
  return screenshots;
}

// ========================================
// BATCH PROCESSING
// ========================================
async function processBatch(games, batchNumber, totalBatches) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📦 BATCH ${batchNumber}/${totalBatches}`);
  console.log(`   Processing ${games.length} games`);
  console.log(`${'='.repeat(60)}\n`);

  let batchSuccess = 0;
  let batchFallback = 0;
  let batchError = 0;

  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const gameNumber = (batchNumber - 1) * CONFIG.BATCH_SIZE + i + 1;
    
    process.stdout.write(`[${gameNumber}/${progress.totalGames}] ${game.title || game.appId}... `);

    const result = await updateGameImages(game);
    
    if (result === 'success') {
      console.log('✅');
      batchSuccess++;
      progress.data.successCount++;
    } else if (result === 'fallback') {
      console.log('⚠️  (Steam fallback)');
      batchFallback++;
      progress.data.fallbackCount++;
    } else {
      console.log('❌');
      batchError++;
      progress.data.errorCount++;
    }

    progress.data.processedGames++;

    // Rate limiting: wait between requests
    if (i < games.length - 1) {
      await sleep(CONFIG.DELAY_BETWEEN_REQUESTS);
    }
  }

  // Save progress after each batch
  progress.update({
    currentBatch: batchNumber,
    lastBatchTime: Date.now()
  });

  // Batch summary
  console.log(`\n📊 Batch ${batchNumber} Summary:`);
  console.log(`   ✅ Success: ${batchSuccess}`);
  console.log(`   ⚠️  Fallback: ${batchFallback}`);
  console.log(`   ❌ Error: ${batchError}`);

  const stats = progress.getStats();
  console.log(`\n⏱️  Overall Progress:`);
  console.log(`   Processed: ${progress.data.processedGames}/${progress.totalGames}`);
  console.log(`   Speed: ${stats.rate} games/min`);
  console.log(`   Elapsed: ${Math.floor(stats.elapsed / 60)}m ${stats.elapsed % 60}s`);
  console.log(`   ETA: ~${Math.floor(stats.eta / 60)}h ${stats.eta % 60}m`);
}

// ========================================
// MAIN EXECUTION
// ========================================
async function main() {
  console.log('🚀 Starting Image Sync for 30,000 Games\n');
  console.log('⚙️  Configuration:');
  console.log(`   Batch size: ${CONFIG.BATCH_SIZE}`);
  console.log(`   Delay between requests: ${CONFIG.DELAY_BETWEEN_REQUESTS}ms`);
  console.log(`   Delay between batches: ${CONFIG.DELAY_BETWEEN_BATCHES}ms`);
  console.log(`   Resume: ${CONFIG.RESUME ? 'Yes' : 'No'}`);
  console.log('');

  // Connect to MongoDB
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  // Get total count
  const totalGames = await Game.countDocuments();
  progress.totalGames = totalGames;
  
  console.log(`📊 Found ${totalGames} games in database`);

  // Calculate batches
  const totalBatches = Math.ceil(totalGames / CONFIG.BATCH_SIZE);
  const startBatch = progress.data.currentBatch;

  console.log(`📦 Total batches: ${totalBatches}`);
  console.log(`🔄 Starting from batch: ${startBatch + 1}\n`);

  // Confirm before starting
  if (startBatch === 0) {
    console.log('⚠️  This will process ALL games. Press Ctrl+C to cancel...');
    await sleep(3000);
  }

  // Process each batch
  for (let batchNum = startBatch; batchNum < totalBatches; batchNum++) {
    const skip = batchNum * CONFIG.BATCH_SIZE;
    
    // Fetch batch
    const games = await Game.find()
      .skip(skip)
      .limit(CONFIG.BATCH_SIZE)
      .lean();

    if (games.length === 0) break;

    // Process batch
    await processBatch(games, batchNum + 1, totalBatches);

    // Pause between batches (except last one)
    if (batchNum < totalBatches - 1) {
      console.log(`\n⏸️  Pausing ${CONFIG.DELAY_BETWEEN_BATCHES}ms before next batch...\n`);
      await sleep(CONFIG.DELAY_BETWEEN_BATCHES);
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('🎉 SYNC COMPLETE!');
  console.log('='.repeat(60));
  console.log(`✅ Success (SteamGridDB): ${progress.data.successCount}`);
  console.log(`⚠️  Fallback (Steam CDN): ${progress.data.fallbackCount}`);
  console.log(`❌ Errors: ${progress.data.errorCount}`);
  console.log(`📊 Total processed: ${progress.data.processedGames}`);
  
  const totalTime = Date.now() - progress.data.startTime;
  const hours = Math.floor(totalTime / 1000 / 60 / 60);
  const minutes = Math.floor((totalTime / 1000 / 60) % 60);
  console.log(`⏱️  Total time: ${hours}h ${minutes}m`);
  console.log('='.repeat(60));

  // Cleanup
  if (fs.existsSync(CONFIG.PROGRESS_FILE)) {
    fs.unlinkSync(CONFIG.PROGRESS_FILE);
    console.log('\n🗑️  Cleaned up progress file');
  }

  await mongoose.disconnect();
  console.log('🔌 Disconnected from MongoDB');
}

// ========================================
// UTILITIES
// ========================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Interrupted! Progress has been saved.');
  console.log(`📂 Resume by running the script again.`);
  console.log(`📊 Processed: ${progress.data.processedGames} games`);
  process.exit(0);
});

// Error handling
process.on('unhandledRejection', (error) => {
  console.error('\n❌ Unhandled error:', error);
  console.log('📂 Progress saved. You can resume by running the script again.');
  process.exit(1);
});

// Run
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
