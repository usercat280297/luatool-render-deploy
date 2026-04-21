// Build index với cookies từ browser
const fs = require('fs');
const axios = require('axios');

// HƯỚNG DẪN LẤY COOKIES:
// 1. Mở browser, vào https://steamdb.info/
// 2. Đăng nhập Steam
// 3. Mở DevTools (F12) > Network tab
// 4. Refresh trang
// 5. Click vào request đầu tiên
// 6. Copy toàn bộ "Cookie" header
// 7. Paste vào đây:

const COOKIES = '__Host-steamdb=8846279-7a74f3974caca720b7afff49bf4fbc4c61dc26b2; cf_clearance=OHl1DRRrVweK1WNwOtAKEFKACxZb.NwyPOYKFbXRIsg-1766175405-1.2.1.1-WRFhRkR9izKyXsxOXsbBaXWTgiPwWIgUCpMiDZElenggjnTsVbrG2XKVGa0r6G0lKjK8k3MoT1v_DQLM0D5sTGJaxfO01Hddg4yIRorJUxRhMK9hm24uhvoy.6qRcwpKsak6PoVMG.kuP9cCfXiPF_B6rb87p.Im1YkeQooZ3xW2zDbCIbzQPcSIxqIBBO2nvAzsQpQZfwzHb7YJ1e0OTg0a0io8OndxmfXypHFQQf4LCzeDH52_HybYQf0qda7t';

async function getGameName(appId) {
  try {
    const response = await axios.get(`https://steamdb.info/app/${appId}/`, {
      timeout: 5000,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Cookie': COOKIES,
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
  if (!COOKIES || COOKIES === 'PASTE_YOUR_COOKIES_HERE') {
    console.error('❌ Chưa có cookies! Làm theo hướng dẫn ở trên.');
    return;
  }

  const gamesList = fs.readFileSync('games_list_simple.txt', 'utf8').split('\n').filter(Boolean);
  let index = {};
  
  if (fs.existsSync('game_names_index.json')) {
    index = JSON.parse(fs.readFileSync('game_names_index.json', 'utf8'));
    console.log(`Loaded ${Object.keys(index).length} existing names\n`);
  }
  
  console.log(`Building index for ${gamesList.length} games...\n`);
  
  let success = 0, failed = 0, skipped = 0;
  
  for (let i = 0; i < gamesList.length; i++) {
    const appId = gamesList[i].trim();
    if (!appId) continue;
    
    if (index[appId]) {
      skipped++;
      if (i % 100 === 0) {
        console.log(`[${i+1}/${gamesList.length}] Progress: ${success} ✅ | ${failed} ❌ | ${skipped} ⏭️`);
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
      console.log(`[${i+1}/${gamesList.length}] ${appId}: ❌ FAILED`);
    }
    
    if ((success + failed) % 50 === 0) {
      fs.writeFileSync('game_names_index.json', JSON.stringify(index, null, 2));
      console.log(`\n💾 Checkpoint: ${Object.keys(index).length} games\n`);
    }
    
    await new Promise(r => setTimeout(r, 200));
  }
  
  fs.writeFileSync('game_names_index.json', JSON.stringify(index, null, 2));
  console.log(`\n✅ Done! ${Object.keys(index).length} games`);
  console.log(`Success: ${success} | Failed: ${failed} | Skipped: ${skipped}`);
}

buildIndex();
