/**
 * MCP Schema 验证脚本
 * 用于验证 MCP 相关表是否正确定义在 complete-schema.ts 中
 */

import { COMPLETE_SCHEMA } from '../src/db/dsm/schemas/complete-schema';

const mcpTables = [
  'mcp_global_config',
  'mcp_user_api_keys',
  'mcp_oauth_clients',
  'mcp_oauth_access_tokens',
  'mcp_audit_logs'
];

console.log('🔍 验证 MCP Schema 定义...\n');

let allFound = true;

for (const tableName of mcpTables) {
  const table = COMPLETE_SCHEMA.tables.find((t: any) => t.name === tableName);
  
  if (table) {
    console.log(`✅ ${tableName}`);
    console.log(`   - 列数: ${table.columns.length}`);
    console.log(`   - 索引数: ${table.indexes?.length || 0}`);
    console.log(`   - 外键数: ${table.foreignKeys?.length || 0}`);
    
    // 显示主要列
    const keyColumns = table.columns.filter((c: any) => 
      c.primaryKey || c.unique || c.name.includes('user_id') || c.name.includes('api_key')
    );
    if (keyColumns.length > 0) {
      console.log(`   - 关键字段: ${keyColumns.map((c: any) => c.name).join(', ')}`);
    }
  } else {
    console.log(`❌ ${tableName} - 未找到!`);
    allFound = false;
  }
  console.log();
}

if (allFound) {
  console.log('✅ 所有 MCP 表定义验证通过！');
  console.log(`\n📊 统计信息:`);
  console.log(`   - 总表数: ${COMPLETE_SCHEMA.tables.length}`);
  console.log(`   - MCP 表数: ${mcpTables.length}`);
  process.exit(0);
} else {
  console.log('❌ 部分 MCP 表定义缺失，请检查 complete-schema.ts');
  process.exit(1);
}
