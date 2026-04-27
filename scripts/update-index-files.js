#!/usr/bin/env node

/**
 * 批量更新所有提供商的 index.ts 以导出 auth 模块
 */

const fs = require('fs');
const path = require('path');

const providersDir = path.join(__dirname, '../server/src/lib/dns/providers');

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function updateIndex(providerName) {
  const providerDir = path.join(providersDir, providerName);
  const indexPath = path.join(providerDir, 'index.ts');
  const authPath = path.join(providerDir, 'auth.ts');
  
  if (!fs.existsSync(indexPath)) {
    console.log(`⚠️  index.ts 不存在: ${providerName}`);
    return false;
  }
  
  if (!fs.existsSync(authPath)) {
    console.log(`⚠️  auth.ts 不存在: ${providerName}，跳过`);
    return false;
  }
  
  let content = fs.readFileSync(indexPath, 'utf-8');
  
  // 检查是否已经导出了 auth
  if (content.includes("from './auth'")) {
    console.log(`✅ ${providerName}/index.ts 已包含 auth 导出`);
    return true;
  }
  
  const className = `${capitalizeFirst(providerName)}Adapter`;
  
  // 生成新的 index.ts 内容
  const newContent = `/**
 * ${capitalizeFirst(providerName)} Provider Module
 * 
 * This module exports all ${providerName} provider components:
 * - Adapter: DNS record management
 * - Auth: Authentication utilities
 */

// Main adapter for DNS record operations
export { ${className} } from './adapter';

// Authentication utilities
export {
  buildAuthHeaders as ${providerName}BuildAuthHeaders,
  authenticatedRequest as ${providerName}AuthenticatedRequest,
  validateCredentials as ${providerName}ValidateCredentials,
  type ${capitalizeFirst(providerName)}AuthConfig,
} from './auth';
`;
  
  fs.writeFileSync(indexPath, newContent, 'utf-8');
  console.log(`✅ ${providerName}/index.ts 已更新`);
  
  return true;
}

function main() {
  console.log('📝 开始更新 index.ts 文件...\n');
  
  const dirs = fs.readdirSync(providersDir).filter(item => {
    const fullPath = path.join(providersDir, item);
    return fs.statSync(fullPath).isDirectory();
  });
  
  let successCount = 0;
  
  dirs.forEach(dir => {
    if (updateIndex(dir)) {
      successCount++;
    }
  });
  
  console.log(`\n✨ 完成! 更新了 ${successCount} 个 index.ts 文件`);
}

main();
