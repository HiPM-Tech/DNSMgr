# 定时任务工作流程

## 任务管理器架构

DNSMgr 使用统一的任务管理器来调度和执行所有后台定时任务，确保并发控制和优先级管理。

## WHOIS 缓存刷新流程

```mermaid
graph TB
    A[任务管理器启动] --> B[注册 WHOIS 刷新任务]
    B --> C[定时触发 - 每小时]
    C --> D[查询 pinned_domains]
    D --> E{有置顶域名?}
    E -->|否| F[结束]
    E -->|是| G[遍历域名列表]
    G --> H[调用 WHOIS Service]
    H --> I[WHOIS Scheduler 调度]
    I --> J{查询策略}
    J -->|顶域优先| K[顶域 RDAP/WHOIS]
    J -->|子域优先| L[DNS 提供商 WHOIS]
    K --> M[第三方查询 fallback]
    L --> M
    M --> N[更新 whois_cache 表]
    N --> O{数据变更?}
    O -->|是| P[发送通知]
    O -->|否| Q[跳过]
    P --> R[记录审计日志]
    Q --> R
    R --> S[继续下一个域名]
    S --> G
```

### 关键代码路径

**后端:**
```
taskManager.ts (定时任务注册)
  → whoisJob.ts (WHOIS 刷新任务)
  → whoisService.ts (WHOIS 查询服务)
  → whoisScheduler.ts (调度器接口)
  → providers/dnshe/whoisScheduler.ts (具体实现)
  → Business Adapter (更新 whois_cache 表)
```

## 域名续期检查流程

```mermaid
graph TB
    A[任务管理器启动] --> B[注册域名续期任务]
    B --> C[定时触发 - 每天]
    C --> D[查询 renewable_domains 表]
    D --> E[过滤 enabled=1]
    E --> F[遍历可续期域名]
    F --> G[检查 expires_at]
    G --> H{即将过期?}
    H -->|否| I[跳过]
    H -->|是| J[调用续期调度器]
    J --> K[Renewal Scheduler 调度]
    K --> L[获取账号配置]
    L --> M[调用提供商 API]
    M --> N{续期成功?}
    N -->|是| O[更新 expires_at]
    N -->|否| P[记录错误]
    O --> Q[发送成功通知]
    P --> R[发送失败告警]
    Q --> S[记录续期日志]
    R --> S
    S --> T[继续下一个域名]
    T --> F
```

### 关键代码路径

**后端:**
```
taskManager.ts (定时任务注册)
  → domainRenewalJob.ts (续期检查任务)
  → renewalScheduler.ts (续期调度器接口)
  → providers/dnshe/scheduler.ts (具体实现)
  → Business Adapter (更新 renewable_domains 表)
  → notification.ts (发送通知)
```

## NS 监测流程

```mermaid
graph TB
    A[任务管理器启动] --> B[注册 NS 监测任务]
    B --> C[定时触发 - 每 5 分钟]
    C --> D[查询 ns_monitor_configs]
    D --> E[过滤 enabled=1]
    E --> F[并发控制 - 最多 10 个并行]
    F --> G[遍历监测配置]
    G --> H[查询当前 NS 记录]
    H --> I[对比预期 NS]
    I --> J{NS 变化?}
    J -->|否| K[记录正常状态]
    J -->|是| L[触发故障转移]
    L --> M[查询 failover_configs]
    M --> N[执行 DNS 记录切换]
    N --> O[更新本地缓存]
    O --> P[发送告警通知]
    K --> Q[记录审计日志]
    P --> Q
    Q --> R[继续下一个配置]
    R --> G
```

### 关键代码路径

**后端:**
```
taskManager.ts (定时任务注册)
  → nsMonitorJob.ts (NS 监测任务)
  → Business Adapter (查询 ns_monitor_configs)
  → DNS Helper (查询 NS 记录)
  → failover.ts (故障转移逻辑)
  → notification.ts (发送告警)
```

## 故障转移执行流程

```mermaid
sequenceDiagram
    participant TM as Task Manager
    participant NM as NS Monitor Job
    participant FO as Failover Service
    participant DH as DNS Helper
    participant Provider as DNS Provider
    participant Notif as Notification Service
    participant DB as Database
    
    TM->>NM: 定时触发 NS 监测
    NM->>DB: 查询 ns_monitor_configs
    DB-->>NM: 返回配置列表
    
    loop 每个监测配置
        NM->>DH: 查询当前 NS 记录
        DH->>Provider: DNS 查询
        Provider-->>DH: 返回 NS 记录
        DH-->>NM: 返回结果
        
        NM->>NM: 对比预期 NS
        
        alt NS 不匹配
            NM->>FO: 触发故障转移
            FO->>DB: 查询 failover_configs
            DB-->>FO: 返回故障转移配置
            
            FO->>DH: 创建适配器
            DH->>Provider: 更新 DNS 记录
            Provider-->>DH: 更新结果
            DH-->>FO: 返回成功
            
            FO->>DB: 更新本地缓存
            FO->>Notif: 发送告警通知
            Notif->>Notif: 发送邮件/Webhook
        else NS 匹配
            NM->>DB: 记录正常状态
        end
    end
```

## 任务管理器调度流程

```mermaid
graph LR
    A[应用启动] --> B[初始化 Task Manager]
    B --> C[注册定时任务]
    C --> D{任务类型}
    
    D -->|WHOIS 刷新| E[高优先级]
    D -->|域名续期| F[中优先级]
    D -->|NS 监测| G[中优先级]
    D -->|故障转移| H[高优先级]
    
    E --> I[任务队列]
    F --> I
    G --> I
    H --> I
    
    I --> J[并发控制器]
    J --> K[执行任务]
    K --> L[记录日志]
    L --> M[发送通知]
```

### 任务优先级机制

- **高优先级**: WHOIS 刷新、故障转移（立即执行，可插队）
- **中优先级**: 域名续期、NS 监测（按顺序执行）
- **低优先级**: 缓存清理、日志归档（空闲时执行）

### 并发控制

- NS 监测: 最多 10 个并行请求
- WHOIS 查询: 最多 5 个并行请求
- 域名续期: 串行执行（避免冲突）

## 数据流总结

```
Task Manager 
  → Scheduled Job 
  → Query Database 
  → Process Data 
  → Call External API (if needed)
  → Update Database 
  → Send Notification 
  → Log Audit
```

## 配置示例

### 环境变量

```bash
# 任务并发控制
TASK_CONCURRENCY_NS=10
TASK_CONCURRENCY_WHOIS=5

# 定时任务间隔（秒）
WHOIS_REFRESH_INTERVAL=3600      # 1 小时
DOMAIN_RENEWAL_INTERVAL=86400    # 24 小时
NS_MONITOR_INTERVAL=300          # 5 分钟
```

### 数据库配置

```sql
-- WHOIS 缓存配置
INSERT INTO system_settings (key, value) 
VALUES ('whois_cache_ttl', '86400');  -- 24 小时

-- 置顶域名
INSERT INTO user_preferences (user_id, preferences) 
VALUES (1, '{"pinned_domains": [1, 2, 3]}');
```
