-- 诊断 MySQL 表名大小写设置

-- 1. 检查 lower_case_table_names 设置
SHOW VARIABLES LIKE 'lower_case_table_names';

-- 2. 查看 dns_accounts 表的实际名称
SELECT TABLE_NAME 
FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA = 'HiDNS-ci' 
AND TABLE_NAME LIKE '%dns%account%' OR TABLE_NAME LIKE '%account%dns%';

-- 3. 检查 enabled 列是否存在于任何表中
SELECT TABLE_NAME, COLUMN_NAME 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'HiDNS-ci' 
AND COLUMN_NAME = 'enabled';

-- 4. 测试不同的查询方式
SELECT 'Test 1: Exact match' as test, COUNT(*) as result
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'HiDNS-ci' 
AND TABLE_NAME = 'dns_accounts' 
AND COLUMN_NAME = 'enabled'

UNION ALL

SELECT 'Test 2: LOWER()', COUNT(*)
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'HiDNS-ci' 
AND LOWER(TABLE_NAME) = 'dns_accounts' 
AND COLUMN_NAME = 'enabled'

UNION ALL

SELECT 'Test 3: LIKE', COUNT(*)
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_SCHEMA = 'HiDNS-ci' 
AND TABLE_NAME LIKE 'dns_accounts' 
AND COLUMN_NAME = 'enabled';
