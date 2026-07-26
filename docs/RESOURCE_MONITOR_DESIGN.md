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
| **进程** | 内存使用率 (%) | `process.memoryUsage()` → 计算百分比 | 10s | 60s |
| **进程** | 内存使用 (MB) | `process.memoryUsage().rss` 转 MB | 10s | 60s |
| **进程** | 磁盘使用率 (%) | `os.freemem()` / `os.totalmem()` 或 `df` | 10s | 60s |
| **进程** | 运行时长 (h) | `process.uptime()` | 10s | 60s |
| **SQLite IO** | 读/写 count | `driver.getStats()`（仅 SQLite） | 10s | 60s |
| **数据库** | 查询/错误总数 | `getDatabaseStats()` 通过 BAL | 10s | 60s |
| **任务管理器** | 队列深度 | `taskManager.getQueuedCount()` | 10s | 60s |
| **HTTP API 延迟** | 每次请求耗时 (ms) | `proxy-http.ts` 探针 → 内存 RingBuffer | — | 60s（仅聚合值） |
| **DNS 查询延迟** | 每次解析耗时 (ms) | `resolver.ts` 探针 → 内存 RingBuffer | — | 60s（仅聚合值） |

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

单行 upsert（固定 id = 1），记录最新采集值。每分钟写入 1 次。

```typescript
{
  name: 'resource_metrics',
  columns: [
    { name: 'id', type: 'id' },
    // 进程
    { name: 'cpu_percent', type: 'number', nullable: true },
    { name: 'memory_percent', type: 'number', nullable: true },
    { name: 'memory_mb', type: 'number', nullable: true },
    { name: 'disk_percent', type: 'number', nullable: true },
    { name: 'uptime_hours', type: 'number', nullable: true },
    // 数据库
    { name: 'db_queries_total', type: 'integer', defaultValue: 0 },
    { name: 'db_errors_total', type: 'integer', defaultValue: 0 },
    // 任务管理器
    { name: 'task_queue_depth', type: 'integer', defaultValue: 0 },
    // 延迟聚合（来自探针 RingBuffer）
    { name: 'http_probe_count', type: 'integer', defaultValue: 0 },
    { name: 'http_avg_ms', type: 'number', nullable: true },
    { name: 'http_p50_ms', type: 'number', nullable: true },
    { name: 'http_p95_ms', type: 'number', nullable: true },
    { name: 'http_p99_ms', type: 'number', nullable: true },
    { name: 'dns_probe_count', type: 'integer', defaultValue: 0 },
    { name: 'dns_avg_ms', type: 'number', nullable: true },
    { name: 'dns_p50_ms', type: 'number', nullable: true },
    { name: 'dns_p95_ms', type: 'number', nullable: true },
    { name: 'dns_p99_ms', type: 'number', nullable: true },
    // SQLite IO（仅 SQLite 有效）
    { name: 'sqlite_io_reads', type: 'integer', defaultValue: 0 },
    { name: 'sqlite_io_writes', type: 'integer', defaultValue: 0 },
    { name: 'recorded_at', type: 'datetime' },
    { name: 'updated_at', type: 'datetime' },
  ],
  indexes: [],
}
```

**写入量**：1,440 行/天（1 行/分钟），所有列在同一行，无索引开销。保留最新 1 行。

### 表 `resource_metric_history`（时序摘要）

存储预聚合的时序数据，**不存储原始探针样本**。结构与 `resource_metrics` 一致（不含 `id`、`updated_at`），每分钟写入 1 行。

```typescript
{
  name: 'resource_metric_history',
  columns: [
    { name: 'id', type: 'id' },
    { name: 'recorded_at', type: 'datetime', nullable: false },
    { name: 'cpu_percent', type: 'number', nullable: true },
    { name: 'memory_percent', type: 'number', nullable: true },
    { name: 'memory_mb', type: 'number', nullable: true },
    { name: 'disk_percent', type: 'number', nullable: true },
    { name: 'task_queue_depth', type: 'integer', defaultValue: 0 },
    { name: 'db_queries_total', type: 'integer', defaultValue: 0 },
    { name: 'db_errors_total', type: 'integer', defaultValue: 0 },
    { name: 'http_probe_count', type: 'integer', defaultValue: 0 },
    { name: 'http_avg_ms', type: 'number', nullable: true },
    { name: 'http_p50_ms', type: 'number', nullable: true },
    { name: 'http_p95_ms', type: 'number', nullable: true },
    { name: 'http_p99_ms', type: 'number', nullable: true },
    { name: 'dns_probe_count', type: 'integer', defaultValue: 0 },
    { name: 'dns_avg_ms', type: 'number', nullable: true },
    { name: 'dns_p50_ms', type: 'number', nullable: true },
    { name: 'dns_p95_ms', type: 'number', nullable: true },
    { name: 'dns_p99_ms', type: 'number', nullable: true },
    { name: 'sqlite_io_reads', type: 'integer', defaultValue: 0 },
    { name: 'sqlite_io_writes', type: 'integer', defaultValue: 0 },
  ],
  indexes: [
    { name: 'idx_rmh_recorded_at', columns: ['recorded_at'] },
  ],
}
```

**写入量**：
- 1 行/分钟
- 每小时 60 行
- 72h 总计 ≈ 4,320 行，每行约 200 bytes → **总量约 0.9 MB**

**数据修剪**：

通过定时任务 `pruneResourceHistoryJob` 每小时执行一次，由 BAL 层 `formatDateForDB()` 统一处理各数据库方言。等效 SQL：

```sql
-- SQLite
DELETE FROM resource_metric_history WHERE recorded_at < datetime('now', '-3 days');
-- MySQL
DELETE FROM resource_metric_history WHERE recorded_at < NOW() - INTERVAL 3 DAY;
-- PostgreSQL
DELETE FROM resource_metric_history WHERE recorded_at < NOW() - INTERVAL '3 days';
```

### 非 SQLite 驱动

在采集 `sqlite_io_reads` / `sqlite_io_writes` 时，先检查 `driver.type !== 'sqlite'`，非 SQLite 直接设为 `0` 并跳过 IO 计数器采集。

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

HTTP/DNS 探针数据仅存于此，**永不直接写入 DB**。仅记录耗时（ms），不存储请求元数据。

```typescript
class ResourceMetricsCache {
  private httpProbes: number[];   // 仅存耗时 ms
  private dnsProbes: number[];   // 仅存耗时 ms
  private maxHttpSamples = 5000;
  private maxDnsSamples  = 2000;

  pushHttpProbe(durationMs: number): void;
  pushDnsProbe(durationMs: number): void;

  /** 构建完整快照（含探针聚合值），不清空 buffer */
  buildSnapshot(): ResourceSnapshot;

  /** 清空所有探针 buffer（在落库后调用） */
  clearProbes(): void;
}
```

### `job.ts` — 主采集任务

```typescript
// 启动（app.ts 中调用）
export function startResourceMonitorJob(): void {
  // 高频率采集（每 10s）→ 内存缓存 + WebSocket 广播
  setInterval(() => {
    const snapshot = collectSnapshot();
    // 广播到 WebSocket
    wsService.broadcast({ type: 'resource:snapshot', data: snapshot });
  }, 10000);

  // 低频写入 DB（每 60s）→ 落库 + 清空探针
  setInterval(async () => {
    try {
      const snapshot = buildSnapshot();
      await upsertResourceMetrics(snapshot);
      await insertResourceHistory(snapshot);
      clearProbes();
    } catch (err) {
      log.error('Failed to flush resource metrics', { error: err });
    }
  }, 60000);
}
```

采集逻辑（`collector.ts`）：

```typescript
function collectSnapshot(): ResourceSnapshot {
  // 1. CPU（增量计算，首次调用返回 null）
  const cpuPercent = getCpuPercent();

  // 2. Memory
  const mem = process.memoryUsage();
  const totalMem = os.totalmem();
  const memoryPercent = totalMem > 0 ? Number(((mem.rss / totalMem) * 100).toFixed(2)) : null;
  const memoryMb = Number((mem.rss / 1024 / 1024).toFixed(2));

  // 3. Disk
  const freeMem = os.freemem();
  const diskPercent = totalMem > 0 ? Number((((totalMem - freeMem) / totalMem) * 100).toFixed(2)) : null;

  // 4. Uptime
  const uptimeHours = Number((process.uptime() / 3600).toFixed(2));

  // 5. DB Stats（通过 BAL 层）
  const dbStats = getDatabaseStats();
  const dbQueries = dbStats?.queries ?? 0;
  const dbErrors = dbStats?.errors ?? 0;

  // 6. Task Manager
  const taskQueueDepth = taskManager.getQueuedCount();

  return { cpuPercent, memoryPercent, memoryMb, diskPercent, uptimeHours,
           dbQueries, dbErrors, taskQueueDepth, recorded_at: new Date() };
}
```

### `prune.ts` — 超期数据修剪

每小时执行一次：

```typescript
export function startResourcePruneJob(): void {
  setInterval(async () => {
    await pruneResourceHistoryJob();  // DELETE recorded_at < now - 72h
  }, 3600000);
}
```

由 BAL 层 `formatDateForDB()` 统一处理各数据库方言的日期计算。

---

## HTTP 代理探针设计

### 探针插入点

在 `server/src/lib/proxy-http.ts` 的 `httpsRequest` 和 `httpRequest` 函数末尾：

```typescript
const duration = Date.now() - startTime;
if (globalResourceMetricsCache) {
  globalResourceMetricsCache.pushHttpProbe(duration);
}
```

### 注意事项

- 仅记录请求耗时（ms），不记录 URL、状态码或响应体，避免敏感信息留存
- `globalResourceMetricsCache` 为懒初始化单例，不阻塞请求路径
- 探针引入的额外延迟需控制在 0.01ms 以内（仅一次 `Date.now()` + 一次 `pushHttpProbe`）

---

## DNS 查询探针设计

在 `server/src/lib/dns/resolver/resolver.ts` 的 `resolve` 方法返回前：

```typescript
if (result.responseTime > 0 && globalResourceMetricsCache) {
  globalResourceMetricsCache.pushDnsProbe(result.responseTime);
}
```

同样在 `resolveNSWithValidation` 的加密/明文查询结果返回各插入一次。

---

## 路由设计

### `server/src/routes/resource-monitor.ts`

| 方法 | 路径 | 描述 | 鉴权 | 备注 |
|------|------|------|------|------|
| GET | `/api/resource-monitor/current` | 最新快照 | authMiddleware | 来自 `resource_metrics` 表 id=1 |
| GET | `/api/resource-monitor/history` | 时序摘要 | authMiddleware | 支持 `page`, `pageSize`, `hours` 参数 |
| POST | `/api/resource-monitor/prune` | 清理 72h 前历史数据 | authMiddleware + adminOnly | 手动触发 |

### server/app.ts 注册

```typescript
import { resourceMonitorRouter } from './routes/resource-monitor';
app.use('/api/resource-monitor', resourceMonitorRouter);

// 在 startServiceMonitorJob() 附近
import { startResourceMonitorJob, startResourcePruneJob } from './service/resource';
startResourceMonitorJob();    // 10s 采集 + 60s 落库
startResourcePruneJob();      // 每小时清理
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

- `Statistic` — TDesign 数字指标卡（带 value/suffix）
- `Progress` — TDesign 进度条（CPU/内存使用率）
- `Table` — TDesign 历史数据表格（带虚拟滚动）

### 实时数据

通过 `useWebSocket` hook 监听 `resource:snapshot` 事件，同时使用 `setInterval` 轮询 `/api/resource-monitor/current` 作为降级方案。

```typescript
// 在 ResourcePanel.tsx 中
const { lastMessage } = useWebSocket({
  onMessage: (msg) => {
    if (msg.type === 'resource:snapshot') {
      setSnapshot(msg.data);
    }
  },
});

// 轮询降级
useEffect(() => {
  const interval = setInterval(async () => {
    const res = await fetchResourceCurrent();
    if (res.code === 0) setSnapshot(res.data);
  }, 10000);
  return () => clearInterval(interval);
}, []);
```

### i18n 键

```json
{
  "resourceMonitor": {
    "title": "资源监控",
    "cpu": "CPU",
    "memory": "内存",
    "uptime": "运行时长",
    "disk": "磁盘",
    "taskQueue": "任务队列",
    "dbQueries": "数据库查询",
    "dbErrors": "数据库错误",
    "probeHttp": "HTTP 耗时",
    "probeDns": "DNS 耗时",
    "p50": "P50",
    "p95": "P95",
    "p99": "P99",
    "avg": "平均",
    "probeCount": "采样数",
    "history": "历史数据",
    "noData": "暂无数据"
  }
}
```

---

## WebSocket 事件

| 事件类型 | 推送频率 | 数据 |
|----------|----------|------|
| `resource:snapshot` | 每 10s | `ResourceSnapshot`（最新采集快照） |

---

## 实施计划

### Phase 1 — 基础设施（已完成）

1. 新增 `resource_metrics`、`resource_metric_history` 表 Schema（DSM）
2. 实现 `cache.ts`（内存 RingBuffer，固定大小）
3. 实现 `collector.ts`（CPU/内存/DB IO/Task 采集函数）
4. 实现 `job.ts`（主调度 + WebSocket 广播）
5. 实现 `prune.ts`（超期数据修剪）
6. 注册到 `app.ts` 启动流程

### Phase 2 — DB IO & Task Manager（已完成）

7. 在 SQLite `BaseDriver` 增加 `stats.reads/writes` 计数器
8. 检查 `driver.type`，非 SQLite 跳过 IO 采集
9. 在 `TaskManager` 增加 `getQueuedCount()` 接口

### Phase 3 — 探针（已完成）

10. HTTP 探针插入 `proxy-http.ts`
11. DNS 探针插入 `resolver.ts`
12. 探针聚合：60s 周期从 RingBuffer 消费并计算 P50/P95/P99

### Phase 4 — 前端（已完成）

13. 新增 `ResourcePanel.tsx` 页面：Statistic/Progress/Table 组件
14. WebSocket `resource:snapshot` 处理 + 轮询降级
15. i18n 国际化

### Phase 5 — 数据管理（已完成）

16. 验证修剪逻辑：超 72h 数据删除
17. 验证非 SQLite 下 IO 计数禁用

---

## 数据空间估算

| 表 | 行数/72h | 行大小 | 72h 总量 |
|----|----------|--------|----------|
| `resource_metrics` | 1,440 (1/min) | ~200 B | ~0.3 MB（只保留最新 1 行） |
| `resource_metric_history` | ~4,320 (1/min) | ~200 B | **~0.9 MB** |
| **合计** | | | **< 1.2 MB** |
