const mysql = require('mysql2/promise');

async function checkTableName() {
  console.log('=== 检查 dns_accounts 表的实际名称 ===\n');
  
  let connection;
  
  try {
    connection = await mysql.createConnection({
      host: '172.18.0.1',  // Docker 内部网络
      port: 3306,
      user: 'HiDNS-ci',
      password: 'HiDNS-ci',
      database: 'HiDNS-ci'
    });
    
    console.log('✅ 数据库连接成功\n');
    
    // 查询所有包含 "dns" 或 "account" 的表名
    console.log('1. 查询所有相关表名:');
    const [tables] = await connection.execute(
      `SELECT TABLE_NAME 
       FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND (TABLE_NAME LIKE '%dns%' OR TABLE_NAME LIKE '%account%')
       ORDER BY TABLE_NAME`
    );
    
    tables.forEach(table => {
      console.log(`   - ${table.TABLE_NAME}`);
    });
    
    // 检查 dns_accounts 表的详细信息
    console.log('\n2. 检查 dns_accounts 表的列:');
    const [columns] = await connection.execute(
      `SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, IS_NULLABLE
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'dns_accounts'
       ORDER BY ORDINAL_POSITION`
    );
    
    if (columns.length > 0) {
      columns.forEach(col => {
        const isKey = col.COLUMN_NAME === 'enabled' ? ' <-- 关键列' : '';
        console.log(`   - ${col.COLUMN_NAME.padEnd(20)} ${col.COLUMN_TYPE.padEnd(20)} ${isKey}`);
      });
    } else {
      console.log('   ❌ 未找到 dns_accounts 表');
    }
    
    // 测试 LOWER() 查询
    console.log('\n3. 测试 LOWER() 查询:');
    const [lowerResult] = await connection.execute(
      `SELECT COUNT(*) as cnt 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE LOWER(TABLE_NAME) = 'dns_accounts' 
       AND COLUMN_NAME = 'enabled'`
    );
    console.log(`   LOWER(TABLE_NAME) = 'dns_accounts': ${(lowerResult[0]).cnt} 个结果`);
    
    // 测试原始查询
    const [originalResult] = await connection.execute(
      `SELECT COUNT(*) as cnt 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_NAME = 'dns_accounts' 
       AND COLUMN_NAME = 'enabled'`
    );
    console.log(`   TABLE_NAME = 'dns_accounts': ${(originalResult[0]).cnt} 个结果`);
    
    // 获取实际的 TABLE_NAME
    const [actualName] = await connection.execute(
      `SELECT TABLE_NAME 
       FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE COLUMN_NAME = 'enabled' 
       AND TABLE_SCHEMA = DATABASE()
       LIMIT 1`
    );
    
    if (actualName.length > 0) {
      console.log(`\n4. enabled 列所在的实际表名: '${actualName[0].TABLE_NAME}'`);
      console.log(`   长度: ${actualName[0].TABLE_NAME.length}`);
      console.log(`   字符编码: ${Buffer.from(actualName[0].TABLE_NAME).toString('hex')}`);
    }
    
    console.log('\n=== 检查完成 ===');
    
  } catch (error) {
    console.error('❌ 错误:', error.message);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

checkTableName();
