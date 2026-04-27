# 域名列表 API 返回格式说明

## 概述

为了兼容外部项目（如 ddns-go、certd）的适配器，`/api/domains` 路由支持两种返回格式。

## 返回格式

### 1. 分页对象格式（默认）

**适用场景**：前端页面展示

**请求示例**：
```bash
GET /api/domains?page=1&pageSize=20
Authorization: Bearer <JWT_TOKEN>
```

**响应格式**：
```json
{
  "code": 0,
  "data": {
    "list": [
      {
        "id": 1,
        "account_id": 1,
        "name": "example.com",
        "third_id": "...",
        "record_count": 12,
        ...
      }
    ],
    "total": 21,
    "page": 1,
    "pageSize": 20,
    "totalPages": 2
  },
  "msg": "success"
}
```

### 2. 直接数组格式

**适用场景**：外部适配器（ddns-go、certd 等）

**触发条件**（满足任一即可）：
- 查询参数 `format=array`
- 使用 API Token 认证（Bearer Token）

**请求示例 1 - 显式指定格式**：
```bash
GET /api/domains?format=array
Authorization: Bearer <JWT_TOKEN>
```

**请求示例 2 - 使用 API Token**：
```bash
GET /api/domains
X-API-Token: <API_TOKEN>
```

**响应格式**：
```json
{
  "code": 0,
  "data": [
    {
      "id": 1,
      "account_id": 1,
      "name": "example.com",
      "third_id": "...",
      "record_count": 12,
      ...
    }
  ],
  "msg": "success"
}
```

## 外部适配器适配指南

### ddns-go (Go)

```go
// getDomainID 获取域名ID
func (h *HiPMDnsMgr) getDomainID(baseURL, apiToken, domainName string) (int, error) {
    // DnsMgr API returns array directly in data when using API Token
    apiResp, err := h.request(baseURL, apiToken, "GET", "/domains?page=1&pageSize=100", nil)
    if err != nil {
        return 0, err
    }
    
    if apiResp.Code != 0 {
        return 0, fmt.Errorf("API错误: %s", apiResp.Msg)
    }
    
    var domains []DnsMgrDomain
    if err := json.Unmarshal(apiResp.Data, &domains); err != nil {
        return 0, err
    }
    
    for _, d := range domains {
        if d.Name == domainName {
            return d.ID, nil
        }
    }
    
    return 0, fmt.Errorf("域名 %s 未找到", domainName)
}
```

### certd (TypeScript)

```typescript
async getDomainList(): Promise<any[]> {
  const response = await this.httpClient.get('/api/domains', {
    headers: {
      'X-API-Token': this.access.apiToken,
    },
  });
  
  // When using API Token, response.data is a direct array
  return response.data;
}
```

## 实现细节

### 后端路由逻辑

```typescript
// server/src/routes/domains.ts

router.get('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { format } = req.query;
  const tokenPayload = (req as any).tokenPayload;
  
  // ... 获取域名列表逻辑 ...
  
  // Return format based on query parameter or token usage
  if (format === 'array' || tokenPayload) {
    sendSuccess(res, paginatedDomains);  // 直接数组
  } else {
    sendSuccess(res, { 
      list: paginatedDomains, 
      total, 
      page: currentPage, 
      pageSize: size, 
      totalPages 
    });  // 分页对象
  }
}));
```

## 注意事项

1. **向后兼容**：默认仍返回分页对象格式，不影响现有前端代码
2. **API Token 自动切换**：使用 API Token 时自动返回数组格式，无需额外参数
3. **显式指定优先**：`format=array` 参数优先级高于 Token 检测
4. **分页仍然有效**：即使返回数组格式，`page` 和 `pageSize` 参数仍然生效

## 相关适配器

- ✅ **ddns-go**: `c:\Users\HINS\Documents\Trae\DNSMgr-1\server\src\lib\dns\providers\dnsmgr.ts`
- ✅ **certd**: HiPM DNSMgr Access & Provider
- ✅ **VPS8**: 已适配分页对象格式
