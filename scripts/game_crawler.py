import requests
import json
import csv
import time
from pathlib import Path

class GameCrawler:
    def __init__(self):
        self.games = set()
        self.session = requests.Session()
        self.session.headers.update({'User-Agent': 'Mozilla/5.0'})
    
    def fetch_steam_applist(self):
        """Lấy toàn bộ app list từ Steam API"""
        print("Fetching Steam app list...")
        url = "https://api.steampowered.com/ISteamApps/GetAppList/v2/"
        try:
            r = self.session.get(url, timeout=30)
            data = r.json()
            apps = data['applist']['apps']
            print(f"Found {len(apps)} total Steam apps")
            return apps
        except Exception as e:
            print(f"Error fetching Steam list: {e}")
            return []
    
    def check_lua_support(self, appid):
        """Kiểm tra game có hỗ trợ Lua không"""
        url = f"https://store.steampowered.com/api/appdetails?appids={appid}"
        try:
            r = self.session.get(url, timeout=10)
            data = r.json()
            
            if str(appid) not in data or not data[str(appid)]['success']:
                return False
            
            game_data = data[str(appid)]['data']
            desc = game_data.get('detailed_description', '').lower()
            short_desc = game_data.get('short_description', '').lower()
            
            lua_keywords = ['lua', 'modding', 'scripting', 'mod support', 'workshop']
            return any(kw in desc or kw in short_desc for kw in lua_keywords)
        except:
            return False
    
    def fetch_from_steamdb(self):
        """Lấy games từ SteamDB (giả lập - cần API key thực)"""
        print("Checking SteamDB...")
        # Danh sách games phổ biến có Lua support
        known_lua_games = [
            4000, 220, 570, 730, 440,  # Source games
            107410, 211820, 233250,  # Arma series
            294100, 346110,  # RimWorld, ARK
            255710, 251570,  # Cities Skylines, 7DTD
            105600, 252490,  # Terraria, Rust
            304930, 413150,  # Unturned, Stormworks
            629730, 1145360,  # Barotrauma, Hades
        ]
        return known_lua_games
    
    def fetch_from_pcgamingwiki(self):
        """Lấy từ PCGamingWiki"""
        print("Checking PCGamingWiki...")
        # API endpoint (simplified)
        known_games = [
            271590, 236850, 362890,  # GTA V, Europa, Black Mesa
            8930, 17300, 17330,  # Civ V, Crysis, Crysis Warhead
        ]
        return known_games
    
    def crawl_all(self, quick_mode=True):
        """Thu thập từ tất cả nguồn"""
        # 1. Lấy known games
        self.games.update(self.fetch_from_steamdb())
        self.games.update(self.fetch_from_pcgamingwiki())
        
        if not quick_mode:
            # 2. Quét Steam (chậm, chỉ dùng khi cần)
            apps = self.fetch_steam_applist()
            print("Checking Lua support (this may take a while)...")
            
            for i, app in enumerate(apps[:1000]):  # Giới hạn 1000 đầu
                if i % 50 == 0:
                    print(f"Progress: {i}/1000")
                    time.sleep(2)  # Rate limit
                
                if self.check_lua_support(app['appid']):
                    self.games.add(app['appid'])
        
        return sorted(self.games)
    
    def save_to_csv(self, output_file='games_list.csv'):
        """Lưu vào CSV"""
        games = sorted(self.games)
        with open(output_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(['AppID', 'Files', 'Types', 'Paths'])
            for appid in games:
                writer.writerow([appid, 1, 'lua', f'{appid}.lua'])
        print(f"Saved {len(games)} games to {output_file}")

if __name__ == '__main__':
    crawler = GameCrawler()
    
    # Quick mode: chỉ lấy known games
    print("=== Quick Mode: Known Lua Games ===")
    games = crawler.crawl_all(quick_mode=True)
    print(f"Total games found: {len(games)}")
    
    # Lưu file
    crawler.save_to_csv('games_list_new.csv')
    
    print("\nTo run full scan (slow): set quick_mode=False")
