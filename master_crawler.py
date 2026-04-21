"""
Master Crawler - Chạy tất cả crawlers và tổng hợp kết quả
"""
import json
from pathlib import Path
from known_games import get_all_known_games, KNOWN_LUA_GAMES
from advanced_crawler import AdvancedGameCrawler
from workshop_crawler import WorkshopCrawler

def run_all_crawlers():
    """Chạy tất cả crawlers"""
    all_games = {}
    
    print("="*60)
    print("MASTER CRAWLER - Collecting from all sources")
    print("="*60)
    
    # 1. Known games
    print("\n[1/3] Loading known games database...")
    known = get_all_known_games()
    for appid in known:
        all_games[str(appid)] = KNOWN_LUA_GAMES.get(appid, f'Game {appid}')
    print(f"      OK {len(known)} games from known database")
    
    # 2. Advanced crawler (Steam API + GitHub)
    print("\n[2/3] Running advanced crawler...")
    try:
        crawler = AdvancedGameCrawler()
        games = crawler.crawl_comprehensive()
        all_games.update(games)
        print(f"      OK Total after advanced crawl: {len(all_games)} games")
    except Exception as e:
        print(f"      ERROR: {e}")
    
    # 3. Workshop crawler
    print("\n[3/3] Running workshop crawler...")
    try:
        workshop = WorkshopCrawler()
        workshop_games = workshop.get_popular_workshop_games()
        for appid in workshop_games:
            if str(appid) not in all_games:
                all_games[str(appid)] = f'Game {appid}'
        print(f"      OK Total after workshop: {len(all_games)} games")
    except Exception as e:
        print(f"      ERROR: {e}")
    
    return all_games

def export_final_results(games):
    """Export kết quả cuối cùng"""
    import csv
    
    # CSV chuẩn
    with open('games_list_final.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['AppID', 'Files', 'Types', 'Paths'])
        for appid in sorted(games.keys(), key=int):
            writer.writerow([appid, 1, 'lua', f'{appid}.lua'])
    
    # CSV có tên
    with open('games_list_final_names.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['AppID', 'Name', 'Files', 'Types', 'Paths'])
        for appid in sorted(games.keys(), key=int):
            writer.writerow([appid, games[appid], 1, 'lua', f'{appid}.lua'])
    
    # JSON
    with open('games_list_final.json', 'w', encoding='utf-8') as f:
        json.dump(games, f, indent=2, ensure_ascii=False)
    
    print("\n" + "="*60)
    print(f"COMPLETE! Total: {len(games)} games")
    print("="*60)
    print("\nFiles created:")
    print("  - games_list_final.csv")
    print("  - games_list_final_names.csv")
    print("  - games_list_final.json")
    print("\nTop 10 games:")
    for i, (appid, name) in enumerate(sorted(games.items(), key=lambda x: int(x[0]))[:10], 1):
        print(f"  {i}. [{appid}] {name}")

def main():
    games = run_all_crawlers()
    export_final_results(games)

if __name__ == '__main__':
    main()
