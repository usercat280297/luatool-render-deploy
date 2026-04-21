import csv
from pathlib import Path

def merge_game_lists():
    """Merge old and new game lists"""
    old_games = set()
    new_games = {}
    
    # Read old list
    old_file = 'games_list.csv'
    if Path(old_file).exists():
        with open(old_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                old_games.add(row['AppID'])
        print(f"Old list: {len(old_games)} games")
    
    # Read new list with names
    new_file = 'games_with_names.csv'
    if Path(new_file).exists():
        with open(new_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                new_games[row['AppID']] = row['Name']
        print(f"New list: {len(new_games)} games")
    
    # Merge
    all_games = old_games.union(set(new_games.keys()))
    print(f"Total unique: {len(all_games)} games")
    
    # Export merged list
    with open('games_list_merged.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['AppID', 'Files', 'Types', 'Paths'])
        for appid in sorted(all_games, key=int):
            writer.writerow([appid, 1, 'lua', f'{appid}.lua'])
    
    # Export with names
    with open('games_list_merged_names.csv', 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(['AppID', 'Name', 'Files', 'Types', 'Paths'])
        for appid in sorted(all_games, key=int):
            name = new_games.get(appid, f'Game {appid}')
            writer.writerow([appid, name, 1, 'lua', f'{appid}.lua'])
    
    print(f"\nMerged files created:")
    print(f"  - games_list_merged.csv ({len(all_games)} games)")
    print(f"  - games_list_merged_names.csv (with names)")
    
    return len(all_games)

if __name__ == '__main__':
    total = merge_game_lists()
    print(f"\nDone! Total: {total} games")
