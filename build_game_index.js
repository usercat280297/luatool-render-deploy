// Build game name index from SteamDB
const fs = require('fs');
const axios = require('axios');

async function getGameName(appId) {
  try {
    const response = await axios.get(`https://steamdb.info/app/${appId}/`, {
      timeout: 5000,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer': 'https://steamdb.info/'
      }
    });
    const match = response.data.match(/<title>([^<]+)<\/title>/i);
    if (match) {
      return match[1].replace(/\s*-\s*SteamDB.*$/i, '').trim();
    }
  } catch (error) {
    return null;
  }
}

async function buildIndex() {
  const gamesList = fs.readFileSync('games_list_simple.txt', 'utf8').split('\n').filter(Boolean);
  let index = {};
  
  // Load existing index
  if (fs.existsSync('game_names_index.json')) {
    index = JSON.parse(fs.readFileSync('game_names_index.json', 'utf8'));
    console.log(`Loaded ${Object.keys(index).length} existing names`);
  }
  
  console.log(`Building index for ${gamesList.length} games...\n`);
  
  let success = 0;
  let failed = 0;
  let skipped = 0;
  
  for (let i = 0; i < gamesList.length; i++) {
    const appId = gamesList[i].trim();
    if (!appId) continue;
    
    // Skip if already have
    if (index[appId]) {
      skipped++;
      if (i % 100 === 0) {
        console.log(`[${i+1}/${gamesList.length}] Progress: ${success} success, ${failed} failed, ${skipped} skipped`);
      }
      continue;
    }
    
    const name = await getGameName(appId);
    if (name) {
      index[appId] = name;
      success++;
      console.log(`[${i+1}/${gamesList.length}] ${appId}: ${name}`);
    } else {
      failed++;
      console.log(`[${i+1}/${gamesList.length}] ${appId}: FAILED`);
    }
    
    // Save every 50 games
    if ((success + failed) % 50 === 0) {
      fs.writeFileSync('game_names_index.json', JSON.stringify(index, null, 2));
      console.log(`\n💾 Saved checkpoint: ${Object.keys(index).length} games\n`);
    }
    
    // Rate limit
    await new Promise(r => setTimeout(r, 200));
  }
  
  fs.writeFileSync('game_names_index.json', JSON.stringify(index, null, 2));
  console.log(`\n✅ Done! Saved ${Object.keys(index).length} game names.`);
  console.log(`Success: ${success}, Failed: ${failed}, Skipped: ${skipped}`);
}

buildIndex();
