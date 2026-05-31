# 问题修复说明

## 修复的问题

### 1. NS监测查询失败 - 数据库字段缺失

**问题描述：**
```
Error: Unknown column 'encrypted_ns' in 'field list'
```

MySQL数据库中`ns_monitor_domains`表缺少`encrypted_ns`、`plain_ns`和`is_poisoned`字段。

**原因：**
- MySQL不支持`ALTER TABLE ADD COLUMN IF NOT EXISTS`语法
- 迁移脚本中使用了该语法，导致字段添加失败

**修复方案：**

1. **自动修复（推荐）**：重启服务器后，新的迁移逻辑会自动检测并添加缺失字段
   
2. **手动修复**：如果自动修复失败，运行以下命令：
   ```bash
   cd server
   pnpm db:migrate:ns-monitor
   ```

**修改的文件：**
- `server/src/db/schema.ts` - 添加了`addNsMonitorColumns()`函数来正确处理MySQL字段迁移
- `server/src/db/schemas/mysql.ts` - 从alterTables中移除IF NOT EXISTS语法的SQL语句
- `server/scripts/migrate-ns-monitor-fields.js` - 新增手动迁移脚本
- `server/package.json` - 添加了`db:migrate:ns-monitor`脚本

---

### 2. 同一提供商账号第51个域名开始无法获取解析记录

**问题描述：**
从第51个域名开始，无法正确获取域名下的DNS解析记录数量。

**原因：**
- 在`domains.ts`中，使用`getDomainRecords(1, 1)`来获取记录总数
- 某些DNS提供商对`pageSize`有最小限制（通常最小为10或20）
- 当`pageSize=1`时，API可能返回不准确的`total`值

**修复方案：**
将`pageSize`从1改为10，确保所有DNS提供商都能返回准确的记录总数。

**修改的文件：**
- `server/src/routes/domains.ts` (第221行)
  ```typescript
  // 修改前
  const result = await dnsAdapter.getDomainRecords(1, 1);
  
  // 修改后
  const result = await dnsAdapter.getDomainRecords(1, 10);
  ```

---

### 3. 首页域名展示数量获取错误

**问题描述：**
Dashboard页面显示的"总域名数"不正确，显示的是当前页的域名数量而不是总数。

**原因：**
- Dashboard调用`domainsApi.list()`时没有指定pageSize，默认返回20条
- 前端使用`domains?.length`作为总数，这只计算了当前页的数量
- 应该使用API返回的`total`字段

**修复方案：**
1. 调用API时使用`pageSize: 1`以减少数据传输量
2. 使用返回的`total`字段作为总域名数

**修改的文件：**
- `client/src/pages/Dashboard.tsx`
  ```typescript
  // 修改前
  queryFn: () => domainsApi.list().then(...)
  value={domains?.length ?? 0}
  
  // 修改后
  queryFn: () => domainsApi.list({ pageSize: 1 }).then(...)
  const totalDomainsCount = domainsData?.total ?? 0;
  value={totalDomainsCount}
  ```

---

## 部署步骤

### 后端更新

1. 重新编译TypeScript代码：
   ```bash
   cd server
   pnpm build
   ```

2. 如果使用MySQL数据库，运行迁移脚本（可选，重启服务也会自动迁移）：
   ```bash
   pnpm db:migrate:ns-monitor
   ```

3. 重启服务器：
   ```bash
   pnpm start
   # 或
   node dist/app.js
   ```

### 前端更新

1. 重新构建前端：
   ```bash
   cd client
   pnpm build
   ```

2. 如果是Docker部署，重新构建镜像：
   ```bash
   docker build -t dnsmgr .
   docker-compose up -d
   ```

---

## 验证修复

### 1. 验证NS监测功能

1. 访问NS监测页面
2. 手动触发一次检查
3. 检查日志，确认不再出现`Unknown column 'encrypted_ns'`错误

### 2. 验证域名记录获取

1. 访问包含超过50个域名的DNS账号
2. 同步域名
3. 检查所有域名的记录数量是否正确显示

### 3. 验证Dashboard域名数量

1. 访问首页Dashboard
2. 检查"总域名数"是否与实际域名总数一致
3. 如果有多个分页，确认显示的是总数而非当前页数量

---

## 技术细节

### MySQL迁移逻辑

新的迁移函数`addNsMonitorColumns()`会：
1. 检查每个字段是否存在于`INFORMATION_SCHEMA.COLUMNS`中
2. 如果不存在，执行`ALTER TABLE ADD COLUMN`
3. 捕获重复字段错误并记录日志
4. 支持异步和同步两种数据库连接方式

### DNS记录总数获取

使用`pageSize=10`的原因：
- 大多数DNS提供商的最小pageSize为10或20
- 获取10条记录的开销很小
- 确保`total`字段的准确性
- 避免API返回错误或截断的结果

### Dashboard优化

使用`pageSize: 1`的优势：
- 减少网络传输量
- 加快页面加载速度
- API仍然返回准确的`total`值
- 只需要统计信息，不需要完整的域名列表
