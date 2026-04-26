/**
 * 手动迁移脚本：为 ns_monitor_domains 表添加 encrypted_ns, plain_ns, is_poisoned 字段
 * 
 * 使用方法：
 * node scripts/migrate-ns-monitor-fields.js
 */

const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '../data/.env') });

async function migrate() {
  const dbType = process.env.DB_TYPE || 'sqlite';
  
  if (dbType !== 'mysql') {
    console.log(`当前数据库类型: ${dbType}`);
    console.log('此脚本仅适用于 MySQL 数据库');
    if (dbType === 'sqlite' || dbType === 'postgresql') {
      console.log(`${dbType} 数据库使用 IF NOT EXISTS 语法，应该已经自动迁移`);
    }
    return;
  }

  console.log('开始 MySQL 数据库迁移...');
  
  let connection;
  try {
    // 创建数据库连接
    connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'dnsmgr',
    });

    console.log('数据库连接成功');

    // 检查并添加 encrypted_ns 字段
    console.log('检查 encrypted_ns 字段...');
    const [columns] = await connection.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_NAME = ? AND COLUMN_NAME = ?`,
      ['ns_monitor_domains', 'encrypted_ns']
    );

    if (columns.length === 0) {
      console.log('添加 encrypted_ns 字段...');
      await connection.execute(
        'ALTER TABLE ns_monitor_domains ADD COLUMN encrypted_ns TEXT'
      );
      console.log('✓ encrypted_ns 字段添加成功');
    } else {
      console.log('✓ encrypted_ns 字段已存在');
    }

    // 检查并添加 plain_ns 字段
    console.log('检查 plain_ns 字段...');
    const [columns2] = await connection.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_NAME = ? AND COLUMN_NAME = ?`,
      ['ns_monitor_domains', 'plain_ns']
    );

    if (columns2.length === 0) {
      console.log('添加 plain_ns 字段...');
      await connection.execute(
        'ALTER TABLE ns_monitor_domains ADD COLUMN plain_ns TEXT'
      );
      console.log('✓ plain_ns 字段添加成功');
    } else {
      console.log('✓ plain_ns 字段已存在');
    }

    // 检查并添加 is_poisoned 字段
    console.log('检查 is_poisoned 字段...');
    const [columns3] = await connection.execute(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_NAME = ? AND COLUMN_NAME = ?`,
      ['ns_monitor_domains', 'is_poisoned']
    );

    if (columns3.length === 0) {
      console.log('添加 is_poisoned 字段...');
      await connection.execute(
        'ALTER TABLE ns_monitor_domains ADD COLUMN is_poisoned TINYINT NOT NULL DEFAULT 0'
      );
      console.log('✓ is_poisoned 字段添加成功');
    } else {
      console.log('✓ is_poisoned 字段已存在');
    }

    console.log('\n✅ 迁移完成！');
    
  } catch (error) {
    console.error('❌ 迁移失败:', error.message);
    if (error.code) {
      console.error('错误代码:', error.code);
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
      console.log('数据库连接已关闭');
    }
  }
}

migrate();
