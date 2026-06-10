/**
 * HiDNS SEA Auto-Updater
 *
 * When running as a SEA binary (Single Executable Application), this module
 * periodically checks GitHub Releases for new versions and can perform
 * self-replacement (download → replace binary → restart).
 *
 * Controlled by env: HIDNS_AUTO_UPDATE=true|false (default: true)
 */

import { createLogger } from '../lib/logger';
import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';

const log = createLogger('Updater');

const GITHUB_API = 'https://api.github.com/repos/HiPM-Tech/HiDNS/releases/latest';

/* ───────── helpers ───────── */

function getCurrentVersion(): string {
  try {
    const pkgPath = path.join(__dirname, '../../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    return (pkg.version as string) || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** Build asset name pattern for current platform+arch, e.g. `HiDNS-*-linux-x64` */
function buildAssetGlob(): RegExp {
  const pMap: Record<string, string> = { win32: 'win', linux: 'linux', darwin: 'macos' };
  const aMap: Record<string, string> = { x64: 'x64', arm64: 'arm64' };
  const plat = pMap[process.platform];
  const arch = aMap[process.arch];
  if (!plat || !arch) throw new Error(`Unsupported platform: ${process.platform} ${process.arch}`);
  const ext = process.platform === 'win32' ? '\\.exe' : '';
  return new RegExp(`^HiDNS-[^/]+-${plat}-${arch}${ext}$`);
}

function fetchJSON(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { 'User-Agent': 'HiDNS-AutoUpdater/2.0', Accept: 'application/vnd.github.v3+json' },
      timeout: 15_000,
    }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } }
        else reject(new Error(`GitHub API returned ${res.statusCode}`));
      });
    }).on('error', reject);
  });
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { headers: { 'User-Agent': 'HiDNS-AutoUpdater/2.0' } }, (res) => {
      if (res.statusCode !== 200) { reject(new Error(`Download failed: ${res.statusCode}`)); return; }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => { fs.unlink(dest, () => {}); reject(err); });
  });
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return 1;
    if (na < nb) return -1;
  }
  return 0;
}

/* ───────── types ───────── */

interface GitHubAsset { name: string; browser_download_url: string; size: number }
interface GitHubRelease { tag_name: string; name: string; published_at: string; assets: GitHubAsset[] }

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseName?: string;
  downloadUrl?: string;
  error?: string;
}

/* ───────── public API ───────── */

/** Check GitHub for a newer release matching this platform */
export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const currentVersion = getCurrentVersion();
  try {
    const release = (await fetchJSON(GITHUB_API)) as GitHubRelease;
    const latestVersion = release.tag_name.replace(/^v/, '');

    if (compareVersions(latestVersion, currentVersion) > 0) {
      const pattern = buildAssetGlob();
      const asset = release.assets.find(a => pattern.test(a.name));
      if (!asset) {
        return { hasUpdate: true, currentVersion, latestVersion, releaseName: release.name, error: 'No matching asset for platform' };
      }
      return { hasUpdate: true, currentVersion, latestVersion, releaseName: release.name, downloadUrl: asset.browser_download_url };
    }

    return { hasUpdate: false, currentVersion };
  } catch (err: any) {
    return { hasUpdate: false, currentVersion, error: err.message };
  }
}

/**
 * Download the update and create a restart script.
 * Returns the script path (caller should spawn it and exit).
 */
export async function downloadUpdate(downloadUrl: string): Promise<string> {
  const currentBinary = process.execPath;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hidns-update-'));
  const tmpFile = path.join(tmpDir, path.basename(currentBinary));

  log.info(`Downloading update from ${downloadUrl}`);
  console.log(`⬇️  Downloading update...`);
  await downloadFile(downloadUrl, tmpFile);

  if (process.platform !== 'win32') fs.chmodSync(tmpFile, 0o755);

  // Reconstruct original CLI args (strip -u since env var handles it)
  const raw = process.argv.slice(2);
  const restartArgs: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === '-u') { i++; continue; } // skip -u and its value
    restartArgs.push(raw[i]);
  }
  const argsStr = restartArgs.join(' ');

  const binaryName = path.basename(currentBinary);

  if (process.platform === 'win32') {
    // Windows: batch script — wait for exit → replace → start
    const scriptPath = path.join(tmpDir, 'update.bat');
    const script = `@echo off\r\n`
      + `echo 🔄 Updating HiDNS...\r\n`
      + `timeout /t 3 /nobreak >nul\r\n`
      + `:retry\r\n`
      + `move /y "${tmpFile}" "${currentBinary}" >nul 2>&1\r\n`
      + `if %errorlevel% neq 0 ( timeout /t 1 /nobreak >nul & goto retry )\r\n`
      + `start "" "${currentBinary}" ${argsStr}\r\n`
      + `del "%~f0"\r\n`;
    fs.writeFileSync(scriptPath, script);
    return scriptPath;
  }

  // Unix: shell script — wait → replace → exec
  const scriptPath = path.join(tmpDir, 'update.sh');
  const script = `#!/bin/sh\n`
    + `echo "🔄 Updating HiDNS..."\n`
    + `sleep 3\n`
    + `cp -f "${tmpFile}" "${currentBinary}" 2>/dev/null || { sleep 1; cp -f "${tmpFile}" "${currentBinary}"; }\n`
    + `chmod +x "${currentBinary}"\n`
    + `exec "${currentBinary}" ${argsStr}\n`;
  fs.writeFileSync(scriptPath, script);
  fs.chmodSync(scriptPath, 0o755);
  return scriptPath;
}