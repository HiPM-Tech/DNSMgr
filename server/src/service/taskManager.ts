/**
 * Task Manager - 后台任务管理器
 * 实现任务队列、并发控制和执行调度，避免多个任务同时执行导致系统卡顿
 */

import { log } from '../lib/logger';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type TaskPriority = 'low' | 'normal' | 'high' | 'critical';

export interface TaskInfo {
  id: string;
  name: string;
  status: TaskStatus;
  priority?: TaskPriority;
  startTime?: number;
  endTime?: number;
  duration?: number;
  error?: Error;
}

export interface TaskOptions {
  /** 任务唯一标识 */
  id: string;
  /** 任务名称 */
  name: string;
  /** 任务优先级（默认 normal） */
  priority?: TaskPriority;
  /** 最大并发数（默认1，即串行执行） */
  concurrency?: number;
  /** 超时时间（毫秒，0表示不超时） */
  timeout?: number;
  /** 失败后重试次数 */
  retries?: number;
  /** 重试间隔（毫秒） */
  retryDelay?: number;
}

interface QueuedTask {
  options: TaskOptions;
  fn: () => Promise<void>;
  resolve: () => void;
  reject: (error: Error) => void;
  attempts: number;
  queuedAt: number; // 入队时间，用于排序
}

class TaskManager {
  private runningTasks: Map<string, TaskInfo> = new Map();
  private taskQueue: QueuedTask[] = [];
  private maxConcurrentTasks: number = 3; // 全局最大并发任务数
  private isProcessing: boolean = false;

  /**
   * 设置全局最大并发任务数
   */
  setMaxConcurrentTasks(max: number): void {
    this.maxConcurrentTasks = max;
    log.info('TaskManager', `Max concurrent tasks set to ${max}`);
    this.processQueue();
  }

  /**
   * 获取当前运行中的任务数
   */
  getRunningCount(): number {
    return this.runningTasks.size;
  }

  /**
   * 获取队列中等待的任务数
   */
  getQueuedCount(): number {
    return this.taskQueue.length;
  }

  /**
   * 获取所有任务信息
   */
  getAllTasks(): TaskInfo[] {
    return Array.from(this.runningTasks.values());
  }

  /**
   * 提交任务到队列
   */
  async submit(options: TaskOptions, fn: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const queuedTask: QueuedTask = {
        options,
        fn,
        resolve,
        reject,
        attempts: 0,
        queuedAt: Date.now(),
      };

      // 根据优先级插入队列（高优先级插队）
      this.insertTaskByPriority(queuedTask);
      
      log.debug('TaskManager', `Task queued: ${options.name} (${options.id})`, {
        queueLength: this.taskQueue.length,
        priority: options.priority || 'normal',
      });

      this.processQueue();
    });
  }

  /**
   * 根据优先级插入任务到队列
   * 优先级顺序：critical > high > normal > low
   */
  private insertTaskByPriority(task: QueuedTask): void {
    const priorityValue = this.getPriorityValue(task.options.priority || 'normal');
    
    // 找到第一个优先级低于当前任务的位置
    let insertIndex = this.taskQueue.length;
    for (let i = 0; i < this.taskQueue.length; i++) {
      const existingPriority = this.getPriorityValue(this.taskQueue[i].options.priority || 'normal');
      if (priorityValue > existingPriority) {
        insertIndex = i;
        break;
      }
    }
    
    // 插入到合适的位置
    this.taskQueue.splice(insertIndex, 0, task);
    
    if (insertIndex < this.taskQueue.length - 1) {
      log.info('TaskManager', `High priority task inserted at position ${insertIndex}: ${task.options.name}`, {
        priority: task.options.priority,
      });
    }
  }

  /**
   * 获取优先级的数值表示（越大优先级越高）
   */
  private getPriorityValue(priority: TaskPriority): number {
    switch (priority) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'normal': return 2;
      case 'low': return 1;
      default: return 2;
    }
  }

  /**
   * 处理任务队列
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.taskQueue.length > 0 && this.runningTasks.size < this.maxConcurrentTasks) {
        const queuedTask = this.taskQueue.shift();
        if (!queuedTask) break;

        this.executeTask(queuedTask);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 执行单个任务
   */
  private async executeTask(queuedTask: QueuedTask): Promise<void> {
    const { options, fn, resolve, reject, attempts } = queuedTask;
    const taskId = options.id;

    // 检查是否已有相同ID的任务在运行
    if (this.runningTasks.has(taskId)) {
      log.warn('TaskManager', `Task already running, re-queuing: ${options.name}`, { taskId });
      this.taskQueue.unshift(queuedTask);
      return;
    }

    // 创建任务信息
    const taskInfo: TaskInfo = {
      id: taskId,
      name: options.name,
      status: 'running',
      startTime: Date.now(),
    };

    this.runningTasks.set(taskId, taskInfo);
    log.info('TaskManager', `Task started: ${options.name}`, {
      taskId,
      runningCount: this.runningTasks.size,
      queuedCount: this.taskQueue.length,
    });

    try {
      // 设置超时
      let timeoutId: NodeJS.Timeout | null = null;
      const timeout = options.timeout || 0;

      const executionPromise = timeout > 0
        ? Promise.race([
            fn(),
            new Promise<never>((_, reject) => {
              timeoutId = setTimeout(() => {
                reject(new Error(`Task timeout after ${timeout}ms`));
              }, timeout);
            }),
          ])
        : fn();

      await executionPromise;

      if (timeoutId) clearTimeout(timeoutId);

      // 任务成功
      taskInfo.status = 'completed';
      taskInfo.endTime = Date.now();
      taskInfo.duration = taskInfo.endTime - taskInfo.startTime!;

      log.info('TaskManager', `Task completed: ${options.name}`, {
        taskId,
        duration: taskInfo.duration,
      });

      resolve();
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      
      // 重试逻辑
      const maxRetries = options.retries || 0;
      if (attempts < maxRetries) {
        const retryDelay = options.retryDelay || 1000;
        log.warn('TaskManager', `Task failed, retrying (${attempts + 1}/${maxRetries}): ${options.name}`, {
          taskId,
          error: err.message,
          retryDelay,
        });

        // 延迟后重新加入队列
        setTimeout(() => {
          this.taskQueue.unshift({
            ...queuedTask,
            attempts: attempts + 1,
          });
          this.processQueue();
        }, retryDelay);
      } else {
        // 达到最大重试次数，任务失败
        taskInfo.status = 'failed';
        taskInfo.endTime = Date.now();
        taskInfo.duration = taskInfo.endTime - taskInfo.startTime!;
        taskInfo.error = err;

        log.error('TaskManager', `Task failed: ${options.name}`, {
          taskId,
          attempts: attempts + 1,
          error: err.message,
        });

        reject(err);
      }
    } finally {
      // 移除运行中的任务
      this.runningTasks.delete(taskId);
      
      // 继续处理队列
      this.processQueue();
    }
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: string): boolean {
    // 从队列中移除
    const index = this.taskQueue.findIndex(t => t.options.id === taskId);
    if (index !== -1) {
      const removed = this.taskQueue.splice(index, 1)[0];
      removed.reject(new Error('Task cancelled'));
      log.info('TaskManager', `Task cancelled from queue: ${removed.options.name}`, { taskId });
      return true;
    }

    // 无法取消正在运行的任务，只能标记
    if (this.runningTasks.has(taskId)) {
      log.warn('TaskManager', `Cannot cancel running task, it will complete: ${taskId}`);
      return false;
    }

    return false;
  }

  /**
   * 清空队列
   */
  clearQueue(): void {
    const count = this.taskQueue.length;
    this.taskQueue.forEach(task => {
      task.reject(new Error('Queue cleared'));
    });
    this.taskQueue = [];
    log.info('TaskManager', `Queue cleared, removed ${count} tasks`);
  }

  /**
   * 等待所有任务完成
   */
  async waitForAll(): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.runningTasks.size === 0 && this.taskQueue.length === 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 100);
    });
  }
}

// 导出单例
export const taskManager = new TaskManager();
