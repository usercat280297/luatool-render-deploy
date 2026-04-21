const QuickGameSearch = require('./quickGameSearch');

async function buildCache() {
    console.log('🚀 Starting to build game names cache...');
    console.log('⏱️  Smart rate-limiting with exponential backoff');
    
    const searcher = new QuickGameSearch();
    
    if (searcher.gameNames.size > 0) {
        console.log(`✅ Cache already has ${searcher.gameNames.size} games`);
    }
    
    // Get games that aren't cached yet
    const uncachedAppIds = searcher.appIds.filter(
        appId => !searcher.gameNames.has(appId.toString())
    );
    
    if (uncachedAppIds.length === 0) {
        console.log('✅ All games are already cached!');
        process.exit(0);
    }
    
    console.log(`📁 Total games: ${searcher.appIds.length}`);
    console.log(`📦 Already cached: ${searcher.gameNames.size}`);
    console.log(`⏳ Need to fetch: ${uncachedAppIds.length}`);
    console.log('');
    
    let count = 0;
    let failed = 0;
    let rateLimited = 0;
    let baseDelay = 800; // Start with 800ms - slower than before
    let currentDelay = baseDelay;
    const retryQueue = [];

    for (let i = 0; i < uncachedAppIds.length; i++) {
        const appId = uncachedAppIds[i];
        
        try {
            const name = await searcher.fetchGameName(appId);
            count++;
            
            if (name) {
                if (count % 20 === 0) {
                    const totalCached = searcher.gameNames.size;
                    const progress = (totalCached / searcher.appIds.length * 100).toFixed(1);
                    console.log(`📝 Fetched ${count}/${uncachedAppIds.length} - Cached: ${totalCached}/${searcher.appIds.length} (${progress}%) [Delay: ${currentDelay}ms]`);
                }
            } else {
                failed++;
            }
            
            // Reset delay when successful
            currentDelay = baseDelay;
            
            // Rate limiting with current delay
            await new Promise(resolve => setTimeout(resolve, currentDelay));
            
        } catch (error) {
            if (error.response?.status === 429) {
                // Rate limited - exponential backoff
                rateLimited++;
                currentDelay = Math.min(currentDelay * 1.5, 5000); // Max 5 seconds
                
                // Add to retry queue
                retryQueue.push(appId);
                
                if (rateLimited % 10 === 0) {
                    console.log(`⚠️  Rate limited ${rateLimited}x - Increasing delay to ${Math.round(currentDelay)}ms`);
                }
                
                // Wait longer when rate limited
                await new Promise(resolve => setTimeout(resolve, currentDelay));
            } else {
                failed++;
                // Reset on other errors too
                currentDelay = baseDelay;
            }
        }
    }

    // Retry rate-limited items with longer delays
    if (retryQueue.length > 0) {
        console.log(`\n⏳ Retrying ${retryQueue.length} rate-limited items with 2-second delays...`);
        let retryCount = 0;
        for (const appId of retryQueue) {
            try {
                const name = await searcher.fetchGameName(appId);
                if (name) {
                    retryCount++;
                    if (retryCount % 10 === 0) {
                        const totalCached = searcher.gameNames.size;
                        const progress = (totalCached / searcher.appIds.length * 100).toFixed(1);
                        console.log(`✅ Retry: ${retryCount}/${retryQueue.length} - Total cached: ${totalCached}/${searcher.appIds.length} (${progress}%)`);
                    }
                }
                // Longer delay for retries
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (error) {
                if (error.response?.status !== 429) {
                    failed++;
                }
            }
        }
    }

    console.log('');
    console.log('✅ Cache build complete!');
    console.log(`📊 Final stats:`);
    console.log(`   - Total games cached: ${searcher.gameNames.size}`);
    console.log(`   - Rate limit hits: ${rateLimited}`);
    console.log(`   - Coverage: ${(searcher.gameNames.size / searcher.appIds.length * 100).toFixed(1)}%`);
    console.log('');
    console.log('💾 Cache saved to: gameNamesCache.json');
    console.log('🎮 You can now search! The cache will auto-fill as you search for games.');
    
    process.exit(0);
}

buildCache().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
