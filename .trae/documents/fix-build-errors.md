# 修复 Docker 构建错误

## 问题

Docker 构建报 3 个 TypeScript 错误：

1. **`Audit.tsx:38`** — `useQuery` 的 `queryFn` 返回两种不同结构（`{total,list}` vs `{total,page,pageSize,totalPages,logs}`），TypeScript 无法推断统一类型
2. **`Audit.tsx:60-61`** — 因为类型推断失败，`data` 被识别为 `{}`，`total`/`list`/`logs` 属性不存在
3. **`Security.tsx:2`** — 移除 MCP 开关后 `Switch` 导入未使用

## 修复方案

### 1. Audit.tsx — 标准化 `useQuery` 返回类型

**方法**: 在 `queryFn` 中将 MCP 审计 API 和系统审计 API 的返回统一为标准结构 `{ total: number; list: any[] }`

现有代码：
```typescript
const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, domain, action, startDate, endDate, source],
    queryFn: () => {
      if (source === 'mcp') {
        // 返回 { total, page, pageSize, totalPages, logs }
        return mcpApi.getAuditLogs(params).then(r => r.data.data);
      }
      // 返回 { total, list }
      return logsApi.list({...}).then((r) => r.data.data);
    },
  });

  const total = data?.total ?? 0;
  const logs = data?.list ?? data?.logs ?? [];
```

修改后：
```typescript
const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', page, domain, action, startDate, endDate, source],
    queryFn: async () => {
      if (source === 'mcp') {
        const params: any = { page, pageSize: PAGE_SIZE };
        if (mcpUserId) params.userId = parseInt(mcpUserId);
        if (mcpAction) params.action = mcpAction;
        if (startDate) params.startDate = startDate;
        if (endDate) params.endDate = endDate;
        const res = await mcpApi.getAuditLogs(params);
        return { total: res.data.data.total, list: res.data.data.logs };
      }
      const res = await logsApi.list({
        page,
        pageSize: PAGE_SIZE,
        domain: domain.trim() || undefined,
        action: action || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      return res.data.data;
    },
  });

  const total = data?.total ?? 0;
  const logs = data?.list ?? [];
```

这样两个分支都返回 `{ total, list }`，TypeScript 可以正确推断类型。

### 2. Security.tsx — 移除未使用的 `Switch` 导入

```typescript
// 修改前:
import { Alert, Button, Card, Empty, Form, Input, Space, Switch } from 'tdesign-react';

// 修改后:
import { Alert, Button, Card, Empty, Form, Input, Space } from 'tdesign-react';
```

## 涉及文件

- `client/src/pages/Audit.tsx` — 修改 `useQuery` 的 `queryFn`，统一返回结构
- `client/src/pages/Security.tsx` — 从 import 中移除 `Switch`

## 验证

- `pnpm --filter dnsmgr-client build` 应无 TS 错误通过