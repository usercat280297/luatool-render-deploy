// ============================================
// STEAMDB SCRAPER - Lấy thông tin chi tiết
// ============================================
const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeSteamDB(appId) {
  try {
    const response = await axios.get(`https://steamdb.info/app/${appId}/`, {
      timeout: 15000,
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    
    const html = response.data;
    const $ = cheerio.load(html);
    const info = {};
    
    // Lấy tên game
    const title = $('h1').first().text().trim() || 
                  $('title').text().replace(/\s*-\s*SteamDB.*$/i, '').trim();
    if (title) info.name = title;
    
    // Lấy thông tin từ bảng
    $('table tr').each((i, row) => {
      const label = $(row).find('td').first().text().trim();
      const value = $(row).find('td').last().text().trim();
      
      if (label.includes('Developer')) {
        info.developer = value || 'Unknown';
      } else if (label.includes('Publisher')) {
        info.publisher = value || 'Unknown';
      } else if (label.includes('Release Date')) {
        info.releaseDate = value;
      } else if (label.includes('Last Record Update')) {
        info.lastUpdate = value.split('–')[0].trim();
      } else if (label.toLowerCase().includes('dlc')) {
        const dlcMatch = value.match(/\d+/);
        if (dlcMatch) {
          info.dlcCount = parseInt(dlcMatch[0], 10);
        }
      }
    });
    
    // Lấy dung lượng với nhiều pattern
    const patterns = [
      /Total\s+size\s+on\s+disk\s+is\s+([\d.]+)\s*(GiB|MiB|GB|MB)/i,
      /total\s+download\s+size\s+is\s+([\d.]+)\s*(GiB|MiB|GB|MB)/i,
      /([\d.]+)\s*(GiB|MiB|GB|MB).*?total/i,
      /<td>Size<\/td>\s*<td[^>]*>([\d.]+)\s*(GiB|MiB|GB|MB)/i,
      /Disk\s+Space[:\s]+([\d.]+)\s*(GiB|MiB|GB|MB)/i
    ];
    
    let sizeMatch = null;
    let isFull = false;
    
    for (let i = 0; i < patterns.length; i++) {
      sizeMatch = html.match(patterns[i]);
      if (sizeMatch) {
        isFull = (i === 0); // First pattern is Total size
        break;
      }
    }
    
    if (sizeMatch) {
      const size = parseFloat(sizeMatch[1]);
      const unit = sizeMatch[2];
      if (size > 0 && size < 2000) {
        info.size = unit.toLowerCase().includes('gib') || unit.toLowerCase().includes('gb')
          ? size * 1024 * 1024 * 1024
          : size * 1024 * 1024;
        info.sizeFormatted = `${size} ${unit.replace(/i/gi, '')}`;
        info.sizeType = isFull ? 'FULL' : 'Base';
      }
    }
    
    // Lấy rating từ Steam
    const ratingMatch = html.match(/([\d.]+)%.*?(\d+[\d,]*)\s+reviews/i);
    if (ratingMatch) {
      info.rating = ratingMatch[1] + '%';
      info.reviewCount = ratingMatch[2].replace(/,/g, '');
    }
    
    console.log('✅ SteamDB scrape success:', info);
    return info;
    
  } catch (error) {
    console.error('❌ SteamDB scrape failed:', error.message);
    return null;
  }
}

module.exports = { scrapeSteamDB };
