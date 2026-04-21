// ============================================
// SCRIPT TỰ ĐỘNG SETUP BOT
// Chạy: node setup.js
// ============================================

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setup() {
  console.log('\n' + '='.repeat(60));
  console.log('🤖 DISCORD LUA BOT - AUTO SETUP');
  console.log('='.repeat(60) + '\n');
  
  console.log('📝 Cần chuẩn bị:');
  console.log('1. Discord Bot Token');
  console.log('2. Steam API Key');
  console.log('3. Discord User ID của bạn (để làm admin)\n');
  
  // Lấy thông tin
  const botToken = await question('🔑 Discord Bot Token: ');
  const steamKey = await question('🎮 Steam API Key: ');
  const adminId = await question('👤 Discord User ID (admin): ');
  const prefix = await question('⚡ Command prefix (mặc định !): ') || '!';
  
  // Tạo config
  const config = {
    BOT_TOKEN: botToken.trim(),
    STEAM_API_KEY: steamKey.trim(),
    COMMAND_PREFIX: prefix.trim(),
    ADMIN_USER_IDS: [adminId.trim()],
    LUA_FILES_PATH: './lua_files',
    FIX_FILES_PATH: './fix_files',
    ONLINE_FIX_PATH: './online_fix',
  };
  
  // Tạo file .env
  const envContent = `BOT_TOKEN=${config.BOT_TOKEN}
STEAM_API_KEY=${config.STEAM_API_KEY}
COMMAND_PREFIX=${config.COMMAND_PREFIX}
ADMIN_USER_IDS=${config.ADMIN_USER_IDS.join(',')}
`;
  
  fs.writeFileSync('.env', envContent);
  console.log('\n✅ Đã tạo file .env');
  
  // Tạo folders
  const folders = [
    'lua_files',
    'fix_files', 
    'online_fix',
    'logs',
  ];
  
  folders.forEach(folder => {
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder);
      console.log(`✅ Đã tạo folder: ${folder}/`);
    }
  });
  
  // Tạo file README trong mỗi folder
  const readmeContent = {
    lua_files: `# LUA FILES

Đặt files .lua vào đây theo format:
- {appid}.lua (ví dụ: 2300320.lua)
- Hoặc: {appid}/game.lua (ví dụ: 2300320/game.lua)

Ví dụ:
lua_files/
├── 2300320.lua
├── 2622380.lua
├── 1234567.lua
└── 7654321/
    └── game.lua
`,
    fix_files: `# FIX FILES

Đặt files fix vào đây:
- {appid}.rar hoặc .zip (ví dụ: 2300320.rar)
- Hoặc: {appid}/fix.rar

Ví dụ:
fix_files/
├── 2300320.rar
├── 2622380.zip
└── 1234567/
    └── fix.rar
`,
    online_fix: `# ONLINE FIX FILES

Đặt files online fix vào đây:
- {appid}.rar hoặc .zip
- Hoặc: {appid}/online.rar

Ví dụ:
online_fix/
├── 2300320.rar
├── 2622380.zip
└── 1234567/
    └── online.rar
`,
  };
  
  Object.entries(readmeContent).forEach(([folder, content]) => {
    fs.writeFileSync(path.join(folder, 'README.md'), content);
  });
  
  console.log('\n✅ Đã tạo README trong các folders');
  
  // Tạo start script
  const startScript = process.platform === 'win32' ? 
    '@echo off\nnode bot.js\npause' : 
    '#!/bin/bash\nnode bot.js';
  
  const scriptName = process.platform === 'win32' ? 'start.bat' : 'start.sh';
  fs.writeFileSync(scriptName, startScript);
  if (process.platform !== 'win32') {
    fs.chmodSync(scriptName, '755');
  }
  
  console.log(`✅ Đã tạo script khởi động: ${scriptName}`);
  
  // Test connection
  console.log('\n🔍 Đang test connection...');
  
  try {
    const axios = require('axios');
    
    // Test Steam API
    const steamTest = await axios.get(
      `https://api.steampowered.com/ISteamWebAPIUtil/GetServerInfo/v1/?key=${config.STEAM_API_KEY}`,
      { timeout: 5000 }
    );
    
    if (steamTest.data) {
      console.log('✅ Steam API: OK');
    }
  } catch (error) {
    console.log('⚠️ Steam API: Không thể kết nối (kiểm tra lại key)');
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('✨ SETUP HOÀN TẤT!');
  console.log('='.repeat(60));
  console.log('\n📚 HƯỚNG DẪN TIẾP THEO:\n');
  console.log('1. Copy files vào folders tương ứng:');
  console.log('   - lua_files/     : Files .lua');
  console.log('   - fix_files/     : Files fix');
  console.log('   - online_fix/    : Files online fix\n');
  console.log('2. Chạy bot:');
  if (process.platform === 'win32') {
    console.log('   - Double click: start.bat');
    console.log('   - Hoặc: node bot.js\n');
  } else {
    console.log('   - ./start.sh');
    console.log('   - Hoặc: node bot.js\n');
  }
  console.log('3. Test trong Discord:');
  console.log(`   - ${prefix}help       : Xem lệnh`);
  console.log(`   - ${prefix}list       : Xem danh sách games`);
  console.log(`   - ${prefix}2300320    : Lấy game cụ thể\n`);
  console.log('💡 Tip: Dùng PM2 để chạy bot 24/7:');
  console.log('   npm install -g pm2');
  console.log('   pm2 start bot.js --name lua-bot');
  console.log('   pm2 save\n');
  
  rl.close();
}

// Run setup
setup().catch(error => {
  console.error('❌ Setup failed:', error);
  rl.close();
  process.exit(1);
});