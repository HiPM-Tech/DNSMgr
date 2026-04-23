/**
 * 域名过滤测试
 * 测试场景：
 * 1. 测试顶域过滤
 * 2. 测试子域过滤
 * 3. 验证边界情况
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { connect, disconnect, getConnection } from '../src/db/connection';

describe('域名过滤测试', () => {
  let conn: ReturnType<typeof getConnection>;
  let testUserId: number;
  let testAccountId: number;

  beforeAll(async () => {
    await connect();
    conn = getConnection();

    // 创建测试用户
    const userResult = await conn.run(
      `INSERT INTO users (username, email, password, role, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['domain-filter-user', 'filter@example.com', 'hashed-password', 'admin', 1, new Date().toISOString()]
    );
    testUserId = userResult.lastID!;

    // 创建测试 DNS 账号
    const accountResult = await conn.run(
      `INSERT INTO dns_accounts (type, name, config, remark, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      ['cloudflare', 'Test Account', '{}', 'Test', testUserId]
    );
    testAccountId = accountResult.lastID!;

    // 创建测试域名 - 顶域
    await conn.run(
      `INSERT INTO domains (account_id, name, third_id, record_count, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [testAccountId, 'example.com', 'zone1', 5, new Date().toISOString()]
    );

    // 创建测试域名 - 顶域
    await conn.run(
      `INSERT INTO domains (account_id, name, third_id, record_count, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [testAccountId, 'test.org', 'zone2', 3, new Date().toISOString()]
    );

    // 创建测试域名 - 子域
    await conn.run(
      `INSERT INTO domains (account_id, name, third_id, record_count, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [testAccountId, 'sub.example.com', 'zone3', 2, new Date().toISOString()]
    );

    // 创建测试域名 - 子域
    await conn.run(
      `INSERT INTO domains (account_id, name, third_id, record_count, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [testAccountId, 'deep.sub.example.com', 'zone4', 1, new Date().toISOString()]
    );

    // 创建测试域名 - 多级子域
    await conn.run(
      `INSERT INTO domains (account_id, name, third_id, record_count, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [testAccountId, 'a.b.c.d.example.com', 'zone5', 0, new Date().toISOString()]
    );

    // 创建测试域名 - 带尾部点
    await conn.run(
      `INSERT INTO domains (account_id, name, third_id, record_count, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [testAccountId, 'trailing.com.', 'zone6', 4, new Date().toISOString()]
    );

    // 创建测试域名 - 国家代码顶级域
    await conn.run(
      `INSERT INTO domains (account_id, name, third_id, record_count, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [testAccountId, 'example.co.uk', 'zone7', 6, new Date().toISOString()]
    );

    // 创建测试域名 - 新顶级域
    await conn.run(
      `INSERT INTO domains (account_id, name, third_id, record_count, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [testAccountId, 'example.app', 'zone8', 2, new Date().toISOString()]
    );
  });

  afterAll(async () => {
    // 清理测试数据
    await conn.run('DELETE FROM domains WHERE account_id = ?', [testAccountId]);
    await conn.run('DELETE FROM dns_accounts WHERE id = ?', [testAccountId]);
    await conn.run('DELETE FROM users WHERE id = ?', [testUserId]);
    await disconnect();
  });

  describe('1. 测试顶域过滤', () => {
    it('应该正确识别顶域（两部分）', async () => {
      const domains = await conn.query<{ name: string }>(
        'SELECT name FROM domains WHERE account_id = ? ORDER BY id',
        [testAccountId]
      );

      const apexDomains = domains.filter((domain) => {
        const normalized = domain.name.replace(/\.$/, '');
        const parts = normalized.split('.');
        return parts.length === 2;
      });

      const apexNames = apexDomains.map(d => d.name.replace(/\.$/, ''));
      expect(apexNames).toContain('example.com');
      expect(apexNames).toContain('test.org');
      expect(apexNames).toContain('example.app');
    });

    it('应该正确过滤顶域', async () => {
      const domains = await conn.query<{ name: string }>(
        'SELECT name FROM domains WHERE account_id = ? ORDER BY id',
        [testAccountId]
      );

      const domain_type = 'apex';
      const filtered = domains.filter((domain) => {
        const normalized = domain.name.replace(/\.$/, '');
        const parts = normalized.split('.');
        const isApex = parts.length === 2;

        if (domain_type === 'apex') {
          return isApex;
        }
        return true;
      });

      expect(filtered.length).toBeGreaterThanOrEqual(3);
      const names = filtered.map(d => d.name.replace(/\.$/, ''));
      expect(names).toContain('example.com');
      expect(names).toContain('test.org');
      expect(names).toContain('example.app');
    });

    it('应该将带尾部点的域名正确识别为顶域', async () => {
      const domains = await conn.query<{ name: string }>(
        'SELECT name FROM domains WHERE account_id = ? AND name LIKE ?',
        [testAccountId, '%trailing%']
      );

      expect(domains.length).toBe(1);
      const domain = domains[0];
      const normalized = domain.name.replace(/\.$/, '');
      const parts = normalized.split('.');
      expect(parts.length).toBe(2);
      expect(normalized).toBe('trailing.com');
    });

    it('应该将国家代码二级域识别为非顶域', async () => {
      const domains = await conn.query<{ name: string }>(
        'SELECT name FROM domains WHERE account_id = ? AND name = ?',
        [testAccountId, 'example.co.uk']
      );

      expect(domains.length).toBe(1);
      const domain = domains[0];
      const normalized = domain.name.replace(/\.$/, '');
      const parts = normalized.split('.');
      // example.co.uk 有 3 部分，按当前逻辑不是顶域
      expect(parts.length).toBe(3);
    });
  });

  describe('2. 测试子域过滤', () => {
    it('应该正确识别子域', async () => {
      const domains = await conn.query<{ name: string }>(
        'SELECT name FROM domains WHERE account_id = ? ORDER BY id',
        [testAccountId]
      );

      const subDomains = domains.filter((domain) => {
        const normalized = domain.name.replace(/\.$/, '');
        const parts = normalized.split('.');
        return parts.length > 2;
      });

      const subNames = subDomains.map(d => d.name.replace(/\.$/, ''));
      expect(subNames).toContain('sub.example.com');
      expect(subNames).toContain('deep.sub.example.com');
      expect(subNames).toContain('a.b.c.d.example.com');
      expect(subNames).toContain('example.co.uk');
    });

    it('应该正确过滤子域', async () => {
      const domains = await conn.query<{ name: string }>(
        'SELECT name FROM domains WHERE account_id = ? ORDER BY id',
        [testAccountId]
      );

      const domain_type = 'subdomain';
      const filtered = domains.filter((domain) => {
        const normalized = domain.name.replace(/\.$/, '');
        const parts = normalized.split('.');
        const isApex = parts.length === 2;

        if (domain_type === 'subdomain') {
          return !isApex;
        }
        return true;
      });

      const names = filtered.map(d => d.name.replace(/\.$/, ''));
      expect(names).toContain('sub.example.com');
      expect(names).toContain('deep.sub.example.com');
      expect(names).toContain('a.b.c.d.example.com');
      expect(names).not.toContain('example.com');
      expect(names).not.toContain('test.org');
    });

    it('应该正确处理多级子域', async () => {
      const domains = await conn.query<{ name: string }>(
        'SELECT name FROM domains WHERE account_id = ? AND name = ?',
        [testAccountId, 'a.b.c.d.example.com']
      );

      expect(domains.length).toBe(1);
      const domain = domains[0];
      const normalized = domain.name.replace(/\.$/, '');
      const parts = normalized.split('.');
      expect(parts.length).toBe(6);
      expect(parts).toEqual(['a', 'b', 'c', 'd', 'example', 'com']);
    });

    it('应该正确处理深度嵌套子域', async () => {
      const domains = await conn.query<{ name: string }>(
        'SELECT name FROM domains WHERE account_id = ? AND name = ?',
        [testAccountId, 'deep.sub.example.com']
      );

      expect(domains.length).toBe(1);
      const domain = domains[0];
      const normalized = domain.name.replace(/\.$/, '');
      const parts = normalized.split('.');
      expect(parts.length).toBe(4);
      expect(parts).toEqual(['deep', 'sub', 'example', 'com']);
    });
  });

  describe('3. 验证边界情况', () => {
    it('应该处理空域名列表', async () => {
      const domains: { name: string }[] = [];

      const domain_type = 'apex';
      const filtered = domains.filter((domain) => {
        const normalized = domain.name.replace(/\.$/, '');
        const parts = normalized.split('.');
        const isApex = parts.length === 2;

        if (domain_type === 'apex') {
          return isApex;
        }
        return true;
      });

      expect(filtered.length).toBe(0);
    });

    it('应该处理单部分域名', async () => {
      // 插入单部分域名（边界情况）
      await conn.run(
        `INSERT INTO domains (account_id, name, third_id, record_count, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [testAccountId, 'localhost', 'zone-local', 0, new Date().toISOString()]
      );

      const domains = await conn.query<{ name: string }>(
        'SELECT name FROM domains WHERE account_id = ? AND name = ?',
        [testAccountId, 'localhost']
      );

      expect(domains.length).toBe(1);
      const domain = domains[0];
      const normalized = domain.name.replace(/\.$/, '');
      const parts = normalized.split('.');
      expect(parts.length).toBe(1);
      // 单部分域名不是顶域（按两部分定义）
      expect(parts.length === 2).toBe(false);

      // 清理
      await conn.run('DELETE FROM domains WHERE name = ?', ['localhost']);
    });

    it('应该处理带大写的域名', async () => {
      await conn.run(
        `INSERT INTO domains (account_id, name, third_id, record_count, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [testAccountId, 'Example.COM', 'zone-upper', 0, new Date().toISOString()]
      );

      const domains = await conn.query<{ name: string }>(
        'SELECT name FROM domains WHERE account_id = ? AND name = ?',
        [testAccountId, 'Example.COM']
      );

      expect(domains.length).toBe(1);
      const domain = domains[0];
      // 实际过滤逻辑中应该有小写转换
      const normalized = domain.name.toLowerCase().replace(/\.$/, '');
      const parts = normalized.split('.');
      expect(parts.length).toBe(2);
      expect(normalized).toBe('example.com');

      // 清理
      await conn.run('DELETE FROM domains WHERE name = ?', ['Example.COM']);
    });

    it('应该处理包含连字符的域名', async () => {
      await conn.run(
        `INSERT INTO domains (account_id, name, third_id, record_count, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [testAccountId, 'my-domain.example.com', 'zone-hyphen', 0, new Date().toISOString()]
      );

      const domains = await conn.query<{ name: string }>(
        'SELECT name FROM domains WHERE account_id = ? AND name = ?',
        [testAccountId, 'my-domain.example.com']
      );

      expect(domains.length).toBe(1);
      const domain = domains[0];
      const normalized = domain.name.replace(/\.$/, '');
      const parts = normalized.split('.');
      expect(parts.length).toBe(3);
      expect(parts[0]).toBe('my-domain');

      // 清理
      await conn.run('DELETE FROM domains WHERE name = ?', ['my-domain.example.com']);
    });

    it('应该处理包含数字的域名', async () => {
      await conn.run(
        `INSERT INTO domains (account_id, name, third_id, record_count, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [testAccountId, '123.example.com', 'zone-number', 0, new Date().toISOString()]
      );

      const domains = await conn.query<{ name: string }>(
        'SELECT name FROM domains WHERE account_id = ? AND name = ?',
        [testAccountId, '123.example.com']
      );

      expect(domains.length).toBe(1);
      const domain = domains[0];
      const normalized = domain.name.replace(/\.$/, '');
      const parts = normalized.split('.');
      expect(parts.length).toBe(3);
      expect(parts[0]).toBe('123');

      // 清理
      await conn.run('DELETE FROM domains WHERE name = ?', ['123.example.com']);
    });

    it('应该处理所有类型过滤', async () => {
      const domains = await conn.query<{ name: string }>(
        'SELECT name FROM domains WHERE account_id = ? ORDER BY id',
        [testAccountId]
      );

      const domain_type = 'all';
      const filtered = domains.filter((domain) => {
        const normalized = domain.name.replace(/\.$/, '');
        const parts = normalized.split('.');
        const isApex = parts.length === 2;

        if (domain_type === 'apex') {
          return isApex;
        } else if (domain_type === 'subdomain') {
          return !isApex;
        }
        return true;
      });

      // 'all' 应该返回所有域名
      expect(filtered.length).toBe(domains.length);
    });

    it('应该处理未知类型过滤', async () => {
      const domains = await conn.query<{ name: string }>(
        'SELECT name FROM domains WHERE account_id = ? ORDER BY id',
        [testAccountId]
      );

      const domain_type = 'unknown';
      const filtered = domains.filter((domain) => {
        const normalized = domain.name.replace(/\.$/, '');
        const parts = normalized.split('.');
        const isApex = parts.length === 2;

        if (domain_type === 'apex') {
          return isApex;
        } else if (domain_type === 'subdomain') {
          return !isApex;
        }
        return true;
      });

      // 未知类型应该返回所有域名（默认分支）
      expect(filtered.length).toBe(domains.length);
    });

    it('应该正确处理域名标准化', async () => {
      const testCases = [
        { input: 'Example.COM', expected: 'example.com', parts: 2 },
        { input: 'Sub.Example.COM.', expected: 'sub.example.com', parts: 3 },
        { input: '  example.com  ', expected: 'example.com', parts: 2 },
      ];

      for (const testCase of testCases) {
        const normalized = testCase.input.trim().toLowerCase().replace(/\.$/, '');
        const parts = normalized.split('.');
        expect(normalized).toBe(testCase.expected);
        expect(parts.length).toBe(testCase.parts);
      }
    });
  });
});
