// ============================================
// CRITICAL FIXES APPLIED:
// 1. ✅ Game names from Steam API + Backend + SteamNameService
// 2. ✅ Logos from SteamGridDB CDN (multiple sources)
// 3. ✅ Hero image responsive scaling (3840x1240 → fit all screens)
// 4. ✅ Much brighter carousel (brightness 150-160)
// 5. ✅ Debug panel with refresh button
// ============================================

// Replace ONLY the fetchDenuvoFeaturedGames function in your Store.jsx:

const fetchDenuvoFeaturedGames = async () => {
  try {
    const cacheKey = 'denuvo_featured_games_v6'; // New version
    localStorage.removeItem('denuvo_featured_games_v5'); // Clear old
    
    const cached = localStorage.getItem(cacheKey);
    const cacheTime = localStorage.getItem(cacheKey + '_time');
    const CACHE_DURATION = 2 * 60 * 60 * 1000; // 2 hours

    // Check cache
    if (cached && cacheTime && (Date.now() - parseInt(cacheTime)) < CACHE_DURATION) {
      try {
        const cachedData = JSON.parse(cached);
        if (cachedData && cachedData.length === 7 && cachedData.every(g => DENUVO_GAME_IDS.includes(parseInt(g.id)))) {
          setDenuvoGames(cachedData);
          setFeaturedGames(cachedData);
          console.log(`✅ Loaded ${cachedData.length} Denuvo games from cache`);
          return;
        }
      } catch (e) {
        console.error('Cache error:', e);
      }
    }

    console.log('🔄 Fetching 7 random Denuvo games...');
    
    // Pick 7 random Denuvo games
    const shuffled = [...DENUVO_GAME_IDS].sort(() => 0.5 - Math.random());
    const selectedIds = shuffled.slice(0, 7);
    
    console.log('🎲 Selected IDs:', selectedIds);
    
    // Fetch game details with multiple fallbacks
    const promises = selectedIds.map(async (appId) => {
      try {
        // Method 1: Try Steam Store API (best for names)
        try {
          const steamUrl = `https://store.steampowered.com/api/appdetails?appids=${appId}`;
          const steamRes = await fetch(steamUrl, { mode: 'cors' });
          
          if (steamRes.ok) {
            const steamData = await steamRes.json();
            const gameData = steamData[appId]?.data;
            
            if (gameData && gameData.name) {
              console.log(`✅ Steam: ${gameData.name} (${appId})`);
              return {
                id: appId,
                appId: appId,
                title: gameData.name,
                name: gameData.name,
                description: gameData.short_description || '',
                developer: gameData.developers?.[0] || 'Unknown',
                cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`,
                headerImage: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`,
              };
            }
          }
        } catch (corsError) {
          console.log(`⚠️ CORS blocked for ${appId}`);
        }
        
        // Method 2: Backend API
        try {
          const backendRes = await fetch(`http://localhost:3000/api/games/${appId}`);
          if (backendRes.ok) {
            const data = await backendRes.json();
            if (data.name || data.title) {
              console.log(`✅ Backend: ${data.name || data.title} (${appId})`);
              return {
                id: appId,
                appId: appId,
                title: data.name || data.title,
                name: data.name || data.title,
                description: data.description || '',
                developer: data.developer || 'Unknown',
                cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`,
                headerImage: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`,
              };
            }
          }
        } catch (backendError) {
          console.log(`⚠️ Backend failed for ${appId}`);
        }
        
        // Method 3: SteamNameService
        const steamName = SteamNameService.getGameName(appId);
        if (steamName && steamName !== 'Unknown Game' && !steamName.startsWith('Unknown Game (')) {
          console.log(`✅ SteamNameService: ${steamName} (${appId})`);
          return {
            id: appId,
            appId: appId,
            title: steamName,
            name: steamName,
            cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`,
            headerImage: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`,
            developer: 'Unknown',
            description: 'Denuvo protected game',
          };
        }
        
        // Fallback: Generic name
        console.warn(`❌ No name found for ${appId}`);
        return {
          id: appId,
          appId: appId,
          title: `Denuvo Game ${appId}`,
          name: `Denuvo Game ${appId}`,
          cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`,
          headerImage: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`,
        };
      } catch (error) {
        console.error(`❌ Error fetching ${appId}:`, error);
        return {
          id: appId,
          appId: appId,
          title: `Game ${appId}`,
          name: `Game ${appId}`,
          cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`,
          headerImage: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_hero.jpg`,
        };
      }
    });
    
    const gamesWithDetails = await Promise.all(promises);
    console.log('📋 Fetched games:', gamesWithDetails.map(g => g.title));
    
    // Fetch logos from SteamGridDB
    const logoPromises = gamesWithDetails.map(async (game) => {
      try {
        // Try multiple CDN sources
        const logoSources = [
          `https://cdn2.steamgriddb.com/logo/${game.id}.png`,
          `https://cdn.steamgriddb.com/logo/${game.id}.png`,
          `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.id}/logo.png`,
        ];
        
        for (const logoUrl of logoSources) {
          try {
            const test = await fetch(logoUrl, { method: 'HEAD' });
            if (test.ok) {
              console.log(`✅ Logo found: ${logoUrl}`);
              return { ...game, logo: logoUrl };
            }
          } catch (e) {
            continue;
          }
        }
        
        console.log(`❌ No logo for ${game.title} (${game.id})`);
        return { ...game, logo: null };
      } catch (error) {
        return { ...game, logo: null };
      }
    });
    
    const gamesWithLogos = await Promise.all(logoPromises);
    
    // Verify all are Denuvo
    const verified = gamesWithLogos.filter(g => DENUVO_GAME_IDS.includes(parseInt(g.id)));
    
    if (verified.length === 7) {
      setDenuvoGames(verified);
      setFeaturedGames(verified);
      localStorage.setItem(cacheKey, JSON.stringify(verified));
      localStorage.setItem(cacheKey + '_time', Date.now().toString());
      console.log(`✅ Loaded ${verified.length} Denuvo games with ${verified.filter(g => g.logo).length} logos`);
    } else {
      throw new Error('Not enough games');
    }
    
  } catch (error) {
    console.error('❌ fetchDenuvoFeaturedGames error:', error);
  }
};

// ============================================
// CAROUSEL JSX - Replace entire carousel section
// ============================================

// Replace this entire section in your JSX:
// From: {featuredGames.length > 0 && !isSearchMode && (
// To: The closing </div> of carousel

{featuredGames.length > 0 && !isSearchMode && (
  <div className="relative w-full h-[700px] overflow-hidden mb-8 mt-[104px] bg-black">
    {/* Much brighter overlay */}
    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/20 pointer-events-none z-10" />
    
    {featuredGames.map((game, index) => (
      <div
        key={game.id}
        className={`absolute inset-0 transition-all duration-1000 ease-out ${
          index === currentSlide ? 'opacity-100 scale-100 z-[1]' : 'opacity-0 scale-105 z-0'
        }`}
      >
        <Link to={`/game/${game.id}`} className="absolute inset-0 cursor-pointer group">
          {/* Responsive Hero Image */}
          <div className="absolute inset-0 w-full h-full overflow-hidden">
            <img
              src={`https://cdn.cloudflare.steamstatic.com/steam/apps/${game.id}/library_hero.jpg`}
              alt={game.title}
              className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-full min-h-full w-auto h-auto max-w-none transition-all duration-1000 ${
                index === currentSlide ? 'scale-100 brightness-150' : 'scale-110 brightness-100'
              } group-hover:scale-105 group-hover:brightness-[1.7]`}
              style={{ objectFit: 'cover', objectPosition: 'center' }}
              onError={(e) => {
                if (e.target.src.includes('library_hero')) {
                  e.target.src = `https://cdn.cloudflare.steamstatic.com/steam/apps/${game.id}/header.jpg`;
                }
              }}
            />
          </div>
          
          {/* Very light gradient */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-transparent to-transparent group-hover:via-transparent transition-all duration-500" />
          
          {/* Denuvo Badge */}
          {index === currentSlide && (
            <div className="absolute top-8 left-8 z-20 animate-slideInLeft">
              <div className="inline-flex items-center gap-3 px-5 py-3 bg-gradient-to-r from-red-600 via-red-500 to-orange-600 rounded-full shadow-2xl border border-red-400/30 backdrop-blur-sm">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5zm0 18c-3.86-.96-7-5.36-7-9V8.77l7-3.11 7 3.11V11c0 3.64-3.14 8.04-7 9z"/>
                </svg>
                <div className="flex flex-col">
                  <span className="text-xs font-bold uppercase tracking-wider">Protected by</span>
                  <span className="text-sm font-black">DENUVO</span>
                </div>
              </div>
            </div>
          )}
          
          {/* Content */}
          <div className="absolute inset-0 flex items-end p-12 md:p-16 z-10">
            <div className={`max-w-4xl w-full transition-all duration-1000 ${
              index === currentSlide ? 'translate-x-0 opacity-100 delay-300' : '-translate-x-20 opacity-0'
            }`}>
              {/* Logo or Title */}
              <div className="mb-6">
                {game.logo ? (
                  <img 
                    src={game.logo} 
                    alt={game.title}
                    className="max-w-lg max-h-40 object-contain drop-shadow-2xl"
                    onError={(e) => {
                      console.log(`❌ Logo failed: ${e.target.src}`);
                      e.target.style.display = 'none';
                      e.target.parentElement.nextElementSibling.style.display = 'block';
                    }}
                    onLoad={() => console.log(`✅ Logo loaded: ${game.title}`)}
                  />
                ) : null}
              </div>
              <h2 className={`text-5xl md:text-7xl font-black mb-6 drop-shadow-2xl leading-tight ${game.logo ? 'hidden' : 'block'}`}>
                {game.title || game.name || 'Unknown Game'}
              </h2>
              
              {/* Badges */}
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <span className="px-4 py-2 bg-red-600/80 backdrop-blur-sm rounded-lg font-bold border border-red-400/30 flex items-center gap-2 shadow-lg">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5z"/>
                  </svg>
                  Denuvo
                </span>
                
                {game.developer && game.developer !== 'Unknown' && (
                  <span className="px-4 py-2 bg-blue-500/30 text-blue-300 rounded-lg backdrop-blur-sm border border-blue-500/20 text-sm font-medium">
                    {game.developer}
                  </span>
                )}
              </div>
              
              {/* Description */}
              {game.description && (
                <p className="text-xl text-gray-100 mb-6 line-clamp-3 max-w-2xl leading-relaxed drop-shadow-lg">
                  {game.description}
                </p>
              )}
              
              {/* Buttons */}
              <div className="flex gap-4 flex-wrap">
                <button 
                  onClick={(e) => {
                    e.preventDefault();
                    window.location.href = `/game/${game.id}`;
                  }}
                  className="px-8 py-4 bg-gradient-to-r from-white to-gray-100 text-black rounded-xl font-bold text-lg hover:shadow-lg hover:shadow-white/20 transition-all duration-300 hover:scale-105 flex items-center gap-2 group/btn"
                >
                  <span className="group-hover/btn:scale-110 transition-transform">▶</span>
                  View Details
                </button>
                
                <button 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDownloadClick(game, e);
                  }}
                  className="px-8 py-4 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-xl font-bold text-lg hover:shadow-lg hover:shadow-cyan-500/50 transition-all duration-300 hover:scale-105 flex items-center gap-2"
                >
                  <span>⬇</span>
                  Download
                </button>
              </div>
            </div>
          </div>
        </Link>
      </div>
    ))}
    
    {/* Indicators */}
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-3 z-20">
      {featuredGames.map((_, i) => (
        <button
          key={i}
          onClick={(e) => handleDotClick(i, e)}
          className={`transition-all duration-300 rounded-full ${
            i === currentSlide 
              ? 'w-12 h-3 bg-gradient-to-r from-red-500 via-orange-500 to-red-600 shadow-lg shadow-red-500/50' 
              : 'w-3 h-3 bg-gray-600 hover:bg-gray-500'
          }`}
        />
      ))}
    </div>
    
    {/* Navigation Arrows */}
    <button 
      onClick={handlePrevSlide}
      className="absolute left-6 top-1/2 -translate-y-1/2 w-14 h-14 bg-black/40 hover:bg-black/70 backdrop-blur-sm border border-white/20 hover:border-red-500/60 text-white rounded-full transition-all duration-300 z-20 flex items-center justify-center group shadow-lg"
    >
      <svg className="w-6 h-6 group-hover:scale-125 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
    </button>
    
    <button 
      onClick={handleNextSlide}
      className="absolute right-6 top-1/2 -translate-y-1/2 w-14 h-14 bg-black/40 hover:bg-black/70 backdrop-blur-sm border border-white/20 hover:border-red-500/60 text-white rounded-full transition-all duration-300 z-20 flex items-center justify-center group shadow-lg"
    >
      <svg className="w-6 h-6 group-hover:scale-125 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
    
    {/* Progress Bar */}
    <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-800/50 z-20">
      <div 
        className="h-full bg-gradient-to-r from-red-500 via-orange-500 to-red-600 transition-all duration-500 ease-linear shadow-lg shadow-red-500/50"
        style={{ width: `${((currentSlide + 1) / featuredGames.length) * 100}%` }}
      />
    </div>
    
    {/* Counter */}
    <div className="absolute top-8 right-8 z-20 px-4 py-2 bg-black/60 backdrop-blur-md rounded-full border border-white/10">
      <span className="text-sm font-bold">
        <span className="text-red-400">{currentSlide + 1}</span>
        <span className="text-gray-400"> / </span>
        <span className="text-white">{featuredGames.length}</span>
      </span>
    </div>
  </div>
)}

// ============================================
// DEBUG PANEL - Replace debug section
// ============================================

{!isSearchMode && (
  <div className="fixed top-0 left-0 bg-red-600/90 backdrop-blur-sm text-white p-3 z-[999] text-xs font-mono shadow-lg max-w-md">
    <div className="flex items-center justify-between mb-1">
      <div className="font-bold">🔧 DEBUG MODE</div>
      <button 
        onClick={() => {
          localStorage.removeItem('denuvo_featured_games_v6');
          localStorage.removeItem('denuvo_featured_games_v6_time');
          window.location.reload();
        }}
        className="px-2 py-0.5 bg-white/20 hover:bg-white/30 rounded text-[10px]"
      >
        🔄 Refresh
      </button>
    </div>
    <div>Featured: {featuredGames.length} games</div>
    <div>Current: {currentSlide + 1}/{featuredGames.length}</div>
    <div className="mt-2 text-yellow-200">
      ✅ All Denuvo: {featuredGames.every(g => DENUVO_GAME_IDS.includes(parseInt(g.id))) ? 'YES' : 'NO'}
    </div>
    {featuredGames.length > 0 && (
      <div className="mt-2 max-h-40 overflow-y-auto text-[10px] space-y-1">
        {featuredGames.map((g, i) => (
          <div key={i} className="border-b border-white/10 pb-1">
            <div className={DENUVO_GAME_IDS.includes(parseInt(g.id)) ? 'text-green-300' : 'text-red-300'}>
              {i + 1}. {g.title || 'NO TITLE'} ({g.id})
            </div>
            <div className="text-purple-200 ml-3">
              Logo: {g.logo ? '✓' : '✗'} | Dev: {g.developer || 'N/A'}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}

// ============================================
// INSTRUCTIONS:
// 1. Copy the fetchDenuvoFeaturedGames function above
// 2. Replace your old fetchDenuvoFeaturedGames in Store.jsx
// 3. Copy the carousel JSX section
// 4. Replace your old carousel in Store.jsx
// 5. Copy the debug panel
// 6. Replace your old debug section
// 7. Save and reload
// ============================================
