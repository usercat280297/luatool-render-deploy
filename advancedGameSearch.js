const fs = require('fs');
const path = require('path');
const axios = require('axios');

class AdvancedGameSearch {
    constructor() {
        this.gameIndex = new Map();
        this.luaFolder = './lua_files';
        this.searchCache = new Map();
    }

    // Levenshtein distance for fuzzy matching
    levenshteinDistance(str1, str2) {
        const matrix = [];
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        return matrix[str2.length][str1.length];
    }

    // Calculate similarity score
    calculateSimilarity(str1, str2) {
        const maxLen = Math.max(str1.length, str2.length);
        if (maxLen === 0) return 1;
        const distance = this.levenshteinDistance(str1, str2);
        return (maxLen - distance) / maxLen;
    }

    // Extract appID from lua file
    extractAppId(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            const match = content.match(/addappid\((\d+)\)/);
            return match ? parseInt(match[1]) : null;
        } catch (error) {
            return null;
        }
    }

    // Process one by one to avoid rate limit
    async batchGetGameNames(appIds) {
        const results = [];
        
        for (let i = 0; i < appIds.length; i++) {
            const { appId, file } = appIds[i];
            
            try {
                const response = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${appId}&filters=basic`, {
                    timeout: 5000
                });
                
                const data = response.data[appId];
                if (data?.success && data.data?.name) {
                    results.push({
                        appId,
                        name: data.data.name,
                        file,
                        searchText: data.data.name.toLowerCase(),
                        keywords: this.generateKeywords(data.data.name)
                    });
                    console.log(`✅ ${i+1}/${appIds.length} - ${appId}: ${data.data.name}`);
                } else {
                    console.log(`⚠️ ${i+1}/${appIds.length} - ${appId}: No data`);
                }
                
                // Rate limit: 1 request per 1.5 seconds
                await new Promise(resolve => setTimeout(resolve, 1500));
                
            } catch (error) {
                console.log(`❌ ${i+1}/${appIds.length} - ${appId}: ${error.message}`);
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
        
        return results;
    }

    // Generate search keywords
    generateKeywords(gameName) {
        const words = gameName.toLowerCase()
            .replace(/[^\w\s]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2);
        
        const keywords = new Set(words);
        
        // Add partial matches
        words.forEach(word => {
            if (word.length > 4) {
                for (let i = 3; i <= word.length; i++) {
                    keywords.add(word.substring(0, i));
                }
            }
        });
        
        return Array.from(keywords);
    }

    // Build complete index with progress saving
    async buildIndex() {
        console.log('🔍 Building advanced search index...');
        const files = fs.readdirSync(this.luaFolder).filter(f => f.endsWith('.lua'));
        const appIds = [];
        
        // Extract all appIDs first
        files.forEach(file => {
            const filePath = path.join(this.luaFolder, file);
            const appId = this.extractAppId(filePath);
            if (appId) appIds.push({ appId, file });
        });
        
        console.log(`📁 Found ${appIds.length} lua files`);
        
        // Process in small chunks with progress saving
        const chunkSize = 100;
        for (let i = 0; i < appIds.length; i += chunkSize) {
            const chunk = appIds.slice(i, i + chunkSize);
            console.log(`\n🔄 Processing chunk ${Math.floor(i/chunkSize) + 1}/${Math.ceil(appIds.length/chunkSize)}`);
            
            const gameData = await this.batchGetGameNames(chunk);
            
            // Add to index
            gameData.forEach(game => {
                this.gameIndex.set(game.appId, game);
            });
            
            // Save progress every chunk
            this.saveIndex();
            console.log(`💾 Progress saved: ${this.gameIndex.size} games indexed`);
        }
        
        console.log(`✅ Final index: ${this.gameIndex.size} games`);
    }

    // Advanced search with fuzzy matching
    search(query, limit = 20) {
        const cacheKey = `${query.toLowerCase()}_${limit}`;
        if (this.searchCache.has(cacheKey)) {
            return this.searchCache.get(cacheKey);
        }
        
        const searchTerm = query.toLowerCase().trim();
        if (!searchTerm) return [];
        
        const results = [];
        const exactMatches = [];
        const partialMatches = [];
        const fuzzyMatches = [];
        
        for (const [appId, game] of this.gameIndex) {
            const gameName = game.name.toLowerCase();
            
            // Exact match
            if (gameName === searchTerm) {
                exactMatches.push({ ...game, score: 1.0, matchType: 'exact' });
                continue;
            }
            
            // Starts with
            if (gameName.startsWith(searchTerm)) {
                partialMatches.push({ ...game, score: 0.9, matchType: 'prefix' });
                continue;
            }
            
            // Contains
            if (gameName.includes(searchTerm)) {
                partialMatches.push({ ...game, score: 0.8, matchType: 'contains' });
                continue;
            }
            
            // Keyword match
            const keywordMatch = game.keywords?.some(keyword => 
                keyword.includes(searchTerm) || searchTerm.includes(keyword)
            );
            if (keywordMatch) {
                partialMatches.push({ ...game, score: 0.7, matchType: 'keyword' });
                continue;
            }
            
            // Fuzzy match
            const similarity = this.calculateSimilarity(searchTerm, gameName);
            if (similarity > 0.6) {
                fuzzyMatches.push({ ...game, score: similarity, matchType: 'fuzzy' });
            }
        }
        
        // Sort and combine results
        partialMatches.sort((a, b) => b.score - a.score);
        fuzzyMatches.sort((a, b) => b.score - a.score);
        
        const finalResults = [
            ...exactMatches,
            ...partialMatches.slice(0, limit * 0.7),
            ...fuzzyMatches.slice(0, limit * 0.3)
        ].slice(0, limit);
        
        // Cache results
        this.searchCache.set(cacheKey, finalResults);
        
        return finalResults;
    }

    // Get search suggestions
    getSuggestions(query, limit = 5) {
        const results = this.search(query, limit * 2);
        return results.slice(0, limit).map(game => ({
            appId: game.appId,
            name: game.name,
            matchType: game.matchType,
            score: game.score
        }));
    }

    // Save index to file
    saveIndex() {
        const indexData = {};
        for (const [appId, game] of this.gameIndex) {
            indexData[appId] = game;
        }
        fs.writeFileSync('./advancedGameIndex.json', JSON.stringify(indexData, null, 2));
        console.log('💾 Advanced index saved');
    }

    // Load index from file
    loadIndex() {
        try {
            const data = JSON.parse(fs.readFileSync('./advancedGameIndex.json', 'utf8'));
            this.gameIndex = new Map();
            for (const [appId, game] of Object.entries(data)) {
                this.gameIndex.set(parseInt(appId), game);
            }
            console.log(`📚 Loaded ${this.gameIndex.size} games from advanced index`);
            return true;
        } catch (error) {
            console.log('❌ No advanced index found');
            return false;
        }
    }
}

module.exports = AdvancedGameSearch;