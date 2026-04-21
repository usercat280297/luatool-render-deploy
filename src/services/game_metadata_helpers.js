const path = require('path');

function detectDRMAccurate(appId, steamData, { verifiedDRM, icons }) {
  const numAppId = parseInt(appId, 10);

  const drmInfo = {
    type: 'None',
    hasDenuvo: false,
    hasEAC: false,
    hasBattlEye: false,
    hasEAAntiCheat: false,
    hasSteamDRM: false,
    isDRMFree: true,
    severity: 'none',
    icon: icons.drmFree,
    needsOnlineFix: false,
  };

  if (verifiedDRM.drmFree.includes(numAppId)) {
    drmInfo.type = 'DRM-Free';
    drmInfo.isDRMFree = true;
    drmInfo.severity = 'none';
    drmInfo.icon = icons.drmFree;
    return drmInfo;
  }

  if (verifiedDRM.denuvo.includes(numAppId)) {
    drmInfo.hasDenuvo = true;
    drmInfo.type = 'Denuvo Anti-Tamper';
    drmInfo.severity = 'critical';
    drmInfo.icon = icons.denuvo;
    drmInfo.isDRMFree = false;
    return drmInfo;
  }

  if (verifiedDRM.easyAntiCheat.includes(numAppId)) {
    drmInfo.hasEAC = true;
    drmInfo.type = 'EasyAntiCheat';
    drmInfo.severity = 'warning';
    drmInfo.icon = icons.antiCheat;
    drmInfo.isDRMFree = false;
  }

  if (verifiedDRM.battleye.includes(numAppId)) {
    drmInfo.hasBattlEye = true;
    drmInfo.type = 'BattlEye Anti-Cheat';
    drmInfo.severity = 'warning';
    drmInfo.icon = icons.antiCheat;
    drmInfo.isDRMFree = false;
  }

  if (verifiedDRM.needsOnlineFix.includes(numAppId)) {
    drmInfo.needsOnlineFix = true;
  }

  if (drmInfo.isDRMFree && steamData?.categories) {
    const hasMultiplayer = steamData.categories.some((cat) =>
      ['multiplayer', 'multi-player', 'co-op', 'online'].some((kw) =>
        String(cat || '').toLowerCase().includes(kw)
      )
    );

    if (hasMultiplayer) {
      drmInfo.hasSteamDRM = true;
      drmInfo.type = 'Steam DRM';
      drmInfo.severity = 'info';
      drmInfo.icon = icons.drm;
      drmInfo.isDRMFree = false;

      if (!verifiedDRM.drmFree.includes(numAppId)) {
        drmInfo.needsOnlineFix = true;
      }
    }
  }

  if (drmInfo.isDRMFree && !verifiedDRM.drmFree.includes(numAppId)) {
    drmInfo.hasSteamDRM = true;
    drmInfo.type = 'Steam DRM';
    drmInfo.severity = 'info';
    drmInfo.icon = icons.drm;
    drmInfo.isDRMFree = false;
  }

  return drmInfo;
}

function detectPublisher(publishers) {
  if (!publishers || publishers.length === 0) {
    return { name: 'Unknown', isEA: false, isUbisoft: false };
  }

  const pub = publishers[0];

  return {
    name: pub,
    isEA: ['Electronic Arts', 'EA Games', 'EA Sports'].some((ea) => pub.includes(ea)),
    isUbisoft: pub.includes('Ubisoft'),
    isActivision: pub.includes('Activision'),
    isRockstar: pub.includes('Rockstar'),
  };
}

function getManifestFileMeta(fileName) {
  const ext = path.extname(fileName || '').toLowerCase();

  if (ext === '.lua') {
    return {
      kind: 'lua',
      label: 'Lua Script',
      emoji: '📜',
      shortType: 'lua',
      instruction:
        '```\n1. Download the Lua file\n2. Place it in your game directory\n3. Use with your Lua loader\n4. Launch the game\n```'
    };
  }

  if (ext === '.zip' || ext === '.rar' || ext === '.7z') {
    return {
      kind: 'archive',
      label: 'Manifest Package',
      emoji: '📦',
      shortType: ext.replace('.', '').toUpperCase(),
      instruction:
        '```\n1. Download the archive package\n2. Extract all files\n3. Copy manifests to the correct game folder\n4. Replace files if asked\n```'
    };
  }

  return {
    kind: 'file',
    label: 'Manifest File',
    emoji: '📁',
    shortType: ext ? ext.replace('.', '').toUpperCase() : 'FILE',
    instruction:
      '```\n1. Download the file\n2. Place it in your game directory\n3. Start the game\n```'
  };
}

function buildManifestSummaryLines({ gameInfo, appId, files, canEmbed, warningIcon = '⚠️' }) {
  const lines = [];
  const primaryManifest = files.lua?.[0];

  lines.push(`📦 Here are your manifest files for **${gameInfo.name}**`);

  if (primaryManifest) {
    const meta = getManifestFileMeta(primaryManifest.name);
    lines.push(`✅ Primary file: \`${primaryManifest.name}\` (${primaryManifest.sizeFormatted}) • ${meta.label}`);
  } else {
    lines.push('⚠️ No local manifest file found yet.');
  }

  lines.push(`🆔 App ID: \`${appId}\``);

  if (canEmbed === false) {
    lines.push(`${warningIcon} Missing permission: **Embed Links**. Showing text + buttons only.`);
  }

  return lines;
}

module.exports = {
  buildManifestSummaryLines,
  detectDRMAccurate,
  detectPublisher,
  getManifestFileMeta,
};
