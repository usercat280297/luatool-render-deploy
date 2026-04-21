require('dotenv').config();
const { exec } = require('child_process');
const path = require('path');

// Configuration
const CONFIG = {
  GITHUB_TOKEN: process.env.GITHUB_TOKEN,
  REPO_OWNER: process.env.GITHUB_REPO_OWNER,
  REPO_NAME: process.env.GITHUB_REPO_NAME,
  BRANCH: 'main', // Default branch
};

function log(message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [BACKUP] ${message}`);
}

function runCommand(command) {
  return new Promise((resolve, reject) => {
    // Execute in project root, not in scripts/ folder
    exec(command, { 
      cwd: path.join(__dirname, '..'),
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer to handle large git output
    }, (error, stdout, stderr) => {
      if (error) {
        reject({ error, stderr, stdout });
        return;
      }
      resolve(stdout.trim());
    });
  });
}

async function backupToGitHub() {
  log('Starting project backup...');

  if (!CONFIG.GITHUB_TOKEN || !CONFIG.REPO_OWNER || !CONFIG.REPO_NAME) {
    log('❌ Missing GitHub configuration in .env');
    return false;
  }

  // Construct authenticated URL
  // NOTE: Using token in URL is secure for transmission (HTTPS) but visible in process list/logs if not careful.
  // We use the local git config to set the remote URL temporarily or just use it for the push.
  const remoteUrl = `https://${CONFIG.GITHUB_TOKEN}@github.com/${CONFIG.REPO_OWNER}/${CONFIG.REPO_NAME}.git`;

  try {
    // 1. Check status
    log('Checking git status...');
    await runCommand('git status');

    // 2. Add all changes
    log('Adding files...');
    await runCommand('git add .');

    // 3. Commit
    const timestamp = new Date().toLocaleString('en-US');
    const commitMsg = `Auto backup: ${timestamp}`;
    
    try {
      log(`Committing changes: "${commitMsg}"...`);
      await runCommand(`git commit -m "${commitMsg}"`);
    } catch (e) {
      const errorMsg = (e.stdout || '') + (e.stderr || '');
      if (errorMsg.includes('nothing to commit') || errorMsg.includes('working tree clean')) {
        log('⚠️ No changes to commit.');
        // Proceed to push anyway in case there are unpushed commits
      } else {
        throw e;
      }
    }

    // 4. Pull latest changes (Rebase to keep history clean)
    log('Pulling latest changes from GitHub...');
    try {
      await runCommand(`git pull "${remoteUrl}" ${CONFIG.BRANCH} --rebase`);
    } catch (e) {
      log('⚠️ Pull failed, might be conflicts or first push.');
    }

    // 5. Push to GitHub
    log('Pushing to GitHub...');
    await runCommand(`git push "${remoteUrl}" ${CONFIG.BRANCH}`);

    log('✅ Backup successful!');
    return true;

  } catch (error) {
    log('❌ Backup failed!');
    console.error(error);
    return false;
  }
}

// Run if called directly
if (require.main === module) {
  backupToGitHub();
}

module.exports = { backupToGitHub };
