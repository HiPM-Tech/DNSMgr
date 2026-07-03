/**
 * 诊断脚本：检查 SQLite 数据库的列是否存在
 */

const Database = require('better-sqlite3');
const path = require('path');

// 数据库路径（根据实际环境调整）
const dbPath = process.argv[2] || './data/hidns.db';
const absolutePath = path.resolve(dbPath);

console.log('🔍 诊断 SQLite 数据库结构\n');
console.log(`数据库路径: ${absolutePath}\n`);

try {
  const db = new Database(absolutePath, { readonly: true });
  
  // 1. 检查 dns_accounts 表
  console.log('=== 1. dns_accounts 表结构 ===');
  const accountsColumns = db.pragma('table_info(dns_accounts)');
  console.table(accountsColumns);
  
  const hasEnabledInAccounts = accountsColumns.some(col => col.name === 'enabled');
  console.log(`✅ dns_accounts.enabled 列: ${hasEnabledInAccounts ? '存在' : '❌ 不存在'}\n`);
  
  // 2. 检查 domains 表
  console.log('=== 2. domains 表结构 ===');
  const domainsColumns = db.pragma('table_info(domains)');
  console.table(domainsColumns);
  
  const hasEnabledInDomains = domainsColumns.some(col => col.name === 'enabled');
  console.log(`✅ domains.enabled 列: ${hasEnabledInDomains ? '存在' : '❌ 不存在'}\n`);
  
  // 3. 检查 schema_versions 表
  console.log('=== 3. schema_versions 表 ===');
  try {
    const versions = db.prepare('SELECT * FROM schema_versions ORDER BY applied_at DESC').all();
    if (versions.length > 0) {
      console.table(versions);
    } else {
      console.log('⚠️  schema_versions 表为空（迁移未记录）\n');
    }
  } catch (e) {
    console.log(`❌ schema_versions 表查询失败: ${e.message}\n`);
  }
  
  // 4. 测试查询
  console.log('=== 4. 测试域名查询 ===');
  try {
    const testQuery = db.prepare(`
      SELECT d.*, a.name as account_name, a.enabled as account_enabled
      FROM domains d 
      INNER JOIN dns_accounts a ON d.account_id = a.id 
      WHERE a.enabled = 1 
      LIMIT 1
    `).get();
    
    if (testQuery) {
      console.log('✅ 查询成功');
      console.log(`   域名: ${testQuery.name}`);
      console.log(`   账号: ${testQuery.account_name}`);
      console.log(`   账号启用: ${testQuery.account_enabled}\n`);
    } else {
      console.log('⚠️  没有启用的账号或域名\n');
    }
  } catch (e) {
    console.log(`❌ 查询失败: ${e.message}\n`);
  }
  
  // 5. 统计信息
  console.log('=== 5. 数据统计 ===');
  try {
    const domainCount = db.prepare('SELECT COUNT(*) as count FROM domains').get();
    const accountCount = db.prepare('SELECT COUNT(*) as count FROM dns_accounts').get();
    const enabledAccountCount = db.prepare('SELECT COUNT(*) as count FROM dns_accounts WHERE enabled = 1').get();
    
    console.log(`域名总数: ${domainCount.count}`);
    console.log(`账号总数: ${accountCount.count}`);
    console.log(`启用账号数: ${enabledAccountCount.count}\n`);
  } catch (e) {
    console.log(`❌ 统计查询失败: ${e.message}\n`);
  }
  
  db.close();
  
  // 6. 总结和建议
  console.log('=== 6. 诊断总结 ===');
  if (!hasEnabledInAccounts) {
    console.log('❌ 关键问题: dns_accounts 表缺少 enabled 列');
    console.log('\n修复方法:');
    console.log('  1. 重启 Docker 容器（推荐）');
    console.log('     docker restart DNSmgr');
    console.log('  2. 手动添加列（紧急）');
    console.log('     ALTER TABLE dns_accounts ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;');
  } else if (!hasEnabledInDomains) {
    console.log('❌ 关键问题: domains 表缺少 enabled 列');
    console.log('\n修复方法:');
    console.log('  ALTER TABLE domains ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;');
  } else {
    console.log('✅ 所有必需的列都存在');
    console.log('如果仍然报错，请检查:');
    console.log('  1. Docker 容器是否使用了正确的数据库文件');
    console.log('  2. 是否有多个数据库实例');
    console.log('  3. 容器日志中是否有迁移错误');
  }
  
} catch (error) {
  console.error('❌ 诊断失败:', error.message);
  console.error('\n可能的原因:');
  console.error('  1. 数据库文件不存在');
  console.error('  2. 数据库文件损坏');
  console.error('  3. 权限不足');
  process.exit(1);
}
