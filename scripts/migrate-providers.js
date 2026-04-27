#!/usr/bin/env node

/**
 * 批量迁移 DNS 提供商到模块化结构
 * 
 * 用法: node scripts/migrate-providers.js [provider-name]
 * 如果不指定 provider，则迁移所有提供商
 */

const fs = require('fs');
const path = require('path');

const providersDir = path.join(__dirname, '../server/src/lib/dns/providers');

// 要迁移的提供商列表
const providersToMigrate = process.argv[2] ? [process.argv[2]] : [
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

// 已完成的提供商
const completedProviders = ['dnshe', 'cloudflare'];

function capitalizeFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function migrateProvider(providerName) {
  console.log(`\n🔄 开始迁移 ${providerName}...`);
  
  const sourceFile = path.join(providersDir, `${providerName}.ts`);
  const targetDir = path.join(providersDir, providerName);
  const targetFile = path.join(targetDir, 'adapter.ts');
  
  // 检查源文件是否存在
  if (!fs.existsSync(sourceFile)) {
    console.log(`⚠️  源文件不存在: ${sourceFile}`);
    return false;
  }
  
  // 检查是否已完成
  if (completedProviders.includes(providerName)) {
    console.log(`✅ ${providerName} 已完成迁移，跳过`);
    return true;
  }
  
  // 读取源文件
  let content = fs.readFileSync(sourceFile, 'utf-8');
  
  // 替换导入路径
  content = content.replace(
    /from\s+['"]\.\.\/DnsInterface['"]/g,
    "from '../internal'"
  );
  content = content.replace(
    /from\s+['"]\.\.\/logger['"]/g,
    "from '../internal'"
  );
  content = content.replace(
    /from\s+['"]\.\.\/proxy-http['"]/g,
    "from '../internal'"
  );
  content = content.replace(
    /from\s+['"]\.\/common['"]/g,
    "from '../internal'"
  );
  
  // 合并多个来自 '../internal' 的导入
  // 这是一个简化的处理，实际可能需要更复杂的解析
  
  // 写入目标文件
  fs.writeFileSync(targetFile, content, 'utf-8');
  
  console.log(`✅ ${providerName}/adapter.ts 已生成 (${content.split('\n').length} 行)`);
  
  // 可选：删除旧文件（先注释掉，确认无误后再启用）
  // fs.unlinkSync(sourceFile);
  // console.log(`🗑️  已删除旧文件: ${providerName}.ts`);
  
  return true;
}

function main() {
  console.log('🚀 开始批量迁移 DNS 提供商到模块化结构...\n');
  console.log(`📋 计划迁移 ${providersToMigrate.length} 个提供商\n`);
  
  let successCount = 0;
  let failCount = 0;
  
  providersToMigrate.forEach(provider => {
    try {
      const result = migrateProvider(provider);
      if (result) {
        successCount++;
      } else {
        failCount++;
      }
    } catch (error) {
      console.error(`❌ ${provider} 迁移失败:`, error.message);
      failCount++;
    }
  });
  
  console.log(`\n📊 迁移统计:`);
  console.log(`   - 成功: ${successCount}`);
  console.log(`   - 失败: ${failCount}`);
  console.log(`   - 总计: ${providersToMigrate.length}`);
  
  if (failCount === 0) {
    console.log(`\n✨ 所有提供商迁移完成！`);
    console.log(`\n⚠️  重要提示:`);
    console.log(`   1. 请运行 'npm run build' 检查编译错误`);
    console.log(`   2. 确认无误后，可以删除旧的 .ts 文件`);
    console.log(`   3. 更新 providers/index.ts 的导出路径`);
  } else {
    console.log(`\n⚠️  有 ${failCount} 个提供商迁移失败，请检查错误信息`);
  }
}

main();
