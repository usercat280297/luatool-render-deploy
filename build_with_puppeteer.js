// Build index với Puppeteer (bypass Cloudflare)
// Cài đặt: npm install puppeteer
const fs = require('fs');
const puppeteer = require('puppeteer');

async function buildIndexWithBrowser() {
  console.log('🚀 Starting browser...\n');
  
  const browser = await puppeteer.launch({
    headless: false, // Hiển thị browser để bạn thấy
    defaultViewport: null
  });
  
  const page = await browser.newPage();
  
  // Load existing index
  let index = {};
  if (fs.existsSync('game_names_index.json')) {
    index = JSON.parse(fs.readFileSync('game_names_index.json', 'utf8'));
    console.log(`📦 Loaded ${Object.keys(index).length} existing names\n`);
  }
  
  // Load games list
  const gamesList = fs.readFileSync('games_list_simple.txt', 'utf8')
    .split('\n')
    .filter(Boolean)
    .map(id => id.trim());
  
  console.log(`📋 Total games: ${gamesList.length}\n`);
  console.log('⏳ Fetching names from SteamDB...\n');
  
  let success = 0, failed = 0, skipped = 0;
  
  for (let i = 0; i < gamesList.length; i++) {
    const appId = gamesList[i];
    
    // Skip if already have
    if (index[appId]) {
      skipped++;
      if (i % 100 === 0) {
        console.log(`[${i+1}/${gamesList.length}] ✅ ${success} | ❌ ${failed} | ⏭️ ${skipped}`);
      }
      continue;
    }
    
    try {
      await page.goto(`https://steamdb.info/app/${appId}/`, {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      });
      
      // Extract game name
      const name = await page.evaluate(() => {
        const title = document.querySelector('title');
        if (title) {
          return title.textContent.replace(/\s*-\s*SteamDB.*$/i, '').trim();
        }
        return null;
      });
      
      if (name && name.length > 2) {
        index[appId] = name;
        success++;
        console.log(`[${i+1}/${gamesList.length}] ${appId}: ${name}`);
      } else {
        failed++;
        console.log(`[${i+1}/${gamesList.length}] ${appId}: ❌ FAILED`);
      }
      
      // Save checkpoint every 50 games
      if ((success + failed) % 50 === 0) {
        fs.writeFileSync('game_names_index.json', JSON.stringify(index, null, 2));
        console.log(`\n💾 Checkpoint: ${Object.keys(index).length} games\n`);
      }
      
      // Rate limit
      await page.waitForTimeout(300);
      
    } catch (error) {
      failed++;
      console.log(`[${i+1}/${gamesList.length}] ${appId}: ❌ ERROR - ${error.message}`);
    }
  }
  
  // Final save
  fs.writeFileSync('game_names_index.json', JSON.stringify(index, null, 2));
  
  console.log(`\n✅ DONE!`);
  console.log(`Total: ${Object.keys(index).length} games`);
  console.log(`Success: ${success} | Failed: ${failed} | Skipped: ${skipped}`);
  
  await browser.close();
}

buildIndexWithBrowser().catch(console.error);
