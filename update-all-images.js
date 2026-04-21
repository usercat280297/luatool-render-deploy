require('dotenv').config();
const mongoose = require('mongoose');
const Game = require('./models/Game');
const steamGridDB = require('./services/SteamGridDBService');

async function updateAllImages() {
  try {
    console.log('🔄 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');
    
    // Get games that don't have high-quality images yet
    const games = await Game.find({
      $or: [
        { 'images.cover': { $exists: false } },
        { 'images.cover': null },
        { 'images.cover': '' }
      ]
    }).limit(100);
    
    console.log(`🎮 Found ${games.length} games to update...\n`);
    
    if (games.length === 0) {
      console.log('✅ All games already have images!');
      await mongoose.disconnect();
      return;
    }
    
    let updated = 0;
    let failed = 0;
    let skipped = 0;
    
    for (let i = 0; i < games.length; i++) {
      const game = games[i];
      const progress = `[${i + 1}/${games.length}]`;
      
      try {
        console.log(`${progress} Processing: ${game.title} (${game.appId})`);
        
        const images = await steamGridDB.getAllImagesBySteamId(game.appId);
        
        if (images && (images.cover || images.hero || images.logo || images.icon)) {
          // Build update object with available images
          const updateData = {
            'images.steamHeader': `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/header.jpg`,
            'images.steamLibrary': `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/library_hero.jpg`,
            'images.steamBackground': `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/page_bg_generated_v6b.jpg`
          };
          
          // Add SteamGridDB images if available
          if (images.cover) updateData['images.cover'] = images.cover;
          if (images.coverThumb) updateData['images.coverThumb'] = images.coverThumb;
          if (images.hero) updateData['images.hero'] = images.hero;
          if (images.heroThumb) updateData['images.heroThumb'] = images.heroThumb;
          if (images.logo) updateData['images.logo'] = images.logo;
          if (images.logoThumb) updateData['images.logoThumb'] = images.logoThumb;
          if (images.icon) updateData['images.icon'] = images.icon;
          if (images.iconThumb) updateData['images.iconThumb'] = images.iconThumb;
          
          await Game.findByIdAndUpdate(game._id, updateData);
          
          const sgdbImages = [images.cover, images.hero, images.logo, images.icon].filter(Boolean).length;
          console.log(`  ✅ Updated with ${sgdbImages} SteamGridDB images + Steam fallbacks`);
          updated++;
        } else {
          // Still add Steam fallback images
          await Game.findByIdAndUpdate(game._id, {
            'images.steamHeader': `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/header.jpg`,
            'images.steamLibrary': `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/library_hero.jpg`,
            'images.steamBackground': `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/page_bg_generated_v6b.jpg`
          });
          
          console.log(`  ⚠️  No SteamGridDB images, added Steam fallbacks`);
          skipped++;
        }
        
        // Rate limiting: 200 requests per minute = 300ms between requests
        if (i < games.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 300));
        }
        
      } catch (error) {
        console.error(`  ❌ Error: ${error.message}`);
        failed++;
        
        // Still try to add Steam fallbacks on error
        try {
          await Game.findByIdAndUpdate(game._id, {
            'images.steamHeader': `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/header.jpg`,
            'images.steamLibrary': `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/library_hero.jpg`,
            'images.steamBackground': `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.appId}/page_bg_generated_v6b.jpg`
          });
        } catch (fallbackError) {
          console.error(`  ❌ Fallback update failed: ${fallbackError.message}`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 BATCH UPDATE COMPLETE');
    console.log('='.repeat(50));
    console.log(`✅ Successfully updated: ${updated}`);
    console.log(`⚠️  Steam fallbacks only: ${skipped}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Total processed: ${updated + skipped + failed}`);
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('❌ Script failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the script
console.log('🚀 Starting batch image update...\n');
updateAllImages().catch(console.error);