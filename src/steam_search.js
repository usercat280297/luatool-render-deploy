const axios = require('axios');

// Search Steam Store API directly
async function searchSteamStore(query) {
  try {
    // Use Steam Store search API
    const response = await axios.get('https://store.steampowered.com/api/storesearch/', {
      params: {
        term: query,
        l: 'english',
        cc: 'US'
      },
      timeout: 10000
    });
    
    if (response.data && response.data.items) {
      const primary = response.data.items.map(item => ({
        appId: item.id.toString(),
        name: item.name,
        type: item.type
      }));
      // If primary is already rich enough, return
      if (primary.length >= 10) return primary;
      // Else enrich with variants
      const variants = [];
      const variantTerms = [
        `${query} showcase`,
        `${query} demo`,
        `${query} trial`,
        query.replace(/\s+/g, ''), // compact term e.g., 'fc25'
      ];
      for (const t of variantTerms) {
        try {
          const r = await axios.get('https://store.steampowered.com/search/suggest', {
            params: { term: t, f: 'games', l: 'english', cc: 'US' },
            timeout: 8000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
          });
          const html = r.data || '';
          const re = /href="https:\/\/store\.steampowered\.com\/app\/(\d+)[^"]*"[^>]*>([^<]+)<\/a>/gi;
          let m;
          while ((m = re.exec(html)) && variants.length < 50) {
            variants.push({ appId: m[1].toString(), name: m[2], type: 'game' });
          }
        } catch {}
      }
      // Merge unique by appId
      const map = new Map();
      [...primary, ...variants].forEach(it => {
        if (!map.has(it.appId)) map.set(it.appId, it);
      });
      return Array.from(map.values());
    }
    
    // Fallback: use suggest endpoint (higher recall for short terms)
    const suggest = await axios.get('https://store.steampowered.com/search/suggest', {
      params: {
        term: query,
        f: 'games',
        l: 'english',
        cc: 'US'
      },
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const html = suggest.data || '';
    const results = [];
    const re = /href="https:\/\/store\.steampowered\.com\/app\/(\d+)[^"]*"[^>]*>([^<]+)<\/a>/gi;
    let m;
    while ((m = re.exec(html)) && results.length < 30) {
      results.push({ appId: m[1].toString(), name: m[2], type: 'game' });
    }
    // Enrich with showcase/demo variants if results are small
    if (results.length < 6) {
      for (const t of [`${query} showcase`, `${query} demo`, query.replace(/\s+/g, '')]) {
        try {
          const r = await axios.get('https://store.steampowered.com/search/suggest', {
            params: { term: t, f: 'games', l: 'english', cc: 'US' },
            timeout: 8000,
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
          });
          const html2 = r.data || '';
          let mm;
          while ((mm = re.exec(html2)) && results.length < 30) {
            if (!results.find(x => x.appId === mm[1])) {
              results.push({ appId: mm[1].toString(), name: mm[2], type: 'game' });
            }
          }
        } catch {}
      }
    }
    return results;
  } catch (error) {
    console.error('Steam Store search error:', error.message);
    return [];
  }
}

module.exports = { searchSteamStore };
