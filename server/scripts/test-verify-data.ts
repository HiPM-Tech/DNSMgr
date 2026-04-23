/**
 * 验证测试数据是否存在
 * 用于测试数据持久化
 */

import { connect, getConnection, disconnect } from '../src/db/connection';
import { log } from '../src/lib/logger';

async function verifyTestData() {
  log.info('TestVerify', 'Verifying test data persistence');

  try {
    await connect();
    const conn = getConnection();

    // 获取测试数据ID
    const settingsResult = await conn.get(
      "SELECT value FROM settings WHERE key = 'test_data_ids'"
    );

    if (!settingsResult) {
      throw new Error('Test data IDs not found - data may not have been seeded');
    }

    const testIds = JSON.parse((settingsResult as Record<string, unknown>).value as string);
    const { userId, domainId } = testIds;

    log.info('TestVerify', `Looking for user ID: ${userId}, domain ID: ${domainId}`);

    // 验证用户存在
    const user = await conn.get(
      'SELECT id, username, email FROM users WHERE id = ?',
      [userId]
    );

    if (!user) {
      throw new Error(`Test user with ID ${userId} not found`);
    }
    log.info('TestVerify', `✓ User found: ${(user as any).username} (${(user as any).email})`);

    // 验证域名存在
    const domain = await conn.get(
      'SELECT id, domain FROM domains WHERE id = ?',
      [domainId]
    );

    if (!domain) {
      throw new Error(`Test domain with ID ${domainId} not found`);
    }
    log.info('TestVerify', `✓ Domain found: ${(domain as any).domain}`);

    // 验证记录存在
    const records = await conn.query(
      'SELECT COUNT(*) as count FROM records WHERE domain_id = ?',
      [domainId]
    );

    const recordCount = (records[0] as any).count;
    if (recordCount === 0) {
      throw new Error('No DNS records found for test domain');
    }
    log.info('TestVerify', `✓ Found ${recordCount} DNS records`);

    // 验证设置存在
    const testSetting = await conn.get(
      "SELECT value FROM settings WHERE key = 'test_setting'"
    );

    if (!testSetting) {
      throw new Error('Test setting not found');
    }

    const settingValue = JSON.parse((testSetting as any).value);
    if (!settingValue.test) {
      throw new Error('Test setting value is invalid');
    }
    log.info('TestVerify', '✓ Test setting verified');

    log.info('TestVerify', 'All test data verified successfully!');
    log.info('TestVerify', `Summary: 1 user, 1 domain, ${recordCount} records`);

    await disconnect();
    process.exit(0);
  } catch (error) {
    log.error('TestVerify', 'Data verification failed', error);
    await disconnect().catch(() => {});
    process.exit(1);
  }
}

verifyTestData();
