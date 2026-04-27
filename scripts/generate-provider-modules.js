#!/usr/bin/env node

/**
 * 批量生成 DNS 提供商模块化结构脚本
 * 
 * 用法: node scripts/generate-provider-modules.js
 */

const fs = require('fs');
const path = require('path');

const providersDir = path.join(__dirname, '../server/src/lib/dns/providers');

// 提供商列表（排除已完成的和特殊文件）
const providers = [
  'aliyun',
  'dnspod', 
  'tencenteo',
  'huawei',
  'baidu',
  'rainyun',
  'bt',
  'vps8',
  'spaceship',
  'namesilo',
  'west',
  'qingcloud',
  'powerdns',
  'huoshan',
  'jdcloud',
  'caihongdns',
  'dnsla',
  'dnsmgr',
  'aliyunesa'
];

// 跳过已模块化的提供商
const skipProviders = ['dnshe', 'cloudflare'];

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function generateIndexContent(providerName) {
  const className = `${capitalizeFirst(providerName)}Adapter`;
  
  return `/**
 * ${capitalizeFirst(providerName)} Provider Module
 * 
 * This module exports all ${providerName} provider components:
 * - Adapter: DNS record management
 */

// Main adapter for DNS record operations
export { ${className} } from './adapter';
`;
}

function main() {
  console.log('🚀 开始生成 DNS 提供商模块化结构...\n');
  
  let successCount = 0;
  let skipCount = 0;
  
  providers.forEach(provider => {
    if (skipProviders.includes(provider)) {
      console.log(`⏭️  跳过 ${provider} (已完成)`);
      skipCount++;
      return;
    }
    
    const providerDir = path.join(providersDir, provider);
    const indexPath = path.join(providerDir, 'index.ts');
    
    // 检查目录是否存在
    if (!fs.existsSync(providerDir)) {
      console.error(`❌ 目录不存在: ${providerDir}`);
      return;
    }
    
    // 生成 index.ts
    const content = generateIndexContent(provider);
    fs.writeFileSync(indexPath, content, 'utf-8');
    
    console.log(`✅ ${provider}/index.ts 已生成`);
    successCount++;
  });
  
  console.log(`\n📊 统计:`);
  console.log(`   - 成功生成: ${successCount}`);
  console.log(`   - 跳过: ${skipCount}`);
  console.log(`   - 总计: ${providers.length}`);
  console.log(`\n✨ 下一步: 将各提供商的 .ts 文件内容提取到 adapter.ts`);
}

main();
