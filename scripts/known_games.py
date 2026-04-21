# Known Steam games with Lua scripting support
# Source: Community knowledge, SteamDB, PCGamingWiki

KNOWN_LUA_GAMES = {
    # Source Engine Games
    4000: "Garry's Mod",
    220: "Half-Life 2",
    320: "Half-Life 2: Deathmatch",
    340: "Half-Life 2: Lost Coast",
    380: "Half-Life 2: Episode One",
    420: "Half-Life 2: Episode Two",
    440: "Team Fortress 2",
    550: "Left 4 Dead 2",
    570: "Dota 2",
    730: "Counter-Strike: Global Offensive",
    
    # Arma Series
    107410: "Arma 3",
    33930: "Arma 2",
    211820: "Starbound",
    233250: "Arma 2: Operation Arrowhead",
    
    # Survival/Sandbox
    251570: "7 Days to Die",
    252490: "Rust",
    304930: "Unturned",
    346110: "ARK: Survival Evolved",
    413150: "Stormworks: Build and Rescue",
    629730: "Barotrauma",
    
    # Strategy/Simulation
    255710: "Cities: Skylines",
    294100: "RimWorld",
    236850: "Europa Universalis IV",
    203770: "Crusader Kings II",
    281990: "Stellaris",
    
    # RPG/Adventure
    105600: "Terraria",
    1145360: "Hades",
    362890: "Black Mesa",
    
    # GTA Series
    271590: "Grand Theft Auto V",
    12210: "Grand Theft Auto IV",
    12220: "Grand Theft Auto: San Andreas",
    
    # Crysis Series
    17300: "Crysis",
    17330: "Crysis Warhead",
    108800: "Crysis 2",
    
    # Civilization Series
    8930: "Sid Meier's Civilization V",
    289070: "Sid Meier's Civilization VI",
    
    # Other Popular Games
    230410: "Warframe",
    359550: "Tom Clancy's Rainbow Six Siege",
    578080: "PLAYERUNKNOWN'S BATTLEGROUNDS",
    1172470: "Apex Legends",
    
    # Indie Games with Lua
    239140: "Dying Light",
    242760: "The Forest",
    322330: "Don't Starve Together",
    367520: "Hollow Knight",
    394360: "Hearts of Iron IV",
    
    # Modding-Friendly Games
    72850: "The Elder Scrolls V: Skyrim",
    489830: "The Elder Scrolls V: Skyrim Special Edition",
    377160: "Fallout 4",
    22380: "Fallout: New Vegas",
    
    # Multiplayer Games
    252950: "Rocket League",
    431960: "Wallpaper Engine",
    513710: "Payday 2",
    
    # Simulation
    227300: "Euro Truck Simulator 2",
    270880: "American Truck Simulator",
    244850: "Space Engineers",
    
    # Resident Evil Series
    2050650: "Resident Evil 4 Remake",
    883710: "Resident Evil 2 Remake",
    952060: "Resident Evil 3 Remake",
    1196590: "Resident Evil Village",
    418370: "Resident Evil 7",
    304240: "Resident Evil 6",
    221040: "Resident Evil 5",
    222480: "Resident Evil Revelations",
}

# Additional AppIDs from various sources
ADDITIONAL_APPIDS = [
    # Workshop/Modding games
    431960, 513710, 244850, 227300, 270880,
    
    # Indie Lua games
    588650, 739630, 774361, 823500, 975370,
    
    # Strategy games
    1158310, 1222680, 1240440, 1332010, 1426210,
]

def get_all_known_games():
    """Trả về tất cả AppID đã biết"""
    return list(KNOWN_LUA_GAMES.keys()) + ADDITIONAL_APPIDS

def get_game_name(appid):
    """Lấy tên game nếu có"""
    return KNOWN_LUA_GAMES.get(appid, f"Unknown Game {appid}")
