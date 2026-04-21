import requests
import json
import csv
import time
from pathlib import Path
from known_games import get_all_known_games, KNOWN_LUA_GAMES

class AdvancedGameCrawler:
    def __init__(self):
        self.games = {}  # {appid: name}
        self.session = requests.Session()
        self.session.headers.update({'User-Agent': 'Mozilla/5.0'})
        self.cache_file = 'game_cache.json'
        self.load_cache()
    
    def load_cache(self):
        """Load cached data"""
        if Path(self.cache_file).exists():
            with open(self.cache_file, 'r', encoding='utf-8') as f:
                self.games = json.load(f)
            print(f"Loaded {len(self.games)} games from cache")
    
    def save_cache(self):
        """Save to cache"""
        with open(self.cache_file, 'w', encoding='utf-8') as f:
            json.dump(self.games, f, indent=2)
    
    def fetch_steam_details(self, appid):
        """Lấy chi tiết game từ Steam"""
        url = f"https://store.steampowered.com/api/appdetails?appids={appid}&l=english"
        try:
            r = self.session.get(url, timeout=10)
            data = r.json()
            
            if str(appid) in data and data[str(appid)]['success']:
                game_data = data[str(appid)]['data']
                return {
                    'name': game_data.get('name', f'Game {appid}'),
                    'type': game_data.get('type', 'game'),
                    'desc': game_data.get('short_description', '')
                }
        except Exception as e:
            print(f"Error fetching {appid}: {e}")
        return None
    
    def search_steamdb(self, keyword='lua'):
        """Tìm kiếm trên SteamDB (giả lập)"""
        # SteamDB không có public API, cần scraping hoặc manual list
        print(f"Searching SteamDB for '{keyword}'...")
        return []
    
    def fetch_github_mods(self):
        """Tìm Lua mods trên GitHub"""
        print("Searching GitHub for Lua game mods...")
        # GitHub API search
        url = "https://api.github.com/search/repositories"
        params = {
            'q': 'steam lua mod',
            'sort': 'stars',
            'per_page': 30
        }
        try:
            r = self.session.get(url, params=params, timeout=15)
            repos = r.json().get('items', [])
            print(f"Found {len(repos)} relevant repositories")
            # Parse AppIDs from repo descriptions/names
            return []
        except Exception as e:
            print(f"GitHub search error: {e}")
            return []
    
    def crawl_comprehensive(self):
        """Thu thập toàn diện"""
        print("=== Starting Comprehensive Crawl ===\n")
        
        # 1. Load known games
        print("1. Loading known Lua games...")
        known = get_all_known_games()
        for appid in known:
            if str(appid) not in self.games:
                name = KNOWN_LUA_GAMES.get(appid, f'Game {appid}')
                self.games[str(appid)] = name
        print(f"   Added {len(known)} known games\n")
        
        # 2. Fetch details for games without names
        print("2. Fetching game details from Steam...")
        count = 0
        for appid, name in list(self.games.items()):
            if name.startswith('Game '):
                details = self.fetch_steam_details(appid)
                if details:
                    self.games[appid] = details['name']
                    count += 1
                    if count % 10 == 0:
                        print(f"   Fetched {count} game details...")
                        time.sleep(1)  # Rate limit
        print(f"   Updated {count} game names\n")
        
        # 3. Search additional sources
        print("3. Searching additional sources...")
        self.fetch_github_mods()
        
        # 4. Save cache
        self.save_cache()
        print(f"\n=== Total: {len(self.games)} games ===")
        return self.games
    
    def export_to_csv(self, output='games_list.csv'):
        """Export to CSV format"""
        with open(output, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['AppID', 'Files', 'Types', 'Paths'])
            
            for appid in sorted(self.games.keys(), key=int):
                writer.writerow([appid, 1, 'lua', f'{appid}.lua'])
        
        print(f"\nExported to {output}")
    
    def export_with_names(self, output='games_with_names.csv'):
        """Export với tên game"""
        with open(output, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['AppID', 'Name', 'Files', 'Types', 'Paths'])
            
            for appid in sorted(self.games.keys(), key=int):
                name = self.games[appid]
                writer.writerow([appid, name, 1, 'lua', f'{appid}.lua'])
        
        print(f"Exported with names to {output}")

def main():
    crawler = AdvancedGameCrawler()
    
    # Crawl
    games = crawler.crawl_comprehensive()
    
    # Export
    crawler.export_to_csv('games_list.csv')
    crawler.export_with_names('games_with_names.csv')
    
    print(f"\nDone! Found {len(games)} games with Lua support")

if __name__ == '__main__':
    main()
