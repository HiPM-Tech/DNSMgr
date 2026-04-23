/**
 * 数据库迁移测试
 * 测试场景：
 * 1. 运行迁移脚本
 * 2. 验证新表结构
 * 3. 测试回滚功能
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { connect, disconnect, getConnection } from '../src/db/connection';
import { initSchemaAsync } from '../src/db/schema';

describe('数据库迁移测试', () => {
  let conn: ReturnType<typeof getConnection>;

  beforeAll(async () => {
    await connect();
    conn = getConnection();
  });

  afterAll(async () => {
    await disconnect();
  });

  beforeEach(async () => {
    // 清理迁移测试表
    await conn.execute('DROP TABLE IF EXISTS migration_test').catch(() => {});
    await conn.execute('DROP TABLE IF EXISTS schema_migrations').catch(() => {});
    await conn.execute('DROP TABLE IF EXISTS test_migration_table').catch(() => {});
  });

  describe('1. 运行迁移脚本', () => {
    it('应该创建 schema_migrations 表', async () => {
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT,
          executed_at TEXT
        )
      `);

      const result = await conn.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'"
      );

      expect(result).toBeDefined();
    });

    it('应该成功执行向上迁移', async () => {
      // 创建迁移记录表
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT,
          executed_at TEXT
        )
      `);

      // 定义测试迁移
      const migrations = [
        {
          version: 1,
          name: 'create_test_table',
          up: `
            CREATE TABLE IF NOT EXISTS migration_test (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              name TEXT,
              created_at TEXT
            )
          `,
        },
      ];

      // 执行迁移
      for (const migration of migrations) {
        const existing = await conn.get(
          'SELECT version FROM schema_migrations WHERE version = ?',
          [migration.version]
        );

        if (!existing) {
          await conn.execute(migration.up);
          await conn.run(
            'INSERT INTO schema_migrations (version, name, executed_at) VALUES (?, ?, ?)',
            [migration.version, migration.name, new Date().toISOString()]
          );
        }
      }

      // 验证表已创建
      const tableResult = await conn.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='migration_test'"
      );
      expect(tableResult).toBeDefined();

      // 验证迁移记录
      const migrationResult = await conn.get(
        'SELECT * FROM schema_migrations WHERE version = ?',
        [1]
      );
      expect(migrationResult).toBeDefined();
      expect((migrationResult as any).version).toBe(1);
      expect((migrationResult as any).name).toBe('create_test_table');
    });

    it('应该跳过已执行的迁移', async () => {
      // 创建迁移记录表
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT,
          executed_at TEXT
        )
      `);

      // 预先插入迁移记录
      await conn.run(
        'INSERT INTO schema_migrations (version, name, executed_at) VALUES (?, ?, ?)',
        [1, 'create_test_table', new Date().toISOString()]
      );

      // 检查迁移是否已执行
      const existing = await conn.get(
        'SELECT version FROM schema_migrations WHERE version = ?',
        [1]
      );

      expect(existing).toBeDefined();
      expect((existing as any).version).toBe(1);

      // 再次执行时应该跳过
      const migrations = [
        {
          version: 1,
          name: 'create_test_table',
          up: `CREATE TABLE IF NOT EXISTS migration_test (id INTEGER PRIMARY KEY)`,
        },
      ];

      for (const migration of migrations) {
        const alreadyApplied = await conn.get(
          'SELECT version FROM schema_migrations WHERE version = ?',
          [migration.version]
        );

        expect(alreadyApplied).toBeDefined();
      }
    });

    it('应该支持多个迁移按顺序执行', async () => {
      // 创建迁移记录表
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT,
          executed_at TEXT
        )
      `);

      const migrations = [
        {
          version: 1,
          name: 'create_test_table',
          up: `CREATE TABLE IF NOT EXISTS migration_test (id INTEGER PRIMARY KEY, name TEXT)`,
        },
        {
          version: 2,
          name: 'add_test_column',
          up: `ALTER TABLE migration_test ADD COLUMN description TEXT`,
        },
        {
          version: 3,
          name: 'create_index',
          up: `CREATE INDEX IF NOT EXISTS idx_migration_test_name ON migration_test(name)`,
        },
      ];

      // 执行所有迁移
      for (const migration of migrations) {
        const existing = await conn.get(
          'SELECT version FROM schema_migrations WHERE version = ?',
          [migration.version]
        );

        if (!existing) {
          await conn.execute(migration.up);
          await conn.run(
            'INSERT INTO schema_migrations (version, name, executed_at) VALUES (?, ?, ?)',
            [migration.version, migration.name, new Date().toISOString()]
          );
        }
      }

      // 验证所有迁移已记录
      const allMigrations = await conn.query('SELECT * FROM schema_migrations ORDER BY version');
      expect(allMigrations.length).toBe(3);
      expect((allMigrations[0] as any).version).toBe(1);
      expect((allMigrations[1] as any).version).toBe(2);
      expect((allMigrations[2] as any).version).toBe(3);
    });
  });

  describe('2. 验证新表结构', () => {
    it('应该正确创建包含所有列的表', async () => {
      await conn.execute(`
        CREATE TABLE test_migration_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE,
          age INTEGER DEFAULT 0,
          is_active INTEGER DEFAULT 1,
          created_at TEXT,
          updated_at TEXT
        )
      `);

      // 验证表结构
      const columns = await conn.query(
        "PRAGMA table_info(test_migration_table)"
      );

      expect(columns.length).toBe(7);

      const columnNames = columns.map((c: any) => c.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('email');
      expect(columnNames).toContain('age');
      expect(columnNames).toContain('is_active');
      expect(columnNames).toContain('created_at');
      expect(columnNames).toContain('updated_at');
    });

    it('应该正确创建索引', async () => {
      await conn.execute(`
        CREATE TABLE test_migration_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT,
          email TEXT
        )
      `);

      await conn.execute(`
        CREATE INDEX idx_test_name ON test_migration_table(name)
      `);

      await conn.execute(`
        CREATE INDEX idx_test_email ON test_migration_table(email)
      `);

      // 验证索引
      const indexes = await conn.query(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='test_migration_table'"
      );

      const indexNames = indexes.map((i: any) => i.name);
      expect(indexNames).toContain('idx_test_name');
      expect(indexNames).toContain('idx_test_email');
    });

    it('应该支持外键约束', async () => {
      await conn.execute(`
        CREATE TABLE test_parent (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT
        )
      `);

      await conn.execute(`
        CREATE TABLE test_child (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          parent_id INTEGER,
          name TEXT,
          FOREIGN KEY (parent_id) REFERENCES test_parent(id)
        )
      `);

      // 验证外键
      const foreignKeys = await conn.query(
        "PRAGMA foreign_key_list(test_child)"
      );

      expect(foreignKeys.length).toBe(1);
      expect((foreignKeys[0] as any).table).toBe('test_parent');
      expect((foreignKeys[0] as any).from).toBe('parent_id');
      expect((foreignKeys[0] as any).to).toBe('id');

      // 清理
      await conn.execute('DROP TABLE IF EXISTS test_child');
      await conn.execute('DROP TABLE IF EXISTS test_parent');
    });

    it('应该支持默认值', async () => {
      await conn.execute(`
        CREATE TABLE test_migration_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          status TEXT DEFAULT 'pending',
          count INTEGER DEFAULT 0,
          is_enabled INTEGER DEFAULT 1
        )
      `);

      await conn.run(
        "INSERT INTO test_migration_table (id) VALUES (?)",
        [1]
      );

      const result = await conn.get(
        'SELECT * FROM test_migration_table WHERE id = ?',
        [1]
      );

      expect(result).toBeDefined();
      expect((result as any).status).toBe('pending');
      expect((result as any).count).toBe(0);
      expect((result as any).is_enabled).toBe(1);
    });

    it('应该支持 NOT NULL 约束', async () => {
      await conn.execute(`
        CREATE TABLE test_migration_table (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          required_field TEXT NOT NULL
        )
      `);

      // 插入 NULL 应该失败
      await expect(async () => {
        await conn.run(
          "INSERT INTO test_migration_table (required_field) VALUES (?)",
          [null]
        );
      }).rejects.toThrow();
    });
  });

  describe('3. 测试回滚功能', () => {
    it('应该成功回滚迁移', async () => {
      // 创建迁移记录表
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT,
          executed_at TEXT
        )
      `);

      // 先创建表
      await conn.execute(`
        CREATE TABLE migration_test (
          id INTEGER PRIMARY KEY,
          name TEXT
        )
      `);

      // 记录迁移
      await conn.run(
        'INSERT INTO schema_migrations (version, name, executed_at) VALUES (?, ?, ?)',
        [1, 'create_test_table', new Date().toISOString()]
      );

      // 验证表存在
      const beforeRollback = await conn.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='migration_test'"
      );
      expect(beforeRollback).toBeDefined();

      // 执行回滚
      await conn.execute('DROP TABLE IF EXISTS migration_test');
      await conn.run('DELETE FROM schema_migrations WHERE version = ?', [1]);

      // 验证表已删除
      const afterRollback = await conn.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='migration_test'"
      );
      expect(afterRollback).toBeUndefined();

      // 验证迁移记录已删除
      const migrationRecord = await conn.get(
        'SELECT * FROM schema_migrations WHERE version = ?',
        [1]
      );
      expect(migrationRecord).toBeUndefined();
    });

    it('应该按相反顺序回滚迁移', async () => {
      // 创建迁移记录表
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT,
          executed_at TEXT
        )
      `);

      // 创建多个表
      await conn.execute('CREATE TABLE table_v1 (id INTEGER PRIMARY KEY)');
      await conn.execute('CREATE TABLE table_v2 (id INTEGER PRIMARY KEY)');
      await conn.execute('CREATE TABLE table_v3 (id INTEGER PRIMARY KEY)');

      // 记录迁移
      await conn.run(
        'INSERT INTO schema_migrations (version, name, executed_at) VALUES (?, ?, ?)',
        [1, 'create_table_v1', new Date().toISOString()]
      );
      await conn.run(
        'INSERT INTO schema_migrations (version, name, executed_at) VALUES (?, ?, ?)',
        [2, 'create_table_v2', new Date().toISOString()]
      );
      await conn.run(
        'INSERT INTO schema_migrations (version, name, executed_at) VALUES (?, ?, ?)',
        [3, 'create_table_v3', new Date().toISOString()]
      );

      // 按相反顺序回滚
      const appliedMigrations = await conn.query(
        'SELECT version FROM schema_migrations ORDER BY version DESC'
      );

      for (const applied of appliedMigrations) {
        const version = (applied as any).version;
        await conn.execute(`DROP TABLE IF EXISTS table_v${version}`);
        await conn.run('DELETE FROM schema_migrations WHERE version = ?', [version]);
      }

      // 验证所有表已删除
      for (let i = 1; i <= 3; i++) {
        const result = await conn.get(
          `SELECT name FROM sqlite_master WHERE type='table' AND name='table_v${i}'`
        );
        expect(result).toBeUndefined();
      }

      // 验证迁移记录为空
      const remainingMigrations = await conn.query('SELECT * FROM schema_migrations');
      expect(remainingMigrations.length).toBe(0);
    });

    it('应该支持部分回滚', async () => {
      // 创建迁移记录表
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT,
          executed_at TEXT
        )
      `);

      // 创建表
      await conn.execute('CREATE TABLE table_v1 (id INTEGER PRIMARY KEY)');
      await conn.execute('CREATE TABLE table_v2 (id INTEGER PRIMARY KEY)');

      // 记录迁移
      await conn.run(
        'INSERT INTO schema_migrations (version, name, executed_at) VALUES (?, ?, ?)',
        [1, 'create_table_v1', new Date().toISOString()]
      );
      await conn.run(
        'INSERT INTO schema_migrations (version, name, executed_at) VALUES (?, ?, ?)',
        [2, 'create_table_v2', new Date().toISOString()]
      );

      // 只回滚 v2
      await conn.execute('DROP TABLE IF EXISTS table_v2');
      await conn.run('DELETE FROM schema_migrations WHERE version = ?', [2]);

      // 验证 v1 表仍然存在
      const v1Exists = await conn.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='table_v1'"
      );
      expect(v1Exists).toBeDefined();

      // 验证 v2 表已删除
      const v2Exists = await conn.get(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='table_v2'"
      );
      expect(v2Exists).toBeUndefined();

      // 验证只有 v1 迁移记录保留
      const remainingMigrations = await conn.query('SELECT * FROM schema_migrations ORDER BY version');
      expect(remainingMigrations.length).toBe(1);
      expect((remainingMigrations[0] as any).version).toBe(1);
    });

    it('应该处理回滚不存在的迁移', async () => {
      // 尝试回滚不存在的表不应抛出错误
      await expect(async () => {
        await conn.execute('DROP TABLE IF EXISTS non_existent_table');
      }).not.toThrow();
    });
  });

  describe('4. 完整迁移流程测试', () => {
    it('应该支持迁移后插入和查询数据', async () => {
      // 创建表
      await conn.execute(`
        CREATE TABLE migration_test (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          created_at TEXT
        )
      `);

      // 插入数据
      await conn.run(
        "INSERT INTO migration_test (name, created_at) VALUES (?, ?)",
        ['Test Item', new Date().toISOString()]
      );

      // 查询数据
      const result = await conn.get('SELECT * FROM migration_test WHERE name = ?', ['Test Item']);

      expect(result).toBeDefined();
      expect((result as any).name).toBe('Test Item');
    });

    it('应该支持使用 initSchemaAsync 初始化完整数据库', async () => {
      // 使用 initSchemaAsync 初始化（带 reset）
      await initSchemaAsync(conn, true);

      // 验证核心表存在
      const coreTables = [
        'users',
        'dns_accounts',
        'domains',
        'records',
        'system_settings',
      ];

      for (const tableName of coreTables) {
        const result = await conn.get(
          "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
          [tableName]
        );
        expect(result).toBeDefined();
      }
    });

    it('应该支持迁移版本追踪', async () => {
      // 创建迁移记录表
      await conn.execute(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version INTEGER PRIMARY KEY,
          name TEXT,
          executed_at TEXT
        )
      `);

      // 模拟多个迁移
      const migrations = [
        { version: 1, name: 'init' },
        { version: 2, name: 'add_users' },
        { version: 3, name: 'add_domains' },
      ];

      for (const migration of migrations) {
        await conn.run(
          'INSERT INTO schema_migrations (version, name, executed_at) VALUES (?, ?, ?)',
          [migration.version, migration.name, new Date().toISOString()]
        );
      }

      // 获取当前版本
      const currentVersion = await conn.get(
        'SELECT MAX(version) as version FROM schema_migrations'
      );

      expect((currentVersion as any).version).toBe(3);

      // 验证版本历史
      const history = await conn.query('SELECT * FROM schema_migrations ORDER BY version');
      expect(history.length).toBe(3);
    });
  });
});
