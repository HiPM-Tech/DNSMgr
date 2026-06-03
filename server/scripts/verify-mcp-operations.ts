/**
 * MCP Operations 验证脚本
 */

import { McpOperations } from '../src/db/bal/business-adapter';

console.log('🔍 验证 MCP Operations 导出...\n');

const requiredMethods = [
  'getGlobalConfig',
  'updateGlobalConfig',
  'createApiKey',
  'validateApiKey',
  'updateApiKeyLastUsed',
  'getUserApiKeys',
  'revokeApiKey',
  'deleteApiKey',
  'createOAuthClient',
  'getOAuthClient',
  'getUserOAuthClients',
  'deleteOAuthClient',
  'createAccessToken',
  'validateAccessToken',
  'revokeAccessToken',
  'logAudit',
  'getAuditLogs',
];

let allFound = true;

for (const methodName of requiredMethods) {
  if (typeof (McpOperations as any)[methodName] === 'function') {
    console.log(`✅ ${methodName}`);
  } else {
    console.log(`❌ ${methodName} - 未找到!`);
    allFound = false;
  }
}

console.log();

if (allFound) {
  console.log('✅ 所有 MCP Operations 方法验证通过！');
  console.log(`\n📊 统计信息:`);
  console.log(`   - 总方法数: ${requiredMethods.length}`);
  process.exit(0);
} else {
  console.log('❌ 部分 MCP Operations 方法缺失');
  process.exit(1);
}
