#!/usr/bin/env node
/**
 * SEA 二进制构建脚本
 *
 * 流程:
 *   1. pnpm build (tsc → dist/)
 *   2. node scripts/embed-client.mjs (生成 dist/embedded-client.js)
 *   3. esbuild 打包 dist/app.js + 所有纯 JS 依赖 → dist/bundle.cjs
 *   4. node --experimental-sea-config sea-config.json (生成 sea-prep.blob)
 *   5. 复制 Node.js 运行时
 *   6. postject 注入 blob → 最终二进制
 *
 * 用法:
 *   node scripts/build-sea.mjs win        # Windows x64
 *   node scripts/build-sea.mjs linux      # Linux x64
 *   node scripts/build-sea.mjs macos      # macOS x64 (arm64)
 *   node scripts/build-sea.mjs macos-x64  # macOS x64 (intel)
 *   node scripts/build-sea.mjs all        # 所有平台
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { rcedit } from 'rcedit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf-8'));
const version = pkg.version;

/** 平台构建目标 */
const TARGETS = {
  win: {
    nodePlatform: 'win32',
    nodeArch: 'x64',
    binaryName: `HiDNS-${version}-win-x64.exe`,
    seaNodeBinary: [ // Node.js 20 LTS SEA 二进制下载 URL
      `https://nodejs.org/dist/v20.18.3/win-x64/node.exe`,
    ],
  },
  linux: {
    nodePlatform: 'linux',
    nodeArch: 'x64',
    binaryName: `HiDNS-${version}-linux-x64`,
    seaNodeBinary: [
      `https://nodejs.org/dist/v20.18.3/linux-x64/node`,
    ],
  },
  macos: {
    nodePlatform: 'darwin',
    nodeArch: 'arm64',
    binaryName: `HiDNS-${version}-macos-arm64`,
    seaNodeBinary: [
      `https://nodejs.org/dist/v20.18.3/darwin-arm64/node`,
    ],
  },
  'macos-x64': {
    nodePlatform: 'darwin',
    nodeArch: 'x64',
    binaryName: `HiDNS-${version}-macos-x64`,
    seaNodeBinary: [
      `https://nodejs.org/dist/v20.18.3/darwin-x64/node`,
    ],
  },
};

/**
 * 执行 shell 命令并输出日志
 */
function run(cmd, label) {
  console.log(`\n🏗️  ${label || cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit' });
}

/**
 * 获取当前平台 Node.js 二进制路径
 */
function getNodeBinary() {
  if (process.platform === 'win32') return 'node.exe';
  return 'node';
}

/**
 * 构建单个平台
 */
async function buildForPlatform(targetName) {
  const target = TARGETS[targetName];
  if (!target) {
    console.error(`❌ Unknown target: ${targetName}`);
    console.error(`   Available: ${Object.keys(TARGETS).join(', ')}`);
    process.exit(1);
  }

  const buildDir = path.join(root, 'dist', 'sea');
  const blobPath = path.join(root, 'dist', 'sea-prep.blob');
  const outputBinary = path.join(buildDir, target.binaryName);

  // 清理并创建构建目录
  if (fs.existsSync(buildDir)) {
    fs.rmSync(buildDir, { recursive: true });
  }
  fs.mkdirSync(buildDir, { recursive: true });

  console.log(`\n═══════════════════════════════════════`);
  console.log(`  Building ${targetName}: ${target.binaryName}`);
  console.log(`═══════════════════════════════════════\n`);

  // Step 1: 编译 TypeScript
  run('pnpm build', 'Compiling TypeScript');

  // Step 2: 嵌入式客户端
  run('node scripts/embed-client.mjs', 'Embedding client build');

  // Step 3: esbuild 打包为单一 CJS
  //
  // 策略：
  // - 所有纯 JS 依赖 → 打包进 bundle.cjs（SEA 场景无需 node_modules）
  // - node:sqlite 是内置模块，无需 external
  // - 嵌入式客户端（dist/embedded-client.js）会被 esbuild 自动追踪打包

  const bundleCmd = [
    `npx esbuild dist/app.js`,
    `--bundle`,
    `--platform=node`,
    `--target=node24`,
    `--outfile=dist/bundle.cjs`,
    `--format=cjs`,
    `--legal-comments=none`,
    `--define:process.env.NODE_ENV="\\"production\\""`,
  ].join(' ');

  run(bundleCmd, 'Bundling with esbuild');

  // Step 4: 生成 SEA blob
  run('node --experimental-sea-config sea-config.json', 'Generating SEA blob');

  // Step 5: 复制 Node.js 运行时（优先使用本地版本）
  const nodeBinary = getNodeBinary();
  console.log(`\n📦 Copying Node.js runtime: ${nodeBinary}`);
  fs.copyFileSync(
    path.join(process.execPath),  // 当前 Node.js 运行时
    outputBinary
  );

  // 权限设置 (POSIX)
  if (process.platform !== 'win32') {
    fs.chmodSync(outputBinary, 0o755);
  }

  // Step 5b: Windows 平台 — 在注入 SEA blob 前设置应用信息（产品名、版权、图标）
  // 必须在 postject 注入之前执行，因为 rcedit 无法处理 SEA 注入后的 PE 格式
  if (targetName === 'win') {
    console.log(`\n🎨 Setting Windows executable resources...`);
    try {
      const clientPublic = path.resolve(root, '..', 'client', 'public');
      const iconPath = path.join(clientPublic, 'favicon.ico');
      const { rcedit } = await import('rcedit');
      await rcedit(outputBinary, {
        'version-string': {
          'ProductName': 'HiDNS',
          'CompanyName': 'HiPM-Tech',
          'LegalCopyright': `© ${new Date().getFullYear()} https://github.com/HiPM-Tech. All Rights Reserved.`,
          'FileDescription': 'HiDNS - DNS Management System',
          'ProductVersion': version,
          'FileVersion': version,
          'OriginalFilename': target.binaryName,
          'InternalName': 'HiDNS',
        },
        'file-version': version,
        'product-version': version,
        icon: fs.existsSync(iconPath) ? iconPath : undefined,
        'requested-execution-level': 'asInvoker',
      });
      console.log(`   ✅ ProductName: HiDNS`);
      console.log(`   ✅ Copyright: © ${new Date().getFullYear()} https://github.com/HiPM-Tech`);
      console.log(`   ✅ Icon: ${fs.existsSync(iconPath) ? iconPath : 'skipped (not found)'}`);
    } catch (err) {
      console.warn(`   ⚠️  Failed to set resources:`, err.message);
    }
  }

  // Step 6: postject 注入 blob
  const fuse = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';
  const postjectArgs = [
    outputBinary,
    'NODE_SEA_BLOB',
    blobPath,
    `--sentinel-fuse ${fuse}`,
  ];
  if (process.platform === 'darwin') {
    postjectArgs.push('--macho-segment-name NODE_SEA_BLOB');
  }

  run(`npx postject ${postjectArgs.join(' ')}`, 'Injecting SEA blob');

  // 清理临时文件
  const filesToClean = ['dist/bundle.cjs', 'dist/sea-prep.blob', 'dist/embedded-client.js'];
  for (const f of filesToClean) {
    const fp = path.join(root, f);
    if (fs.existsSync(fp)) fs.rmSync(fp);
  }

  console.log(`\n✅ ${target.binaryName} built successfully!`);
  console.log(`   Output: ${outputBinary}`);
  console.log(`   Size: ${(fs.statSync(outputBinary).size / 1024 / 1024).toFixed(1)} MB`);
}

// ── main ──
const targetArg = process.argv[2] || '';

if (targetArg === 'all') {
  console.log('Building for all platforms...');
  // 跨平台构建只能用各自的原生 Node.js
  for (const key of Object.keys(TARGETS)) {
    console.log(`\n========================================`);
    console.log(`  Target: ${key}`);
    console.log(`========================================`);
    buildForPlatform(key).catch(e => {
      console.error(`❌ Failed to build ${key}:`, e.message);
    });
  }
} else if (TARGETS[targetArg]) {
  buildForPlatform(targetArg).catch(e => { console.error('Build failed:', e.message); process.exit(1); });
} else {
  // 自动检测当前平台
  const platformMap = {
    win32: 'win',
    linux: 'linux',
    darwin: 'macos',
  };
  const detected = platformMap[process.platform];
  if (detected && TARGETS[detected]) {
    buildForPlatform(detected).catch(e => { console.error('Build failed:', e.message); process.exit(1); });
  } else {
    console.log('Available targets:');
    for (const key of Object.keys(TARGETS)) {
      console.log(`  node scripts/build-sea.mjs ${key}`);
    }
    console.log(`  node scripts/build-sea.mjs all`);
    console.log(`\nDetected platform: ${process.platform} (${detected ? '→ ' + detected : 'not supported'})`);
  }
}