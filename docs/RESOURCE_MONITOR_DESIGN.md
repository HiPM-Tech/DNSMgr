# HiDNS 资源监测管理系统设计

**版本**：2.0
**创建日期**：2026-07-26
**状态**：设计阶段

---

## 目录

1. [概述](#概述)
2. [设计目标与约束](#设计目标与约束)
3. [数据采集项](#数据采集项)
4. [数据库设计](#数据库设计)
5. [Service 层设计](#service-层设计)
6. [HTTP 代理探针设计](#http-代理探针设计)
7. [DNS 查询探针设计](#dns-查询探针设计)
8. [路由设计](#路由设计)
9. [前端设计](#前端设计)
10. [WebSocket 事件](#websocket-事件)
11. [实施计划](#实施计划)

---

## 概述

设计一套轻量级实时资源监测系统，在不引入外部依赖的前提下，利用现有技术栈（进程 API + 内存 RingBuffer + DB 时序摘要 + WebSocket 实时推送 + Dashboard 展示）实现 HiDNS 自身健康度可观测。

---

## 设计目标与约束

### 约束

| 约束 | 说明 |
|------|------|
| **最大保留 72 小时** | 超期数据立即删除 |
| **数据库占用低** | 总量不超过 5MB |
| **数据库 IO 友好** | 写入频率 ≤ 1次/分钟（批量），禁止逐条写入 |
| **非 SQLite 不启用 IO 计数** | MySQL/PostgreSQL 驱动不采集 IO counter |
| **探针数据不入库** | HTTP/DNS 单次探针仅存内存 RingBuffer，只将聚合后的摘要写入 DB |

### 策略

- **高频采集、低频写入**：内存中 10s 采集一次 → WebSocket 实时推送 → 每分钟批量写入 DB 一次
- **探针不落盘**：每次 HTTP/DNS 请求的耗时、状态码仅在内存 RingBuffer 保留 5 分钟窗口，每分钟由采集任务聚合为延迟分位数(P50/P90/P99)后再写入 DB
- **单一精度**：5 分钟聚合精度保留 72 小时，无需降采样

---

## 数据采集项

| 分类 | 指标 | 采集方式 | 内存频率 | 入库频率 |
|------|------|----------|----------|----------|
| **进程** | CPU 使用率 (%) | `process.cpuUsage()` 增量计算 | 10s | 60s |
| **进程** | 内存 RSS (bytes) | `process.memoryUsage().rss` | 10s | 60s |
| **进程** | 堆内存使用/总量 (bytes) | `memoryUsage().heapUsed / heapTotal` | 10s | 60s |
| **进程** | 运行时长 (s) | `process.uptime()` | 10s | 60s |
| **SQLite IO** | 读/写 ops/s | `driver.stats.reads/writes`（仅 SQLite） | 10s | 60s |
| **数据库连接池** | 活跃/空闲数 | `driver.getPoolStats()` | 10s | 60s |
| **任务管理器** | 待处理/运行/完成/失败 | `taskManager.getStats()` | 10s | 60s |
| **HTTP API 延迟** | 每次请求耗时 (ms) 及状态码 | `proxy-http.ts` 探针 → 内存 RingBuffer | — | 60s（仅聚合值） |
| **DNS 查询延迟** | 每次解析耗时 (ms) 及来源 | `resolver.ts` 探针 → 内存 RingBuffer | — | 60s（仅聚合值） |
| **任务耗时分布** | P50/P90/P99 | `taskManager` completed 耗时 | — | 60s |

---

## 数据库设计

遵循 DSM 声明式模式。

### 总体策略

```
10s 采集 ─→ 内存暂存 ─→ 60s 批量聚合并写入 DB
                           ├── upsert resource_metrics（单行快照）
                           └── INSERT resource_metric_history（时序摘要）
```

### 表 `resource_metrics`（实时快照）

单行 upsert，记录最新采集值。每分钟写入 1 次。

```typescript
{
  name: 'resource_metrics',
  columns: [
    { name: 'id', type: 'id' },
    // 进程
    { name: 'cpu_percent', type: 'number', nullable: true },
    { name: 'memory_rss', type: 'number', nullable: true },
    { name: 'memory_heap_used', type: 'number', nullable: true },
    { name: 'memory_heap_total', type: 'number', nullable: true },
    { name: 'uptime_seconds', type: 'number', nullable: true },
    // 数据库
    { name: 'db_reads_per_sec', type: 'number', nullable: true },
    { name: 'db_writes_per_sec', type: 'number', nullable: true },
    { name: 'db_pool_active', type: 'integer', nullable: true },
    { name: 'db_pool_idle', type: 'integer', nullable: true },
    // 任务管理器
    { name: 'task_pending', type: 'integer', nullable: true },
    { name: 'task_running', type: 'integer', nullable: true },
    { name: 'task_completed_total', type: 'integer', nullable: true },
    { name: 'task_failed_total', type: 'integer', nullable: true },
    // 延迟聚合（来自探针 RingBuffer）
    { name: 'http_p50_ms', type: 'number', nullable: true },
    { name: 'http_p90_ms', type: 'number', nullable: true },
    { name: 'http_p99_ms', type: 'number', nullable: true },
    { name: 'dns_p50_ms', type: 'number', nullable: true },
    { name: 'dns_p90_ms', type: 'number', nullable: true },
    { name: 'dns_p99_ms', type: 'number', nullable: true },
    { name: 'task_p50_ms', type: 'number', nullable: true },
    { name: 'task_p90_ms', type: 'number', nullable: true },
    { name: 'task_p99_ms', type: 'number', nullable: true },
    { name: 'collected_at', type: 'datetime' },
  ],
  indexes: [],
}
```

**写入量**：1,440 行/天（1 行/分钟），所有列在同一行，无索引开销。保留最新 1 行。

### 表 `resource_metric_history`（时序摘要）

存储预聚合的时序数据，**不存储原始探针样本**。每次写入一批 ~20 行。

```typescript
{
  name: 'resource_metric_history',
  columns: [
    { name: 'id', type: 'id' },
    { name: 'metric_name', type: 'string' },    // 'cpu_percent', 'http_p50', 'dns_p99', 'memory_rss' …
    { name: 'value_avg', type: 'number' },
    { name: 'value_min', type: 'number' },
    { name: 'value_max', type: 'number' },
    { name: 'sampled_at', type: 'datetime' },
  ],
  indexes: [
    { name: 'idx_mh_name_time', columns: ['metric_name', 'sampled_at'] },
  ],
}
```

**写入量**：
- 每次写入一批 ~20 行
- 每小时 12 批 = ~240 行
- 72h 总计 ≈ 17,280 行，每行约 100 bytes → **总量约 1.7 MB**

**数据修剪**：

```sql
DELETE FROM resource_metric_history WHERE sampled_at < datetime('now', '-3 days');
```

### 非 SQLite 驱动

在采集 `db_reads_per_sec` / `db_writes_per_sec` 时，先检查 `driver.type !== 'sqlite'`，非 SQLite 直接设为 `null` 并跳过 IO 计数器采集。

---

## Service 层设计

### 文件结构

```
server/src/service/resource/
├── index.ts                   # 统一导出
├── job.ts                     # 主调度任务 10s 周期
├── cache.ts                   # 探针 RingBuffer（内存，不落库）
├── collector.ts               # 系统指标采集器（CPU/内存/DB IO/Task）
└── prune.ts                   # 超期数据修剪（定时 1h）
```

### `cache.ts` — 内存 RingBuffer

HTTP/DNS 探针数据仅存于此，**永不直接写入 DB**。

```typescript
interface HttpProbeSample {
  url: string; method: string; statusCode: number;
  durationMs: number; bytesTransferred: number;
  proxyUsed: boolean; timestamp: Date;
}

interface DnsProbeSample {
  domain: string; queryType: string;
  durationMs: number; source: string;
  success: boolean; timestamp: Date;
}

interface Percentiles { p50: number; p90: number; p99: number; }

class ResourceMetricsCache {
  // 探针 RingBuffer（固定大小，自动覆盖最旧数据）
  private httpProbes: HttpProbeSample[];
  private dnsProbes: DnsProbeSample[];
  private maxHttpSamples = 5000;   // 5min @ ~16 RPS
  private maxDnsSamples  = 2000;   // 5min @ ~6 QPS

  pushHttpProbe(sample: HttpProbeSample): void;
  pushDnsProbe(sample: DnsProbeSample): void;

  /** 消耗并清空 buffer，返回聚合分位数 */
  consumeHttpPercentiles(): Percentiles;
  consumeDnsPercentiles(): Percentiles;
}
```

### `job.ts` — 主采集任务

```typescript
// 启动（app.ts 中调用）
export function startResourceMonitorJob(): void {
  let lastCpuUsage = process.cpuUsage();
  let lastCpuTime = Date.now();
  let lastDbStats = { reads: 0, writes: 0 };
  let lastDbStatsTime = Date.now();
  let writeTick = 0;

  setInterval(() => {
    // === 高频率内存采集（每 10s）===
    const snapshot = collectSnapshot();
    // 广播到 WebSocket
    wsService.broadcast({ type: 'resource_metrics_updated', data: snapshot });

    // === 低频写入 DB（每 60s）===
    writeTick++;
    if (writeTick >= 6) {
      writeTick = 0;
      // 聚合探针百分位
      snapshot.httpP50 = cache.consumeHttpPercentiles();
      snapshot.dnsP50 = cache.consumeDnsPercentiles();
      // upsert resource_metrics
      // insert batch into resource_metric_history (with precision_sec=300)
    }
  }, 10000);
}
```

采集逻辑：

```typescript
function collectSnapshot(): ResourceSnapshot {
  // 1. CPU
  const currentCpu = process.cpuUsage();
  const now = Date.now();
  const cpuDelta = (currentCpu.user - lastCpuUsage.user + currentCpu.system - lastCpuUsage.system) / 1000;
  const timeDelta = (now - lastCpuTime) / 1000;
  cpuPercent = timeDelta > 0 ? (cpuDelta / timeDelta / 1000) * 100 : 0;
  lastCpuUsage = currentCpu; lastCpuTime = now;

  // 2. Memory
  const mem = process.memoryUsage();

  // 3. DB IO（仅 SQLite）
  let dbReadsPerSec: number | null = null, dbWritesPerSec: number | null = null;
  if (driverType === 'sqlite') {
    const currentDbStats = getDriverStats();
    const dbTimeDelta = (now - lastDbStatsTime) / 1000;
    if (dbTimeDelta > 0) {
      dbReadsPerSec = (currentDbStats.reads - lastDbStats.reads) / dbTimeDelta;
      dbWritesPerSec = (currentDbStats.writes - lastDbStats.writes) / dbTimeDelta;
    }
    lastDbStats = currentDbStats; lastDbStatsTime = now;
  }

  // 4. DB Pool
  const poolStats = driver.getPoolStats();

  // 5. Task Manager
  const taskStats = taskManager.getStats();

  return { cpuPercent, memoryRss: mem.rss, …, collected_at: new Date() };
}
```

### `prune.ts` — 超期数据修剪

每小时执行一次：

```typescript
export function startResourcePruneJob(): void {
  setInterval(async () => {
    await pruneExpired();      // DELETE sampled_at < now - 72h
    cache.trim();              // 清理内存探针 RingBuffer
  }, 3600000);
}
```

```sql
DELETE FROM resource_metric_history WHERE sampled_at < datetime('now', '-3 days');
```

---

## HTTP 代理探针设计

### 探针插入点

在 `server/src/lib/proxy-http.ts` 的 `httpsRequest` 和 `httpRequest` 函数末尾：

```typescript
const duration = Date.now() - startTime;
if (globalResourceMetricsCache) {
  globalResourceMetricsCache.pushHttpProbe({
    url: url.href,
    method: options.method || 'GET',
    statusCode: res.statusCode,
    durationMs: duration,
    bytesTransferred: responseBuffer.length,
    proxyUsed: !!agent,
    timestamp: new Date(),
  });
}
```

### 注意事项

- 只记录 URL path 而非完整 URL（去除 query params），避免敏感信息随探针留存
- `globalResourceMetricsCache` 为懒初始化单例，不阻塞请求路径
- 探针引入的额外延迟需控制在 0.01ms 以内（仅一次 `Date.now()` + 一次 `pushHttpProbe`）

---

## DNS 查询探针设计

在 `server/src/lib/dns/resolver/resolver.ts` 的 `resolve` 方法返回前：

```typescript
if (result.responseTime > 0 && globalResourceMetricsCache) {
  globalResourceMetricsCache.pushDnsProbe({
    domain,
    queryType: DNSQueryType[type],
    durationMs: result.responseTime,
    source: result.source,
    success: result.success,
    timestamp: new Date(),
  });
}
```

同样在 `resolveNSWithValidation` 的加密/明文查询结果返回各插入一次。

---

## 路由设计

### `server/src/routes/resource-monitor.ts`

| 方法 | 路径 | 描述 | 鉴权 | 备注 |
|------|------|------|------|------|
| GET | `/api/resource-monitor/metrics` | 最新快照 | authMiddleware | 来自 `resource_metrics` 表 |
| GET | `/api/resource-monitor/history` | 时序摘要 | authMiddleware | 支持 `metric_name`, `from`, `to`, `precision` 参数 |
| GET | `/api/resource-monitor/tasks` | 任务管理器状态 | adminOnly | 实时来自 `taskManager` |

### server/app.ts 注册

```typescript
import { resourceMonitorRouter } from './routes/resource-monitor';
app.use('/api/resource-monitor', resourceMonitorRouter);

// 在 startServiceMonitorJob() 附近
import { startResourceMonitorJob, startResourcePruneJob } from './service/resource';
startResourceMonitorJob();    // 10s 采集周期
startResourcePruneJob();      // 1h 修剪+内存清理
```

---

## 前端设计

### Dashboard 新面板

插在"提供商分布"面板后，标题 **系统资源**。

```
┌──────────────────────────────────────────────────┐
│  系统资源 (10s 实时)                               │
├──────────┬──────────┬──────────┬─────────────────┤
│  CPU     │  内存    │  IO      │  运行时间         │
│  23%     │ 128 MB   │  读 45/s │  3d 12h 8m      │
│  [████░░]│ [████░░] │  写 12/s │                  │
├──────────┴──────────┴──────────┴─────────────────┤
│  任务队列          │ API 延迟     │  DNS 延迟       │
│  ▸ 待处理: 3      │ P50  120ms  │  P50   45ms     │
│  ▸ 运行中: 2      │ P90  350ms  │  P90  120ms     │
│  ▸ 失败(5min): 1  │ P99  800ms  │  P99  300ms     │
└──────────────────────────────────────────────────┘
```

### 组件复用

- `BoardCard` — CPU/RAM/IO/Uptime 概览
- `CoverageRing` — CPU/内存使用率环图
- `MeterRow` — 各指标进度条
- `Statistic` — 数字动画

### 实时数据

```typescript
useRealtimeData({
  queryKey: ['resourceMetrics'],
  websocketEventTypes: ['resource_metrics_updated'],
  pollingInterval: 10000,
});
```

### i18n 键

```json
{
  "dashboard": {
    "systemResources": "System Resources",
    "cpuUsage": "CPU Usage",
    "memoryUsage": "Memory Usage",
    "dbIo": "Database IO",
    "dbReads": "Read",
    "dbWrites": "Write",
    "dbPool": "Connection Pool",
    "uptime": "Uptime",
    "taskQueue": "Task Queue",
    "taskPending": "Pending",
    "taskRunning": "Running",
    "taskFailed": "Failed (5min)",
    "apiLatency": "API Latency",
    "dnsLatency": "DNS Latency",
    "p50": "P50",
    "p90": "P90",
    "p99": "P99"
  }
}
```

---

## WebSocket 事件

| 事件类型 | 推送频率 | 数据 |
|----------|----------|------|
| `resource_metrics_updated` | 每 10s | `ResourceSnapshot`（含最新快照 + 探针百分位） |

---

## 实施计划

### Phase 1 — 基础设施（2d）

1. 新增 `resource_metrics`、`resource_metric_history` 表 Schema（DSM）
2. 实现 `cache.ts`（内存 RingBuffer，固定大小）
3. 实现 `collector.ts`（CPU/内存/DB IO/Task 采集函数）
4. 实现 `job.ts`（主调度 + WebSocket 广播）
5. 实现 `prune.ts`（超期数据修剪）
6. 注册到 `app.ts` 启动流程

### Phase 2 — DB IO & Task Manager（1d）

6. 在 SQLite `BaseDriver` 增加 `stats.reads/writes` 计数器
7. 检查 `driver.type`，非 SQLite 跳过 IO 采集
8. 在 `TaskManager` 增加 `getStats()` 接口（队列长度、完成/失败累计）

### Phase 3 — 探针（1.5d）

9. HTTP 探针插入 `proxy-http.ts`
10. DNS 探针插入 `resolver.ts`
11. 探针聚合：每分钟从 RingBuffer 消费并计算 P50/P90/P99

### Phase 4 — 前端（2d）

12. Dashboard 新面板：布局 + `BoardCard`/`CoverageRing` 组件
13. WebSocket `resource_metrics_updated` 处理
14. i18n 国际化

### Phase 5 — 数据管理（0.5d）

15. 验证修剪逻辑：超 72h 数据删除
16. 验证非 SQLite 下 IO 计数禁用

---

## 数据空间估算

| 表 | 行数/72h | 行大小 | 72h 总量 |
|----|----------|--------|----------|
| `resource_metrics` | 1,440 (1/min) | ~200 B | ~0.3 MB（只保留最新 1 行） |
| `resource_metric_history` | ~17,280 | ~100 B | **~1.7 MB** |
| **合计** | | | **< 2 MB** |
