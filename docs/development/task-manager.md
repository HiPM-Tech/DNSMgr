# 任务管理器 (Task Manager)

## 概述

任务管理器是一个后台任务调度和并发控制模块，用于管理 DNSMgr 系统中的所有后台任务，避免多个任务同时执行导致系统瞬时卡顿。

## 核心功能

### 1. 任务队列管理
- 所有任务提交到队列中等待执行
- 自动按顺序处理队列中的任务
- 支持任务取消和队列清空

### 2. 并发控制
- **全局并发限制**：默认最多同时运行 3 个任务
- **任务级并发限制**：每个任务可以设置自己的并发数
- **防重复执行**：相同 ID 的任务不会同时运行

### 3. 超时控制
- 支持为每个任务设置超时时间
- 超时后自动终止任务并标记为失败

### 4. 重试机制
- 支持配置失败后的重试次数
- 支持配置重试间隔时间
- 达到最大重试次数后标记为失败

### 5. 任务监控
- 实时查看运行中的任务
- 查看队列中等待的任务数量
- 记录任务的执行时长和状态

## 使用方法

### 基本用法

```typescript
import { taskManager } from './service/taskManager';

// 提交一个任务
await taskManager.submit(
  {
    id: 'my-task-1',           // 任务唯一标识
    name: 'My Task',            // 任务名称
    concurrency: 1,             // 最大并发数（可选，默认1）
    timeout: 30000,             // 超时时间（可选，单位毫秒）
    retries: 2,                 // 重试次数（可选，默认0）
    retryDelay: 1000,           // 重试间隔（可选，默认1000ms）
  },
  async () => {
    // 任务执行逻辑
    await doSomething();
  }
);
```

### 批量提交任务

```typescript
// 批量提交多个任务
const tasks = items.map(item => {
  return taskManager.submit(
    {
      id: `task-${item.id}`,
      name: `Process ${item.name}`,
      concurrency: 5,      // 允许最多5个并发
      timeout: 60000,
      retries: 1,
    },
    async () => {
      await processItem(item);
    }
  );
});

// 等待所有任务完成
await Promise.all(tasks);
```

### 调整全局并发数

```typescript
// 设置全局最大并发任务数为 5
taskManager.setMaxConcurrentTasks(5);
```

### 监控任务状态

```typescript
// 获取运行中的任务数
const runningCount = taskManager.getRunningCount();

// 获取队列中等待的任务数
const queuedCount = taskManager.getQueuedCount();

// 获取所有运行中的任务信息
const allTasks = taskManager.getAllTasks();
console.log(allTasks);
// [
//   {
//     id: 'task-1',
//     name: 'My Task',
//     status: 'running',
//     startTime: 1234567890,
//     duration: 5000,
//   }
// ]
```

### 取消任务

```typescript
// 从队列中取消任务（无法取消正在运行的任务）
const cancelled = taskManager.cancelTask('my-task-1');
if (cancelled) {
  console.log('Task cancelled successfully');
}
```

### 清空队列

```typescript
// 清空所有等待中的任务
taskManager.clearQueue();
```

### 等待所有任务完成

```typescript
// 等待所有任务（运行中 + 队列中）完成
await taskManager.waitForAll();
console.log('All tasks completed');
```

## 实际应用示例

### NS 监测任务

```typescript
import { taskManager } from './taskManager';

async function runNsMonitorJob(): Promise<void> {
  const monitors = await NSMonitorOperations.getAllEnabled();
  
  // 使用任务管理器并发检查（最多同时5个）
  const tasks = monitors.map(monitor => {
    return taskManager.submit(
      {
        id: `ns-monitor-${monitor.id}`,
        name: `NS Monitor: ${monitor.domain_name}`,
        concurrency: 5,       // 允许最多5个并发
        timeout: 30000,       // 30秒超时
        retries: 2,           // 失败重试2次
        retryDelay: 2000,     // 重试间隔2秒
      },
      async () => {
        await checkDomainNs(monitor);
      }
    );
  });

  // 等待所有任务完成
  await Promise.all(tasks);
}
```

### WHOIS 同步任务

```typescript
import { taskManager } from './taskManager';

async function syncAllDomainsWhois() {
  const domains = await WhoisOperations.getAllDomains();
  
  // 使用任务管理器并发处理（最多3个并发）
  const tasks = domains.map(d => {
    return taskManager.submit(
      {
        id: `whois-${d.id}`,
        name: `WHOIS Sync: ${d.name}`,
        concurrency: 3,       // 允许最多3个并发
        timeout: 60000,       // 60秒超时
        retries: 1,           // 失败重试1次
        retryDelay: 5000,     // 重试间隔5秒
      },
      async () => {
        const whoisResult = await checkWhoisForDomain(d.name);
        await updateDatabase(d.id, whoisResult);
      }
    );
  });

  // 等待所有任务完成
  await Promise.all(tasks);
}
```

## 任务状态

任务可能的状态：

| 状态 | 说明 |
|------|------|
| `pending` | 等待执行（在队列中） |
| `running` | 正在执行 |
| `completed` | 执行成功 |
| `failed` | 执行失败（达到最大重试次数） |
| `cancelled` | 已取消 |

## 注意事项

1. **任务ID唯一性**：确保每个任务的 ID 是唯一的，否则可能导致任务被跳过
2. **超时设置**：为长时间运行的任务设置合理的超时时间，避免任务卡死
3. **重试策略**：根据任务特性设置合适的重试次数和间隔，避免频繁重试
4. **并发控制**：根据服务器性能调整全局并发数，避免资源耗尽
5. **错误处理**：任务失败后会抛出异常，需要在调用处捕获处理

## 性能优化建议

1. **合理设置并发数**：
   - I/O 密集型任务（如网络请求）：可以设置较高的并发数（5-10）
   - CPU 密集型任务：建议设置较低的并发数（1-3）

2. **超时时间**：
   - 快速任务：5-10 秒
   - 中等任务：30-60 秒
   - 长时间任务：根据实际需求设置

3. **重试策略**：
   - 网络请求：重试 2-3 次，间隔 2-5 秒
   - 数据库操作：重试 1-2 次，间隔 1-3 秒
   - 外部 API：重试 1-2 次，间隔 5-10 秒

4. **监控和日志**：
   - 定期检查任务执行情况
   - 关注失败率高的任务
   - 优化执行时间长的任务
