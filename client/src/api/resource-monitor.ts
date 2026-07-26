import { api } from './client';

export interface ResourceSnapshot {
  cpu_percent: number | null
  memory_percent: number | null
  memory_mb: number | null
  disk_percent: number | null
  uptime_seconds: number | null
  task_queue_depth: number
  db_queries_total: number
  db_errors_total: number
  http_probe_count: number
  http_avg_ms: number | null
  http_p50_ms: number | null
  http_p95_ms: number | null
  http_p99_ms: number | null
  dns_probe_count: number
  dns_avg_ms: number | null
  dns_p50_ms: number | null
  dns_p95_ms: number | null
  dns_p99_ms: number | null
  dns_encrypted_probe_count: number
  dns_encrypted_avg_ms: number | null
  dns_encrypted_p50_ms: number | null
  dns_encrypted_p95_ms: number | null
  dns_encrypted_p99_ms: number | null
  dns_plain_probe_count: number
  dns_plain_avg_ms: number | null
  dns_plain_p50_ms: number | null
  dns_plain_p95_ms: number | null
  dns_plain_p99_ms: number | null
  sqlite_io_reads: number
  sqlite_io_writes: number
  recorded_at: string
}

export const resourceMonitorApi = {
  current(): Promise<ResourceSnapshot> {
    return api.get('/resource-monitor/current').then(r => r.data.data)
  },
  history(params: { page?: number; pageSize?: number; hours?: number }) {
    return api.get('/resource-monitor/history', { params }).then(r => r.data)
  },
}
