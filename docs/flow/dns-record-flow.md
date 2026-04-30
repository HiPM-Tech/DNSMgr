# DNS 记录管理流程

## Cloudflare 特殊处理流程

Cloudflare 提供商支持代理模式（Proxy）和 CNAME 拉平，需要特殊处理：

```mermaid
sequenceDiagram
    participant User as 用户
    participant Frontend as 前端
    participant Backend as 后端
    participant Adapter as 业务适配器
    participant DnsHelper as DNS助手
    Provider as Cloudflare适配器
    participant Cache as 本地缓存
    
    User->>Frontend: 编辑记录
    Frontend->>Backend: PUT /domains/:id/records/:rid
    Backend->>Adapter: 验证权限
    Adapter-->>Backend: 权限通过
    
    Backend->>DnsHelper: createAdapter('cloudflare')
    DnsHelper->>Provider: 实例化适配器
    
    alt 提供 cloudflare.proxied
        Provider->>Provider: 使用 proxied 字段
        Provider->>Provider: 忽略 line 字段
    else 未提供 proxied
        Provider->>Provider: 转换 line 字段
        Provider->>Provider: '1' = proxied, '0' = DNS only
    end
    
    Provider->>Provider: 调用 Cloudflare API
    Provider-->>Backend: 更新结果
    
    Backend->>Cache: 更新本地缓存
    Backend->>Adapter: 记录审计日志
    Backend-->>Frontend: 返回成功
    Frontend-->>User: 刷新列表
```

## 获取记录列表

```mermaid
sequenceDiagram
    participant User as 用户
    participant Frontend as 前端
    participant API as API 客户端
    participant AuthMW as 认证中间件
    participant Routes as API 路由
    participant Adapter as 业务适配器层
    participant DnsHelper as DNS 助手
    participant Provider as DNS 服务商
    participant DB as 数据库

    User->>Frontend: 1. 访问域名记录页面
    Frontend->>API: 2. 调用 recordsApi.list()
    API->>AuthMW: 3. GET /api/domains/:id/records

    AuthMW->>AuthMW: 验证 Token
    alt Token 无效
        AuthMW-->>API: 返回 401
        API-->>Frontend: 跳转到登录页
    else Token 有效
        AuthMW->>Routes: 进入记录路由
        Routes->>Adapter: get() 查询域名权限
        Adapter->>DB: SELECT * FROM domain_permissions
        DB-->>Adapter: 返回权限信息
        Adapter-->>Routes: 返回权限信息

        alt 无权限
            Routes-->>API: 返回 403
        else 有权限
            Routes->>Adapter: get() 查询域名信息
            Adapter->>DB: SELECT * FROM domains
            DB-->>Adapter: 返回域名数据
            Adapter-->>Routes: 返回域名数据
            
            Routes->>Adapter: get() 查询所属账号
            Adapter->>DB: SELECT * FROM dns_accounts
            DB-->>Adapter: 返回账号配置
            Adapter-->>Routes: 返回账号配置
            
            Routes->>DnsHelper: createAdapter()
            DnsHelper->>Provider: 实例化服务商适配器
            Routes->>Provider: getDomainRecords()
            Provider->>Provider: 调用服务商 API
            Provider-->>Routes: 返回记录列表
            Routes->>Routes: 数据格式化
            Routes-->>API: 返回 {total, list}
            API-->>Frontend: 返回记录数据
            Frontend-->>User: 渲染记录表格
        end
    end
```

## 更新记录

```mermaid
sequenceDiagram
    participant User as 用户
    participant Frontend as 前端
    participant API as API 客户端
    participant AuthMW as 认证中间件
    participant Routes as API 路由
    participant Adapter as 业务适配器层
    participant DnsHelper as DNS 助手
    participant Provider as DNS 服务商
    participant DB as 数据库
    participant Audit as 审计服务

    User->>Frontend: 1. 编辑记录并提交
    Frontend->>API: 2. 调用 recordsApi.update()
    API->>AuthMW: 3. PUT /api/domains/:id/records/:recordId
    AuthMW->>Routes: 进入更新路由
    Routes->>Adapter: get() 查询权限
    Adapter->>DB: 验证写权限
    DB-->>Adapter: 返回权限结果
    Adapter-->>Routes: 返回权限结果

    alt 无写权限
        Routes-->>API: 返回 403
        API-->>Frontend: 显示无权限
    else 有写权限
        Routes->>Adapter: get() 获取域名和账号
        Adapter->>DB: 查询配置
        DB-->>Adapter: 返回配置
        Adapter-->>Routes: 返回配置
        
        Routes->>DnsHelper: createAdapter()
        DnsHelper->>Provider: 实例化适配器
        Routes->>Provider: updateDomainRecord()
        Provider->>Provider: 调用服务商 API
        Provider-->>Routes: 返回更新结果

        alt 更新失败
            Routes-->>API: 返回 500
            API-->>Frontend: 显示错误
        else 更新成功
            Routes->>Adapter: execute() 更新本地缓存
            Adapter->>DB: UPDATE domain_records
            Routes->>Audit: logAuditOperation()
            Audit->>Adapter: execute() 记录操作日志
            Adapter->>DB: INSERT INTO operation_logs
            Routes-->>API: 返回成功
            API-->>Frontend: 刷新列表
            Frontend-->>User: 显示成功提示
        end
    end
```

## 关键代码路径

### 获取记录列表

**前端：**
```
Records.tsx
  → useQuery(['records', domainId], () => recordsApi.list(domainId))
  → recordsApi.list(domainId, params)
  → api.get(`/domains/${domainId}/records`)
```

**后端：**
```
GET /api/domains/:domainId/records (routes/records.ts)
  → authMiddleware (认证)
  → 检查域名权限
  → get() 查询域名信息 (通过业务适配器层)
  → get() 查询账号配置 (通过业务适配器层)
  → createAdapter() 创建 DNS 适配器
  → adapter.getDomainRecords() 调用服务商 API
  → 格式化返回数据
  → 返回 {total, list}
```

### 更新记录

**前端：**
```
RecordForm.tsx
  → recordsApi.update(domainId, recordId, data)
  → api.put(`/domains/${domainId}/records/${recordId}`)
```

**后端：**
```
PUT /api/domains/:domainId/records/:recordId (routes/records.ts)
  → authMiddleware (认证)
  → 检查写权限
  → get() 查询域名和账号 (通过业务适配器层)
  → createAdapter() 创建 DNS 适配器
  → adapter.updateDomainRecord() 调用服务商 API
  → execute() 更新本地数据库 (通过业务适配器层)
  → logAuditOperation() 记录审计
  → 返回成功
```

## 数据流

### DNS 记录创建

```
用户填写记录表单
  ↓
前端表单验证
  ↓
recordsApi.create(domainId, recordData)
  ↓
POST /api/domains/:domainId/records
  ↓
[后端] authMiddleware - JWT 验证
  ↓
[后端] 检查域名权限
  ↓
[后端] get() - 查询域名信息 (通过业务适配器层)
  ↓
[后端] get() - 查询账号配置 (通过业务适配器层)
  ↓
[后端] createAdapter() - 创建 DNS 适配器
  ↓
[后端] adapter.addDomainRecord() - 调用服务商 API
  ↓
[后端] insert() - 更新本地数据库 (通过业务适配器层)
  ↓
[后端] logAuditOperation() - 记录审计日志
  ↓
返回 {id}
  ↓
前端刷新记录列表
  ↓
显示成功提示
```
