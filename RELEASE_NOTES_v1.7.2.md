# HiDNS v1.7.2 发布说明

**发布日期**：2026-05-31  
**版本类型**：功能增强 + Bug 修复

---

## 🎯 版本亮点

### 1. **域名置顶排序全面优化** ⭐⭐⭐⭐⭐

#### 数据库级排序
在数据库层面实现置顶域名排序，确保跨页正确显示：
- **MySQL**：使用 `FIELD()` 函数，性能最优
- **PostgreSQL/SQLite**：使用 `CASE WHEN` 表达式
- **效果**：置顶域名始终排在结果集最前面，不受分页影响

**示例**：
```
总共 50 个域名，21 个置顶，每页 20 条：
- 第 1 页：20 个置顶域名
- 第 2 页：1 个置顶 + 19 个普通
- 第 3 页：20 个普通
```

#### 前端加载顺序修复
修复首次加载时置顶排序不正确的问题：
- ✅ 等待置顶列表加载完成后再查询域名列表
- ✅ 将置顶列表加入 queryKey，确保自动刷新
- ✅ 置顶状态变更后立即刷新域名列表

#### 同名域名检查
防止用户在不同账号下置顶同名域名：
```typescript
// 保存前检查
if (duplicateNames.length > 0) {
  return {
    code: 400,
    msg: `Duplicate domain names found: ${duplicateNames.join(', ')}`
  };
}
```

#### WebSocket 实时通知
置顶状态变更后实时推送给前端：
- 新增 `sendToUser()` 方法
- 发送 `pinned_domains_updated` 事件
- 前端监听并自动刷新
- WebSocket 断开时自动降级为轮询（60秒）

---

### 2. **API 状态码全面统一** ⭐⭐⭐⭐⭐

#### 标准化错误响应
所有 API 使用标准 HTTP 状态码：

| HTTP 状态码 | 业务场景 | 示例 |
|------------|---------|------|
| 400 | 参数错误、验证失败 | 密码强度不足、重复域名 |
| 401 | 认证失败 | 密码错误、TOTP 错误 |
| 403 | 权限不足 | 账号禁用、无权限操作 |
| 404 | 资源不存在 | 用户不存在、凭证不存在 |
| 429 | 频率限制 | 登录失败次数过多、账号锁定 |

#### 业务代码映射
```typescript
// sendError 工具函数
export function sendError(res: Response, msg: string, statusCode = 200) {
  return res.status(statusCode).json({
    code: statusCode >= 400 ? statusCode : -1,  // 智能映射
    msg,
  });
}
```

#### 影响范围
- **auth.ts**：~15 处修复（登录、2FA、WebAuthn、密码修改）
- **webauthn.ts**：~8 处修复
- **settings.ts**：3 处修复

#### 兼容性保证
✅ DDNS Go 等外部适配器只检查 `code === 0`，完全不受影响

---

### 3. **RDAP 公开查询优化** ⭐⭐⭐

#### Punycode 标准化
RDAP 查询时使用 Punycode 格式的域名：
- ✅ 支持国际化域名（IDN）查询
- ✅ 自动将 Unicode 域名转换为 Punycode
- ✅ 符合 RFC 7483 标准

**示例**：
```
用户输入: 例子.com
→ normalizeDomain → xn--fsq.com
→ RDAP 查询: /domain/xn--fsq.com
```

#### 直接透传上游响应
上游返回 RDAP 格式时直接透传：
- ✅ 保持数据完整性
- ✅ 减少处理开销
- ✅ 解析失败时降级为内部转换

---

## 🐛 Bug 修复

### 1. 域名置顶排序延迟问题
**问题**：页面初始化时，置顶排序不正确，需要等待一段时间才生效  
**原因**：前端两个 useQuery hook 没有依赖关系，domains 查询在 pinnedDomains 加载完成前就执行了  
**解决**：
- 将 pinnedDomains 加入 queryKey
- 添加 enabled 条件，等待 pinnedDomains 加载完成

### 2. API 状态码不一致
**问题**：大量使用 `code: -1`，HTTP 状态码与业务代码不一致  
**解决**：统一使用 `sendError()` + 标准 HTTP 状态码

### 3. 批量操作功能禁用
**问题**：批量删除功能存在安全隐患  
**解决**：后端返回 403，前端注释相关代码

---

## 📊 技术细节

### 数据库层置顶排序实现

#### MySQL
```sql
SELECT * FROM domains 
ORDER BY FIELD(d.id, 44, 61, 65) DESC, d.id ASC 
LIMIT 10 OFFSET 0
```

#### PostgreSQL/SQLite
```sql
SELECT * FROM domains 
ORDER BY 
  (CASE d.id 
    WHEN 44 THEN 0 
    WHEN 61 THEN 1 
    WHEN 65 THEN 2 
    ELSE 3 
  END) ASC, 
  d.id ASC 
LIMIT 10 OFFSET 0
```

### WebSocket 通知机制

```typescript
// 后端发送
wsService.sendToUser(userId, {
  type: 'pinned_domains_updated',
  data: { domainIds },
  timestamp: new Date().toISOString()
});

// 前端监听
useRealtimeData({
  queryKey: ['domains'],
  websocketEventTypes: ['pinned_domains_updated'],
  pollingInterval: 60000,  // 降级轮询
});
```

---

## 🚀 升级指南

### 前端
```bash
cd client
npm install
npm run build
```

### 后端
```bash
cd server
npm install
npm run build
```

### Docker
```bash
docker pull hins/hidns:latest
docker-compose up -d
```

---

## 📝 完整变更列表

### 新增功能
- [x] 数据库级置顶排序（MySQL FIELD, PostgreSQL/SQLite CASE WHEN）
- [x] WebSocket 实时通知（sendToUser 方法）
- [x] 同名域名检查（防止重复置顶）
- [x] RDAP Punycode 标准化

### 改进优化
- [x] 前端加载顺序优化（enabled 条件）
- [x] API 状态码统一（~26 处修复）
- [x] 查询参数传递优化（queryKey 包含 pinnedDomains）

### Bug 修复
- [x] 域名置顶排序延迟问题
- [x] API 状态码不一致问题
- [x] 批量操作功能禁用

### 文档更新
- [x] CHANGELOG.md 更新
- [x] RELEASE_NOTES_v1.7.2.md 创建

---

## 🙏 致谢

感谢所有贡献者和用户的支持！

---

## 📄 许可证

MIT License

---

**完整提交历史**：https://github.com/HiPM-Tech/HiDNS/compare/v1.7.1...v1.7.2
