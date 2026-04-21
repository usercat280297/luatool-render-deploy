***Before using this bot, ensure you have a render.com account and uptimerobot for auto-deployment***

# 🎮 Discord Lua Bot v2.1

> **Enhanced Discord bot for Steam game management with beautiful UI, real-time data, and automatic lua collection**

[![**Version**](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/usercat280297/Luatool)
[![**Node**](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![**License**](https://img.shields.io/badge/license-ISC-orange.svg)](LICENSE)

---

## ✨ Features

### 🎨 Beautiful UI
- **Responsive Design** - Works perfectly on PC & Mobile
- **Box Layout** - Clean, organized information display
- **Color Coding** - Visual DRM warnings (Red/Orange/Blue/Green)
- **Code Blocks** - Syntax-highlighted important info
- **English Support** - Fully localized labels

### 🔄 Real-time Data
- **SteamDB Integration** - Always fresh game information
- **Smart Cache** - 1-hour cache with manual refresh
- **Accurate Sizes** - Real download sizes from SteamDB
- **Live Updates** - Current players, price changes

### 📥 Auto Collection
- **GitHub Scraper** - Finds lua files automatically
- **Multi-source** - GitHub repos, Gists, known sources
- **Format Validation** - Only valid lua files
- **Duplicate Prevention** - Smart file management

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure .env file
# Add your BOT_TOKEN, GITHUB_TOKEN, etc.

# 3. Start bot
npm start

# 4. Test in Discord
!help
```

**📖 Full guide**: [**QUICKSTART.md**](QUICKSTART.md)

---

## 📋 Commands

### User Commands
| Command | Description | Example |
|---------|-------------|---------|
| `!<appid>` | View game info | `!1623730` |
| `!search <name>` | Search games | `!search tekken` |
| `!refresh <appid>` | Refresh data | `!refresh 1623730` |
| `!list` | List available games | `!list` |
| `!help` | Show help | `!help` |

### Admin Commands
| Command | Description |
|---------|-------------|
| `!collectlua` | Collect new lua files |
| `!stats` | View bot statistics |
| `!clearcache` | Clear all cache |
| `!toggleautodelete` | Toggle auto-delete |

---

## 📊 Statistics

```
✅ 29,947+ Lua files
✅ 30 Online-Fix files
✅ Real-time SteamDB data
✅ 1-hour smart cache
✅ Multi-source collection
```

---

## 🎯 What's New in v2.0

### 1. **Beautiful UI** 🎨
```
╔═══════════════════════════════╗
║  🎮 Steam Store • 📊 SteamDB  ║
╚═══════════════════════════════╝

**╔═══════════ 📋 GAME INFORMATION ═══════════╗**
Price: 💰 $29.99
Size: 💾 25 GB
Released: 📅 2024-01-19
```

### 2. **Real-time Updates** 🔄
- Cache reduced from 12h → 1h
- Manual refresh with `!refresh`
- Direct SteamDB scraping

### 3. **Auto Lua Collection** 📥
- Scrapes GitHub automatically
- Finds 100-500+ new files
- Validates format before saving

**📖 Full changelog**: [**CHANGELOG_v2.0.md**](CHANGELOG_v2.0.md)

---

## 🛠️ Installation

### Prerequisites
- Node.js >= 16.0.0
- npm or yarn
- Discord Bot Token
- GitHub Token (for lua collection)

### Setup

```bash
# Clone repository
git clone https://github.com/usercat280297/Luatool.git
cd discord-lua-bot

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your tokens

# Run tests
node test_features.js

# Start bot
npm start
```

### Windows Quick Setup
```bash
setup.bat
```

---

## 📁 Project Structure

```
discord-lua-bot/
├── lua_discord_bot.js          # Main bot
├── lua_collector.js            # Lua file collector
├── steamdb_updater.js          # SteamDB data updater
├── test_features.js            # Feature testing
├── setup.bat                   # Windows setup script
├── lua_files/                  # 4,000+ lua files
├── online_fix/                 # Online-Fix files
├── fix_files/                  # Crack/Fix files
├── logs/                       # Bot logs
├── .env                        # Configuration
└── package.json                # Dependencies
```

---

## 🔧 Configuration

### Environment Variables (.env)
```env
BOT_TOKEN=your_discord_bot_token
GITHUB_TOKEN=your_github_token
GITHUB_REPO_OWNER=usercat280297
GITHUB_REPO_NAME=Luatool
STEAM_API_KEY=your_steam_api_key
```

### Cache Settings
```javascript
CACHE_DURATION: 3600000, // 1 hour
```

---

## 📖 Documentation

- **[**Quick Start**](QUICKSTART.md)** - Get started in 3 steps
- **[**Usage Guide**](USAGE_GUIDE.md)** - Detailed usage instructions
- **[**Changelog**](CHANGELOG_v2.0.md)** - What's new in v2.0

---

## 🎯 Use Cases

### For Gamers
- 🎮 Find game information quickly
- 💾 Check accurate download sizes
- 🔒 See DRM protection status
- 🌐 Get Online-Fix files

### For Developers
- 📜 Access 30,000+ lua scripts
- 🔄 Auto-update game data
- 📊 Track game statistics
- 🤖 Integrate with Discord

---

## 🧪 Testing

```bash
# Run feature tests
node test_features.js

# Test lua collector
npm run collect-lua

# Test SteamDB updater
npm run update-steamdb

# Start bot in dev mode
npm run dev
```

---

## 📈 Performance

### Before v2.0
- ⏱️ Cache: 12 hours
- 📁 Lua files: ~4,000
- 🔄 Manual updates only
- 📱 Basic UI

### After v2.0
- ⚡ Cache: 1 hour
- 📁 Lua files: 30,000+ (expandable)
- 🔄 Auto-refresh available
- 📱 Beautiful responsive UI
- 🎯 Real-time SteamDB data

---

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

## 📞 Support

### Issues?
1. Check [**USAGE_GUIDE.md**](USAGE_GUIDE.md)
2. Run `node test_features.js`
3. Check logs in `logs/` folder
4. Open an issue on GitHub

### Common Problems

**Bot won't start?**
```bash
# Check environment
node test_features.js

# Reinstall dependencies
npm install
```

**No lua files?**
```bash
# Collect lua files
npm run collect-lua
```

**Old data?**
```bash
# Refresh in Discord
!refresh <appid>

# Or clear cache
!clearcache
```

---

## 🔮 Roadmap

### v2.1 (Coming Soon)
- [ ] cs.rin.ru integration
- [ ] Reddit API integration
- [ ] Scheduled auto-collection

### v3.0 (Future)
- [ ] Web dashboard
- [ ] Multi-language support
- [ ] Price tracking
- [ ] Game recommendations

---

## 📜 License

ISC License - see [**LICENSE**](LICENSE) file for details

---

## 🙏 Acknowledgments

- **Discord.js** - Discord API wrapper
- **Axios** - HTTP client
- **Cheerio** - HTML scraping
- **SteamDB** - Game data source
- **GitHub** - Lua file hosting

---

## 📊 Stats

![**GitHub stars**](https://img.shields.io/github/stars/usercat280297/Luatool?style=social)
![**GitHub forks**](https://img.shields.io/github/forks/usercat280297/Luatool?style=social)
![**GitHub issues**](https://img.shields.io/github/issues/usercat280297/Luatool)

---

## 🎉 Thank You!
## I'll update soon :3

Made by crackvingheo

**Star ⭐ this repo if you find it useful!**

---

**Version**: 2.0.0  
**Last Updated**: 2025-01-29  
**Status**: ✅ Production Ready
