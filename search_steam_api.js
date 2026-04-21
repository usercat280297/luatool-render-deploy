const axios = require('axios');
const fs = require('fs');

async function searchSteamAPI(query) {
  try {
    // Get all Steam apps
    const response = await axios.get('https://api.steampowered.com/ISteamApps/GetAppList/v2/', {
      timeout: 30000
    });
    const apps = response.data.applist.apps;
    
    console.log(`Total Steam apps: ${apps.length}`);
    console.log(`Searching for: "${query}"\n`);
    
    const normalizedQuery = query.toLowerCase();
    const matches = apps.filter(app => 
      app.name.toLowerCase().includes(normalizedQuery)
    );
    
    return matches;
  } catch (error) {
    console.error('Error:', error.message);
    return [];
  }
}

async function main() {
  const query = process.argv[2] || 'resident evil';
  
  console.log('='.repeat(60));
  console.log('STEAM API SEARCH');
  console.log('='.repeat(60));
  console.log();
  
  const results = await searchSteamAPI(query);
  
  console.log('='.repeat(60));
  console.log(`FOUND: ${results.length} games`);
  console.log('='.repeat(60));
  console.log();
  
  if (results.length === 0) {
    console.log('No games found!');
  } else {
    // Show first 20
    results.slice(0, 20).forEach((game, index) => {
      console.log(`${index + 1}. [${game.appid}] ${game.name}`);
    });
    
    if (results.length > 20) {
      console.log(`\n... and ${results.length - 20} more`);
    }
    
    // Save to file
    const output = results.map(g => `${g.appid},1,"lua","${g.appid}.lua"`).join('\n');
    fs.writeFileSync(`search_${query.replace(/\s+/g, '_')}.txt`, output);
    console.log(`\nSaved to: search_${query.replace(/\s+/g, '_')}.txt`);
  }
}

main();
