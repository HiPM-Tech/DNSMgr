# DNSMgr 项目理念

## 核心理念：详细的日志是调试和监控的基础

### 为什么日志如此重要？

在 DNSMgr 项目中，我们相信**详细的日志记录**是构建可靠、可维护系统的基石。日志不仅仅是调试工具，更是系统运行的"黑匣子"，记录着每一个关键决策和操作。

### 日志原则

#### 1. 全面性
- **请求日志**：记录所有外部 API 请求（DNS 提供商、数据库、HTTP 服务）
- **响应日志**：记录所有响应状态、错误信息和关键数据
- **业务日志**：记录业务操作的完整生命周期
- **错误日志**：详细记录错误堆栈和上下文信息

#### 2. 结构化
```
[时间戳] [级别] [模块] 消息 [数据]
```

示例：
```
2024-01-15T10:30:00.000Z INFO  [DNS:Cloudflare] Request: GET https://api.cloudflare.com/client/v4/zones
2024-01-15T10:30:00.500Z INFO  [DNS:Cloudflare] Response: status=200, success=true {"resultCount": 5}
2024-01-15T10:30:00.501Z INFO  [Cloudflare] getDomainList success: total=5, returned=5
```

#### 3. 分级记录
- **DEBUG**：详细的调试信息（SQL 查询、请求参数）
- **INFO**：正常业务流程（请求/响应、操作完成）
- **WARN**：警告信息（降级处理、非致命错误）
- **ERROR**：错误信息（API 失败、异常抛出）

#### 4. 上下文丰富
每条日志都应包含足够的上下文信息：
- 操作类型和参数
- 执行结果和状态
- 耗时信息
- 错误详情和堆栈

### 日志使用规范

#### DNS 提供商
```typescript
// 请求前
log.providerRequest('Cloudflare', 'GET', url, params);

// 响应后
log.providerResponse('Cloudflare', status, success, { resultCount });

// 错误时
log.providerError('Cloudflare', error);
```

#### 数据库操作
```typescript
// 查询前
log.dbQuery('SELECT', sql, params);

// 错误时
log.dbError('SELECT', error);
```

#### HTTP 请求
```typescript
// 请求前
log.httpRequest(method, path, body);

// 响应后
log.httpResponse(method, path, status, duration);
```

#### 业务操作
```typescript
// 操作开始
log.business('DomainSync', 'Starting sync for account', { accountId });

// 操作完成
log.business('DomainSync', 'Sync completed', { totalDomains });

// 操作失败
log.businessError('DomainSync', error);
```

### 日志带来的价值

1. **快速定位问题**：当用户报告"同步不到域名"时，日志能立即告诉我们：
   - 请求是否发送成功？
   - API 返回了什么？
   - 哪个环节出现了错误？

2. **性能监控**：通过日志中的耗时信息，可以识别性能瓶颈

3. **审计追踪**：完整的操作日志支持安全审计和合规要求

4. **调试友好**：开发阶段可以快速理解系统行为

5. **运维支持**：生产环境问题排查的第一手资料

### 实现方式

项目使用统一的日志模块 `src/lib/logger.ts`：

```typescript
import { log } from './lib/logger';

// 使用便捷的日志方法
log.info('ModuleName', 'Operation completed', { detail: 'value' });
log.error('ModuleName', 'Operation failed', error);

// 或使用专用方法
log.providerRequest('Cloudflare', 'GET', url);
log.dbQuery('SELECT', sql, params);
```

### 最佳实践

1. **不要吝啬日志**：关键路径上的每个步骤都值得记录
2. **避免敏感信息**：不要在日志中记录密码、Token 等敏感数据
3. **保持格式一致**：使用统一的日志格式便于解析和搜索
4. **及时记录**：在操作发生时就记录，不要延迟或批量记录
5. **包含上下文**：日志消息应该能独立理解，不需要查看代码

### 总结

> "没有日志的系统就像没有仪表盘的飞机——你只能在坠毁后才知道出了问题。"

在 DNSMgr 中，详细的日志不是可选项，而是**必需项**。它是我们对代码质量的承诺，也是对用户负责的表现。
