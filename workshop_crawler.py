"""
Steam Workshop Crawler - Tìm games có Lua mods trên Workshop
"""
import requests
import re
from bs4 import BeautifulSoup
import time

class WorkshopCrawler:
    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
        self.found_games = set()
    
    def search_workshop(self, query='lua', pages=5):
        """Tìm kiếm Workshop items"""
        print(f"Searching Workshop for '{query}'...")
        
        for page in range(1, pages + 1):
            url = f"https://steamcommunity.com/workshop/browse/"
            params = {
                'searchtext': query,
                'browsesort': 'trend',
                'section': 'readytouseitems',
                'p': page
            }
            
            try:
                r = self.session.get(url, params=params, timeout=15)
                soup = BeautifulSoup(r.text, 'html.parser')
                
                # Parse AppIDs từ workshop items
                items = soup.find_all('a', class_='ugc')
                for item in items:
                    href = item.get('href', '')
                    # Extract AppID từ URL
                    match = re.search(r'appid=(\d+)', href)
                    if match:
                        appid = match.group(1)
                        self.found_games.add(appid)
                
                print(f"  Page {page}: Found {len(items)} items")
                time.sleep(2)  # Rate limit
                
            except Exception as e:
                print(f"  Error on page {page}: {e}")
        
        print(f"Total games found: {len(self.found_games)}")
        return list(self.found_games)
    
    def get_popular_workshop_games(self):
        """Lấy games phổ biến có Workshop"""
        # Known games với Workshop support
        workshop_games = [
            4000,    # Garry's Mod
            107410,  # Arma 3
            255710,  # Cities Skylines
            294100,  # RimWorld
            346110,  # ARK
            413150,  # Stormworks
            629730,  # Barotrauma
            244850,  # Space Engineers
            281990,  # Stellaris
            394360,  # Hearts of Iron IV
            236850,  # Europa Universalis IV
            289070,  # Civilization VI
            8930,    # Civilization V
            211820,  # Starbound
            322330,  # Don't Starve Together
        ]
        return workshop_games
    
    def export_results(self, filename='workshop_games.txt'):
        """Export kết quả"""
        with open(filename, 'w') as f:
            for appid in sorted(self.found_games, key=int):
                f.write(f"{appid}\n")
        print(f"Exported to {filename}")

def main():
    crawler = WorkshopCrawler()
    
    # Method 1: Search Workshop
    print("=== Method 1: Workshop Search ===")
    games1 = crawler.search_workshop('lua', pages=3)
    
    # Method 2: Known Workshop games
    print("\n=== Method 2: Known Workshop Games ===")
    games2 = crawler.get_popular_workshop_games()
    print(f"Known Workshop games: {len(games2)}")
    
    # Combine
    all_games = set(games1 + [str(g) for g in games2])
    crawler.found_games = all_games
    
    print(f"\n=== Total: {len(all_games)} games ===")
    crawler.export_results()

if __name__ == '__main__':
    main()
