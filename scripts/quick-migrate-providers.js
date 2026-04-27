#!/usr/bin/env node

/**
 * 快速迁移 DNS 提供商到模块化结构
 * 自动替换导入路径并生成 adapter.ts
 */

const fs = require('fs');
const path = require('path');

const providersDir = path.join(__dirname, '../server/src/lib/dns/providers');

// 要迁移的提供商（按优先级排序）
const providers = [
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

function migrateProvider(providerName) {
  const sourceFile = path.join(providersDir, `${providerName}.ts`);
  const targetDir = path.join(providersDir, providerName);
  const targetFile = path.join(targetDir, 'adapter.ts');
  
  if (!fs.existsSync(sourceFile)) {
    console.log(`⚠️  源文件不存在: ${providerName}.ts`);
    return false;
  }
  
  // 读取源文件
  let content = fs.readFileSync(sourceFile, 'utf-8');
  
  // 替换导入路径 - 使用更精确的正则
  const replacements = [
    [/"\.\.\/DnsInterface"/g, "'../internal'"],
    [/'\.\.\/DnsInterface'/g, "'../internal'"],
    [/"\.\/common"/g, "'../internal'"],
    [/'\.\/common'/g, "'../internal'"],
    [/"\.\.\/logger"/g, "'../internal'"],
    [/'\.\.\/logger'/g, "'../internal'"],
    [/"\.\.\/proxy-http"/g, "'../internal'"],
    [/'\.\.\/proxy-http'/g, "'../internal'"],
  ];
  
  replacements.forEach(([pattern, replacement]) => {
    content = content.replace(pattern, replacement);
  });
  
  // 合并重复的 import 语句（简化处理）
  // 注意：这是一个简化的方案，实际可能需要更复杂的解析
  
  // 写入目标文件
  fs.writeFileSync(targetFile, content, 'utf-8');
  
  const lineCount = content.split('\n').length;
  console.log(`✅ ${providerName}/adapter.ts (${lineCount} 行)`);
  
  return true;
}

function main() {
  console.log('🚀 开始快速迁移 DNS 提供商...\n');
  
  let successCount = 0;
  
  providers.forEach(provider => {
    try {
      if (migrateProvider(provider)) {
        successCount++;
      }
    } catch (error) {
      console.error(`❌ ${provider} 失败:`, error.message);
    }
  });
  
  console.log(`\n✨ 完成! 成功迁移 ${successCount}/${providers.length} 个提供商`);
  console.log('\n⚠️  下一步:');
  console.log('   1. 运行 npm run build 检查编译');
  console.log('   2. 修复可能的导入问题');
  console.log('   3. 删除旧的 .ts 文件');
}

main();
