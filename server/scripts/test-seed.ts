/**
 * 测试数据种子
 * 创建测试数据用于验证数据持久化
 */

import { connect, getConnection, disconnect } from '../src/db/connection';
import { log } from '../src/lib/logger';
import bcrypt from 'bcryptjs';

async function seedTestData() {
  log.info('TestSeed', 'Starting to seed test data');

  try {
    await connect();
    const conn = getConnection();

    // 创建测试用户
    log.info('TestSeed', 'Creating test user');
    const hashedPassword = await bcrypt.hash('testpassword123', 10);
    const userId = await conn.insert(
      `INSERT INTO users (username, email, password_hash, role, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['testuser', 'test@example.com', hashedPassword, 'admin', 1, new Date().toISOString()]
    );
    log.info('TestSeed', `✓ Created test user with ID: ${userId}`);

    // 创建测试域名
    log.info('TestSeed', 'Creating test domain');
    const domainId = await conn.insert(
      `INSERT INTO domains (domain, user_id, status, created_at)
       VALUES (?, ?, ?, ?)`,
      ['test-example.com', userId, 1, new Date().toISOString()]
    );
    log.info('TestSeed', `✓ Created test domain with ID: ${domainId}`);

    // 创建测试记录
    log.info('TestSeed', 'Creating test DNS records');
    const records = [
      { name: '@', type: 'A', value: '192.168.1.1', ttl: 600 },
      { name: 'www', type: 'A', value: '192.168.1.2', ttl: 600 },
      { name: 'mail', type: 'MX', value: '10 mail.test-example.com', ttl: 3600 },
    ];

    for (const record of records) {
      await conn.run(
        `INSERT INTO records (domain_id, name, type, value, ttl, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [domainId, record.name, record.type, record.value, record.ttl, 1, new Date().toISOString()]
      );
    }
    log.info('TestSeed', `✓ Created ${records.length} test DNS records`);

    // 创建测试设置
    log.info('TestSeed', 'Creating test settings');
    await conn.run(
      `INSERT INTO settings (key, value, created_at)
       VALUES (?, ?, ?)`,
      ['test_setting', JSON.stringify({ test: true, timestamp: Date.now() }), new Date().toISOString()]
    );
    log.info('TestSeed', '✓ Created test setting');

    // 保存测试数据ID用于后续验证
    await conn.run(
      `INSERT INTO settings (key, value, created_at)
       VALUES (?, ?, ?)`,
      ['test_data_ids', JSON.stringify({ userId, domainId }), new Date().toISOString()]
    );

    log.info('TestSeed', 'All test data seeded successfully!');

    await disconnect();
    process.exit(0);
  } catch (error) {
    log.error('TestSeed', 'Failed to seed test data', error);
    await disconnect().catch(() => {});
    process.exit(1);
  }
}

seedTestData();
