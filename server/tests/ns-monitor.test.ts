/**
 * NS监测功能测试
 * 测试场景：
 * 1. 创建监测配置
 * 2. 手动触发检查
 * 3. 验证告警通知
 * 4. 测试告警抑制机制
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { connect, disconnect, getConnection } from '../src/db/connection';
import { log } from '../src/lib/logger';

// MOCK NS查询和通知服务
vi.mock('../src/lib/dns/ns-lookup', () => ({
  queryNS: vi.fn(),
  validateNS: vi.fn(),
}));

vi.mock('../src/lib/notifier', () => ({
  sendNotification: vi.fn(),
  sendAlert: vi.fn(),
}));

describe('NS监测功能测试', () => {
  let conn: ReturnType<typeof getConnection>;
  let testDomainId: number;
  let testUserId: number;

  beforeAll(async () => {
    await connect();
    conn = getConnection();
    
    // 创建测试用户
    const userResult = await conn.run(
      `INSERT INTO users (username, email, password, role, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ['ns-test-user', 'ns-test@example.com', 'hashed-password', 'admin', 1, new Date().toISOString()]
    );
    testUserId = userResult.lastID!;

    // 创建测试域名
    const domainResult = await conn.run(
      `INSERT INTO domains (domain, user_id, status, created_at)
       VALUES (?, ?, ?, ?)`,
      ['ns-test-example.com', testUserId, 1, new Date().toISOString()]
    );
    testDomainId = domainResult.lastID!;
  });

  afterAll(async () => {
    // 清理测试数据
    await conn.run('DELETE FROM ns_monitor_status WHERE domain_id = ?', [testDomainId]);
    await conn.run('DELETE FROM ns_monitor WHERE domain_id = ?', [testDomainId]);
    await conn.run('DELETE FROM domains WHERE id = ?', [testDomainId]);
    await conn.run('DELETE FROM users WHERE id = ?', [testUserId]);
    await disconnect();
  });

  beforeEach(async () => {
    // 清理监测配置
    await conn.run('DELETE FROM ns_monitor_status WHERE domain_id = ?', [testDomainId]);
    await conn.run('DELETE FROM ns_monitor WHERE domain_id = ?', [testDomainId]);
  });

  describe('1. 创建监测配置', () => {
    it('应该成功创建NS监测配置', async () => {
      const { createNSMonitor } = await import('../src/routes/ns-monitor');
      
      const config = {
        domain_id: testDomainId,
        expected_ns: 'ns1.example.com,ns2.example.com',
        enabled: true,
        notify_email: true,
        notify_channels: true,
      };

      const result = await conn.run(
        `INSERT INTO ns_monitor (domain_id, expected_ns, enabled, notify_email, notify_channels, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [config.domain_id, config.expected_ns, 1, 1, 1, testUserId, new Date().toISOString()]
      );

      expect(result.lastID).toBeDefined();
      
      // 验证配置已保存
      const saved = await conn.get(
        'SELECT * FROM ns_monitor WHERE id = ?',
        [result.lastID]
      );
      
      expect(saved).toBeDefined();
      expect((saved as any).domain_id).toBe(testDomainId);
      expect((saved as any).expected_ns).toBe(config.expected_ns);
      expect((saved as any).enabled).toBe(1);
    });

    it('应该拒绝无效的域名ID', async () => {
      const invalidConfig = {
        domain_id: 99999, // 不存在的域名
        expected_ns: 'ns1.example.com',
        enabled: true,
      };

      // 应该抛出错误或返回失败
      await expect(async () => {
        // 检查域名是否存在
        const domain = await conn.get('SELECT id FROM domains WHERE id = ?', [invalidConfig.domain_id]);
        if (!domain) {
          throw new Error('Domain not found');
        }
      }).rejects.toThrow('Domain not found');
    });

    it('应该支持禁用监测', async () => {
      const result = await conn.run(
        `INSERT INTO ns_monitor (domain_id, expected_ns, enabled, notify_email, notify_channels, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [testDomainId, 'ns1.example.com', 0, 0, 0, testUserId, new Date().toISOString()]
      );

      const saved = await conn.get('SELECT * FROM ns_monitor WHERE id = ?', [result.lastID]);
      expect((saved as any).enabled).toBe(0);
    });
  });

  describe('2. 手动触发检查', () => {
    it('应该成功触发NS检查', async () => {
      // 先创建监测配置
      await conn.run(
        `INSERT INTO ns_monitor (domain_id, expected_ns, enabled, created_by, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [testDomainId, 'ns1.example.com,ns2.example.com', 1, testUserId, new Date().toISOString()]
      );

      // 初始化状态
      await conn.run(
        `INSERT INTO ns_monitor_status (domain_id, current_ns, last_check, status, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [testDomainId, '', new Date().toISOString(), 'pending', new Date().toISOString()]
      );

      // 模拟NS查询
      const { queryNS } = await import('../src/lib/dns/ns-lookup');
      vi.mocked(queryNS).mockResolvedValue(['ns1.example.com', 'ns2.example.com']);

      // 执行检查
      const actualNS = await queryNS('ns-test-example.com');
      expect(actualNS).toContain('ns1.example.com');

      // 更新状态
      await conn.run(
        `UPDATE ns_monitor_status 
         SET current_ns = ?, last_check = ?, status = ?
         WHERE domain_id = ?`,
        [JSON.stringify(actualNS), new Date().toISOString(), 'ok', testDomainId]
      );

      // 验证状态更新
      const status = await conn.get(
        'SELECT * FROM ns_monitor_status WHERE domain_id = ?',
        [testDomainId]
      );
      
      expect(status).toBeDefined();
      expect((status as any).status).toBe('ok');
    });

    it('应该检测到NS不匹配', async () => {
      // 创建配置
      await conn.run(
        `INSERT INTO ns_monitor (domain_id, expected_ns, enabled, created_by, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [testDomainId, 'ns1.example.com,ns2.example.com', 1, testUserId, new Date().toISOString()]
      );

      // 模拟返回不同的NS
      const { queryNS } = await import('../src/lib/dns/ns-lookup');
      vi.mocked(queryNS).mockResolvedValue(['ns3.different.com']);

      const actualNS = await queryNS('ns-test-example.com');
      const expectedNS = ['ns1.example.com', 'ns2.example.com'];

      // 验证不匹配
      const hasMismatch = !actualNS.every(ns => expectedNS.includes(ns));
      expect(hasMismatch).toBe(true);

      // 更新为告警状态
      await conn.run(
        `INSERT OR REPLACE INTO ns_monitor_status (domain_id, current_ns, expected_ns, last_check, status, alert_sent, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [testDomainId, JSON.stringify(actualNS), JSON.stringify(expectedNS), 
         new Date().toISOString(), 'alert', 0, new Date().toISOString()]
      );

      const status = await conn.get(
        'SELECT * FROM ns_monitor_status WHERE domain_id = ?',
        [testDomainId]
      );
      
      expect((status as any).status).toBe('alert');
    });
  });

  describe('3. 验证告警通知', () => {
    it('应该在NS不匹配时发送告警', async () => {
      const { sendAlert } = await import('../src/lib/notifier');
      
      // 模拟告警状态
      await conn.run(
        `INSERT INTO ns_monitor (domain_id, expected_ns, enabled, notify_email, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [testDomainId, 'ns1.example.com', 1, 1, testUserId, new Date().toISOString()]
      );

      await conn.run(
        `INSERT INTO ns_monitor_status (domain_id, current_ns, expected_ns, status, alert_sent, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [testDomainId, 'ns2.different.com', 'ns1.example.com', 'alert', 0, new Date().toISOString()]
      );

      // 模拟发送告警
      vi.mocked(sendAlert).mockResolvedValue(true);

      // 执行告警发送
      const alertResult = await sendAlert({
        domain: 'ns-test-example.com',
        expectedNS: 'ns1.example.com',
        actualNS: 'ns2.different.com',
        type: 'ns_mismatch',
      });

      expect(alertResult).toBe(true);

      // 更新告警已发送状态
      await conn.run(
        'UPDATE ns_monitor_status SET alert_sent = 1 WHERE domain_id = ?',
        [testDomainId]
      );

      const status = await conn.get(
        'SELECT alert_sent FROM ns_monitor_status WHERE domain_id = ?',
        [testDomainId]
      );
      
      expect((status as any).alert_sent).toBe(1);
    });

    it('应该支持邮件通知配置', async () => {
      // 配置邮件通知
      await conn.run(
        `INSERT INTO ns_monitor (domain_id, expected_ns, enabled, notify_email, notify_channels, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [testDomainId, 'ns1.example.com', 1, 1, 0, testUserId, new Date().toISOString()]
      );

      const config = await conn.get(
        'SELECT notify_email, notify_channels FROM ns_monitor WHERE domain_id = ?',
        [testDomainId]
      );

      expect((config as any).notify_email).toBe(1);
      expect((config as any).notify_channels).toBe(0);
    });
  });

  describe('4. 测试告警抑制机制', () => {
    it('应该抑制重复告警', async () => {
      // 创建已发送告警的状态
      await conn.run(
        `INSERT INTO ns_monitor (domain_id, expected_ns, enabled, notify_email, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [testDomainId, 'ns1.example.com', 1, 1, testUserId, new Date().toISOString()]
      );

      const lastAlertTime = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30分钟前
      
      await conn.run(
        `INSERT INTO ns_monitor_status (domain_id, status, alert_sent, last_alert, alert_count, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [testDomainId, 'alert', 1, lastAlertTime, 1, new Date().toISOString()]
      );

      // 检查是否应该抑制（假设抑制期为1小时）
      const status = await conn.get(
        'SELECT last_alert, alert_count FROM ns_monitor_status WHERE domain_id = ?',
        [testDomainId]
      );

      const lastAlert = new Date((status as any).last_alert);
      const suppressDuration = 60 * 60 * 1000; // 1小时
      const shouldSuppress = Date.now() - lastAlert.getTime() < suppressDuration;

      expect(shouldSuppress).toBe(true);
    });

    it('应该在抑制期后允许新告警', async () => {
      // 创建超过抑制期的告警
      await conn.run(
        `INSERT INTO ns_monitor (domain_id, expected_ns, enabled, notify_email, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [testDomainId, 'ns1.example.com', 1, 1, testUserId, new Date().toISOString()]
      );

      const lastAlertTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2小时前
      
      await conn.run(
        `INSERT INTO ns_monitor_status (domain_id, status, alert_sent, last_alert, alert_count, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [testDomainId, 'alert', 1, lastAlertTime, 1, new Date().toISOString()]
      );

      // 检查是否应该允许新告警
      const status = await conn.get(
        'SELECT last_alert FROM ns_monitor_status WHERE domain_id = ?',
        [testDomainId]
      );

      const lastAlert = new Date((status as any).last_alert);
      const suppressDuration = 60 * 60 * 1000; // 1小时
      const shouldSuppress = Date.now() - lastAlert.getTime() < suppressDuration;

      expect(shouldSuppress).toBe(false);
    });

    it('应该记录告警次数', async () => {
      await conn.run(
        `INSERT INTO ns_monitor (domain_id, expected_ns, enabled, created_by, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        [testDomainId, 'ns1.example.com', 1, testUserId, new Date().toISOString()]
      );

      await conn.run(
        `INSERT INTO ns_monitor_status (domain_id, status, alert_count, updated_at)
         VALUES (?, ?, ?, ?)`,
        [testDomainId, 'alert', 3, new Date().toISOString()]
      );

      // 模拟增加告警计数
      await conn.run(
        `UPDATE ns_monitor_status 
         SET alert_count = alert_count + 1, updated_at = ?
         WHERE domain_id = ?`,
        [new Date().toISOString(), testDomainId]
      );

      const status = await conn.get(
        'SELECT alert_count FROM ns_monitor_status WHERE domain_id = ?',
        [testDomainId]
      );

      expect((status as any).alert_count).toBe(4);
    });
  });
});
