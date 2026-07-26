import { createLogger } from '../../lib/logger';
import { taskManager } from '../taskManager';
import { buildSnapshot } from './cache';
import { getDatabaseStats } from '../../db/bal/resource-metrics-operations';

const log = createLogger('RESOURCE').sub('Collector');

let lastCpuUsage: NodeJS.CpuUsage | null = null;
let lastCpuTime = 0;

function getCpuPercent(): number | null {
  try {
    const current = process.cpuUsage();
    const now = Date.now();
    if (!lastCpuUsage) {
      lastCpuUsage = current;
      lastCpuTime = now;
      return null;
    }
    const cpuDeltaUs = current.user - lastCpuUsage.user + current.system - lastCpuUsage.system;
    const timeDeltaMs = now - lastCpuTime;
    lastCpuUsage = current;
    lastCpuTime = now;
    if (timeDeltaMs <= 0) return null;
    // 微秒 -> 毫秒 CPU 时间 / 秒级 wall 时间 -> 百分比
    const percent = (cpuDeltaUs / 1000 / (timeDeltaMs / 1000) / 1000) * 100;
    return Math.max(0, Math.round(percent));
  } catch (err) {
    log.warn('Failed to calculate CPU usage', { error: err });
    return null;
  }
}

function getSysUsage(): { cpu: number | null; memPct: number | null; memMb: number | null; disk: number | null; uptime: number | null } {
  try {
    const usage = process.memoryUsage();
    const totalMem = usage.heapTotal || 1;
    const memMb = Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100;
    const memPct = Math.round((usage.heapUsed / totalMem) * 1000) / 10;
    return {
      cpu: getCpuPercent(),
      memPct,
      memMb,
      disk: null,
      uptime: process.uptime() ? process.uptime() / 3600 : null,
    };
  } catch (err) {
    log.warn('Failed to collect system usage', { error: err });
    return { cpu: null, memPct: null, memMb: null, disk: null, uptime: null };
  }
}

export function collectSnapshot() {
  const sys = getSysUsage();
  const tq = taskManager.getQueuedCount();
  const db = getDatabaseStats();
  return buildSnapshot(sys, tq, db.queries, db.errors, db.reads, db.writes);
}
