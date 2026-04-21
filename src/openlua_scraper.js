const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Configuration
const LUA_FILES_PATH = path.join(__dirname, '../lua_files');
const TIMEOUT = 30000;

// Helper to log
function log(type, message) {
  console.log(`[OpenLua] [${type}] ${message}`);
}

async function fetchLuaFromOpenCloud(appId, gameName) {
  log('INFO', `Starting fetch for ${gameName} (${appId})...`);
  
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-features=site-per-process']
  });

  const page = await browser.newPage();
  
  // Basic Ad Blocking / Speed Optimization
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const resourceType = req.resourceType();
    if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
      req.abort();
    } else {
      req.continue();
    }
  });

  // Auto-close popups
  browser.on('targetcreated', async (target) => {
    if (target.type() === 'page') {
      const newPage = await target.page();
      // If a new tab opens and it's not the one we are controlling, close it
      // This is a naive ad-popup blocker
      if (newPage && newPage !== page) {
        log('INFO', 'Closed potential ad popup');
        await newPage.close();
      }
    }
  });

  try {
    // 1. Navigate to site
    log('INFO', 'Navigating to openlua.cloud...');
    await page.goto('https://openlua.cloud/', { waitUntil: 'domcontentloaded', timeout: TIMEOUT });

    // 2. Search
    // Attempt to find search input. Selectors are guesses based on common patterns.
    // We'll search for input with type='search' or placeholder containing 'search'
    const searchInput = await page.waitForSelector('input[type="search"], input[name="search"], input[placeholder*="Search"]', { timeout: 5000 }).catch(() => null);
    
    if (!searchInput) {
      throw new Error('Could not find search input field');
    }

    log('INFO', `Searching for: ${appId}`);
    await searchInput.type(String(appId));
    await searchInput.press('Enter');

    // 3. Wait for results
    // Wait for some result container or link
    // Assuming results are links
    await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
    
    // Look for a link that contains the AppID or Game Name
    // This is tricky without knowing the DOM. We'll look for any anchor tag containing the text.
    const resultFound = await page.evaluate((id, name) => {
      const links = Array.from(document.querySelectorAll('a'));
      // Prioritize AppID match
      const idMatch = links.find(l => l.innerText.includes(id) || l.href.includes(id));
      if (idMatch) {
        idMatch.click();
        return true;
      }
      // Fallback to name match
      if (name) {
        const nameMatch = links.find(l => l.innerText.toLowerCase().includes(name.toLowerCase()));
        if (nameMatch) {
          nameMatch.click();
          return true;
        }
      }
      return false;
    }, appId, gameName);

    if (!resultFound) {
      // Maybe the search results are not links but divs?
      // Check if "No results" text is present
      const content = await page.content();
      if (content.includes('No results') || content.includes('Nothing found')) {
        throw new Error('Game not found on OpenLua');
      }
      // If we are still on the same page, maybe we need to click a specific result item
      throw new Error('Could not find suitable result link');
    }

    // 4. On Game Page - Find Lua Content or Download
    log('INFO', 'Waiting for game page to load...');
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: TIMEOUT }).catch(() => {});

    // Look for "Copy" button or code block
    // Or a "Download" button
    
    // Strategy A: Look for <pre> or <code> block containing 'addappid'
    const luaContent = await page.evaluate(() => {
      // Check code blocks
      const codes = Array.from(document.querySelectorAll('code, pre, textarea'));
      for (const code of codes) {
        if (code.innerText.includes('addappid') || code.innerText.includes('setManifestid')) {
          return code.innerText;
        }
      }
      return null;
    });

    if (luaContent) {
      log('SUCCESS', 'Found Lua content directly on page');
      await saveLuaFile(appId, luaContent);
      return { success: true, method: 'direct_text' };
    }

    // Strategy B: Look for Download button
    // This might trigger a download or a new page
    // ... (Implementation depends on specific site behavior)
    
    throw new Error('Could not extract Lua content from page');

  } catch (error) {
    log('ERROR', `Failed: ${error.message}`);
    return { success: false, error: error.message };
  } finally {
    await browser.close();
  }
}

function saveLuaFile(appId, content) {
  const filePath = path.join(LUA_FILES_PATH, `${appId}.lua`);
  // Simple validation
  if (!content.includes('addappid')) {
    log('WARN', 'Content does not look like a valid Lua script (missing addappid)');
    return; // Or save anyway with warning?
  }
  fs.writeFileSync(filePath, content, 'utf8');
  log('INFO', `Saved to ${filePath}`);
}

module.exports = { fetchLuaFromOpenCloud };
