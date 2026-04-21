require('dotenv').config();
const mongoose = require('mongoose');
const Game = require('./models/Game');
const SteamDBSizeService = require('./services/SteamDBSizeService');
const fs = require('fs');

const CONFIG = {
  BATCH_SIZE: 50,
  DELAY_BETWEEN_REQUESTS: 3000, // 3s delay
  DELAY_BETWEEN_BATCHES: 10000, // 10s pause
  PROGRESS_FILE: './size-sync-progress.json'
};

class SizeSyncProgress {
  constructor() {
    this.data = this.load();
  }

  load() {
    if (fs.existsSync(CONFIG.PROGRESS_FILE)) {
      try {
        return JSON.parse(fs.readFileSync(CONFIG.PROGRESS_FILE, 'utf8'));
      } catch (error) {
        console.log('⚠️  Could not load progress');
      }
    }
    return {
      currentBatch: 0,
      processed: 0,
      success: 0,
      failed: 0,
      startTime: Date.now()
    };
  }

  save() {
    fs.writeFileSync(CONFIG.PROGRESS_FILE, JSON.stringify(this.data, null, 2));
  }

  update(updates) {
    Object.assign(this.data, updates);
    this.save();
  }
}

const progress = new SizeSyncProgress();

async function updateGameSize(game) {
  try {
    const size = await SteamDBSizeService.getGameSize(game.appId);
    
    await Game.findByIdAndUpdate(game._id, {
      size: size,
      sizeUpdated: new Date()
    });

    return true;
  } catch (error) {
    console.error(`  ❌ Error: ${error.message}`);
    return false;
  }
}

async function processBatch(games, batchNumber, totalBatches) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📦 BATCH ${batchNumber}/${totalBatches}`);
  console.log(`${'='.repeat(60)}\n`);

  for (let i = 0; i < games.length; i++) {
    const game = games[i];
    const gameNumber = (batchNumber - 1) * CONFIG.BATCH_SIZE + i + 1;
    
    process.stdout.write(`[${gameNumber}/${progress.totalGames}] ${game.title || game.appId}... `);

    const success = await updateGameSize(game);
    
    if (success) {
      console.log('✅');
      progress.data.success++;
    } else {
      console.log('❌');
      progress.data.failed++;
    }

    progress.data.processed++;

    if (i < games.length - 1) {
      await sleep(CONFIG.DELAY_BETWEEN_REQUESTS);
    }
  }

  progress.update({
    currentBatch: batchNumber,
    lastBatchTime: Date.now()
  });

  const elapsed = Math.floor((Date.now() - progress.data.startTime) / 1000);
  const rate = progress.data.processed / (elapsed / 60);
  const remaining = progress.totalGames - progress.data.processed;
  const eta = Math.floor(remaining / rate);

  console.log(`\n📊 Progress: ${progress.data.processed}/${progress.totalGames}`);
  console.log(`   Speed: ${rate.toFixed(1)} games/min`);
  console.log(`   ETA: ~${Math.floor(eta / 60)}h ${eta % 60}m`);
}

async function main() {
  console.log('🚀 Starting Size Sync for All Games\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  const totalGames = await Game.countDocuments();
  progress.totalGames = totalGames;
  
  console.log(`📊 Found ${totalGames} games`);

  const totalBatches = Math.ceil(totalGames / CONFIG.BATCH_SIZE);
  const startBatch = progress.data.currentBatch;

  console.log(`📦 Total batches: ${totalBatches}`);
  console.log(`🔄 Starting from batch: ${startBatch + 1}\n`);

  if (startBatch === 0) {
    console.log('⚠️  This will take several hours. Press Ctrl+C to cancel...');
    await sleep(3000);
  }

  for (let batchNum = startBatch; batchNum < totalBatches; batchNum++) {
    const skip = batchNum * CONFIG.BATCH_SIZE;
    
    const games = await Game.find()
      .skip(skip)
      .limit(CONFIG.BATCH_SIZE)
      .lean();

    if (games.length === 0) break;

    await processBatch(games, batchNum + 1, totalBatches);

    if (batchNum < totalBatches - 1) {
      console.log(`\n⏸️  Pausing ${CONFIG.DELAY_BETWEEN_BATCHES}ms...\n`);
      await sleep(CONFIG.DELAY_BETWEEN_BATCHES);
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 SIZE SYNC COMPLETE!');
  console.log('='.repeat(60));
  console.log(`✅ Success: ${progress.data.success}`);
  console.log(`❌ Failed: ${progress.data.failed}`);
  console.log(`📊 Total: ${progress.data.processed}`);
  
  const totalTime = Date.now() - progress.data.startTime;
  const hours = Math.floor(totalTime / 1000 / 60 / 60);
  const minutes = Math.floor((totalTime / 1000 / 60) % 60);
  console.log(`⏱️  Total time: ${hours}h ${minutes}m`);
  console.log('='.repeat(60));

  if (fs.existsSync(CONFIG.PROGRESS_FILE)) {
    fs.unlinkSync(CONFIG.PROGRESS_FILE);
  }

  await SteamDBSizeService.closeBrowser();
  await mongoose.disconnect();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Interrupted! Progress saved.');
  console.log(`📊 Processed: ${progress.data.processed} games`);
  await SteamDBSizeService.closeBrowser();
  process.exit(0);
});

main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
