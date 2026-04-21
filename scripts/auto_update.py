"""
Auto-update script - Chạy định kỳ để cập nhật games list
"""
import json
import time
from datetime import datetime
from advanced_crawler import AdvancedGameCrawler
from merge_games import merge_game_lists

def auto_update():
    """Tự động cập nhật games list"""
    print(f"=== Auto Update Started: {datetime.now()} ===\n")
    
    # 1. Run crawler
    print("Step 1: Running crawler...")
    crawler = AdvancedGameCrawler()
    games = crawler.crawl_comprehensive()
    crawler.export_to_csv('games_list.csv')
    crawler.export_with_names('games_with_names.csv')
    
    # 2. Merge with existing
    print("\nStep 2: Merging with existing list...")
    total = merge_game_lists()
    
    # 3. Generate report
    print("\nStep 3: Generating report...")
    report = {
        'timestamp': datetime.now().isoformat(),
        'total_games': total,
        'sources': {
            'known_games': len(games),
            'steam_api': 0,  # TODO
            'github': 0,     # TODO
        }
    }
    
    with open('update_report.json', 'w') as f:
        json.dump(report, f, indent=2)
    
    print(f"\n=== Update Complete: {total} games ===")
    print(f"Report saved to update_report.json")
    
    return report

if __name__ == '__main__':
    try:
        report = auto_update()
        print("\nSuccess!")
    except Exception as e:
        print(f"\nError: {e}")
        raise
