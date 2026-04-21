// ============================================
// SCRIPT TỰ ĐỘNG SẮP XẾP FILES
// Dùng khi bạn có folder lộn xộn cần sắp xếp
// Chạy: node organize.js
// ============================================

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

// Extract AppID from filename
function extractAppId(filename) {
  // Tìm chuỗi số dài (AppID thường 6-7 chữ số)
  const matches = filename.match(/(\d{6,8})/g);
  return matches ? matches[0] : null;
}

// Phân loại file
function categorizeFile(filename) {
  const lower = filename.toLowerCase();
  
  if (lower.endsWith('.lua')) {
    return 'lua';
  }
  
  if (lower.includes('online') && (lower.endsWith('.rar') || lower.endsWith('.zip') || lower.endsWith('.7z'))) {
    return 'online_fix';
  }
  
  if (lower.endsWith('.rar') || lower.endsWith('.zip') || lower.endsWith('.7z')) {
    return 'fix';
  }
  
  return 'unknown';
}

// Scan folder và tìm files
function scanFolder(folderPath) {
  if (!fs.existsSync(folderPath)) {
    return [];
  }
  
  const files = [];
  
  function scan(dir) {
    const items = fs.readdirSync(dir);
    
    items.forEach(item => {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        scan(fullPath);
      } else {
        const category = categorizeFile(item);
        const appId = extractAppId(item);
        
        if (appId && category !== 'unknown') {
          files.push({
            path: fullPath,
            name: item,
            appId,
            category,
            size: stat.size,
          });
        }
      }
    });
  }
  
  scan(folderPath);
  return files;
}

// Organize files
function organizeFiles(files, targetFolders, mode = 'copy') {
  const results = {
    success: [],
    failed: [],
    skipped: [],
  };
  
  files.forEach(file => {
    try {
      let targetFolder;
      
      if (file.category === 'lua') {
        targetFolder = targetFolders.lua;
      } else if (file.category === 'fix') {
        targetFolder = targetFolders.fix;
      } else if (file.category === 'online_fix') {
        targetFolder = targetFolders.online;
      }
      
      if (!targetFolder) {
        results.skipped.push({ file: file.name, reason: 'No target folder' });
        return;
      }
      
      // Tạo folder nếu chưa có
      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
      }
      
      // Đường dẫn đích
      const targetPath = path.join(targetFolder, file.name);
      
      // Kiểm tra file đã tồn tại
      if (fs.existsSync(targetPath)) {
        results.skipped.push({ 
          file: file.name, 
          reason: 'File already exists',
          appId: file.appId,
        });
        return;
      }
      
      // Copy hoặc move
      if (mode === 'copy') {
        fs.copyFileSync(file.path, targetPath);
      } else {
        fs.renameSync(file.path, targetPath);
      }
      
      results.success.push({
        file: file.name,
        appId: file.appId,
        from: file.path,
        to: targetPath,
      });
      
    } catch (error) {
      results.failed.push({
        file: file.name,
        error: error.message,
      });
    }
  });
  
  return results;
}

// Format size
function formatSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

// Main
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('📁 AUTO ORGANIZE FILES');
  console.log('='.repeat(60) + '\n');
  
  console.log('Script này sẽ tự động sắp xếp files theo AppID\n');
  
  // Input folder
  const sourceFolder = await question('📂 Đường dẫn folder chứa files (hoặc Enter = thư mục hiện tại): ');
  const source = sourceFolder.trim() || '.';
  
  if (!fs.existsSync(source)) {
    console.log('❌ Folder không tồn tại!');
    rl.close();
    return;
  }
  
  // Scan files
  console.log('\n🔍 Đang scan files...\n');
  const files = scanFolder(source);
  
  if (files.length === 0) {
    console.log('❌ Không tìm thấy files phù hợp!');
    rl.close();
    return;
  }
  
  // Thống kê
  const stats = {
    lua: files.filter(f => f.category === 'lua').length,
    fix: files.filter(f => f.category === 'fix').length,
    online_fix: files.filter(f => f.category === 'online_fix').length,
  };
  
  console.log('📊 Tìm thấy:');
  console.log(`   - Lua files: ${stats.lua}`);
  console.log(`   - Fix files: ${stats.fix}`);
  console.log(`   - Online fix: ${stats.online_fix}`);
  console.log(`   - Tổng: ${files.length} files\n`);
  
  // Show sample
  console.log('📋 Ví dụ files:');
  files.slice(0, 5).forEach(f => {
    console.log(`   - ${f.name} → AppID: ${f.appId} (${formatSize(f.size)})`);
  });
  if (files.length > 5) {
    console.log(`   ... và ${files.length - 5} files khác\n`);
  }
  
  // Xác nhận
  const confirm = await question('\n✅ Tiếp tục? (y/n): ');
  if (confirm.toLowerCase() !== 'y') {
    console.log('❌ Hủy bỏ!');
    rl.close();
    return;
  }
  
  // Mode
  const mode = await question('📦 Copy hay Move files? (copy/move): ');
  const selectedMode = mode.toLowerCase() === 'move' ? 'move' : 'copy';
  
  // Target folders
  const targetFolders = {
    lua: './lua_files',
    fix: './fix_files',
    online: './online_fix',
  };
  
  // Create folders
  Object.values(targetFolders).forEach(folder => {
    if (!fs.existsSync(folder)) {
      fs.mkdirSync(folder, { recursive: true });
    }
  });
  
  // Organize
  console.log(`\n⚙️ Đang ${selectedMode === 'copy' ? 'copy' : 'move'} files...\n`);
  const results = organizeFiles(files, targetFolders, selectedMode);
  
  // Results
  console.log('\n' + '='.repeat(60));
  console.log('📊 KẾT QUẢ');
  console.log('='.repeat(60) + '\n');
  
  console.log(`✅ Thành công: ${results.success.length}`);
  console.log(`⚠️ Đã tồn tại: ${results.skipped.length}`);
  console.log(`❌ Lỗi: ${results.failed.length}\n`);
  
  if (results.success.length > 0) {
    console.log('✅ Files đã organize:');
    results.success.forEach(r => {
      console.log(`   - ${r.file} (AppID: ${r.appId})`);
    });
  }
  
  if (results.skipped.length > 0 && results.skipped.length <= 10) {
    console.log('\n⚠️ Files đã tồn tại (bỏ qua):');
    results.skipped.forEach(r => {
      console.log(`   - ${r.file} (${r.reason})`);
    });
  } else if (results.skipped.length > 10) {
    console.log(`\n⚠️ ${results.skipped.length} files đã tồn tại (bỏ qua)`);
  }
  
  if (results.failed.length > 0) {
    console.log('\n❌ Lỗi:');
    results.failed.forEach(r => {
      console.log(`   - ${r.file}: ${r.error}`);
    });
  }
  
  // Summary by AppID
  const appIds = new Set(results.success.map(r => r.appId));
  console.log(`\n🎮 Tổng số games: ${appIds.size}`);
  
  // Create report
  const report = {
    timestamp: new Date().toISOString(),
    mode: selectedMode,
    source: source,
    stats: {
      total: files.length,
      success: results.success.length,
      skipped: results.skipped.length,
      failed: results.failed.length,
    },
    games: Array.from(appIds),
  };
  
  fs.writeFileSync('organize_report.json', JSON.stringify(report, null, 2));
  console.log('\n📄 Report đã lưu: organize_report.json');
  
  console.log('\n✨ Hoàn tất!\n');
  
  rl.close();
}

main().catch(error => {
  console.error('❌ Error:', error);
  rl.close();
});