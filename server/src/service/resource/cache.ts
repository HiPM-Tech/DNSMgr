class RingBuffer {
  private buffer: number[]
  private index: number
  private count: number
  readonly maxSize: number

  constructor(maxSize: number) {
    this.maxSize = maxSize
    this.buffer = new Array(maxSize)
    this.index = 0
    this.count = 0
  }

  push(value: number): void {
    this.buffer[this.index] = value
    this.index = (this.index + 1) % this.maxSize
    if (this.count < this.maxSize) this.count++
  }

  get values(): number[] {
    if (this.count === 0) return []
    const result: number[] = []
    const start = this.count < this.maxSize ? 0 : this.index
    for (let i = 0; i < this.count; i++) {
      result.push(this.buffer[(start + i) % this.maxSize])
    }
    return result
  }

  clear(): void {
    this.index = 0
    this.count = 0
  }

  avg(): number | null {
    if (this.count === 0) return null
    const vals = this.values
    return vals.reduce((a, b) => a + b, 0) / vals.length
  }

  percentile(p: number): number | null {
    if (this.count === 0) return null
    const sorted = [...this.values].sort((a, b) => a - b)
    const idx = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.max(0, idx)]
  }
}

export interface ResourceSnapshot {
  cpu_percent: number | null
  memory_percent: number | null
  memory_mb: number | null
  disk_percent: number | null
  uptime_hours: number | null
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
  sqlite_io_reads: number
  sqlite_io_writes: number
  recorded_at: string
}

const httpRing = new RingBuffer(5000)
const dnsRing = new RingBuffer(2000)

let lastDbQueries = 0
let lastDbErrors = 0
let lastSqliteReads = 0
let lastSqliteWrites = 0

export function pushHttpProbe(ms: number): void {
  httpRing.push(ms)
}

export function pushDnsProbe(ms: number): void {
  dnsRing.push(ms)
}

export function buildSnapshot(
  sys: { cpu: number | null; memPct: number | null; memMb: number | null; disk: number | null; uptime: number | null },
  taskQueueDepth: number,
  dbQueries: number,
  dbErrors: number,
  sqliteReads: number,
  sqliteWrites: number
): ResourceSnapshot {
  const httpCount = httpRing.values.length
  const dnsCount = dnsRing.values.length
  const deltaQueries = dbQueries - lastDbQueries
  const deltaErrors = dbErrors - lastDbErrors
  const deltaReads = sqliteReads - lastSqliteReads
  const deltaWrites = sqliteWrites - lastSqliteWrites
  lastDbQueries = dbQueries
  lastDbErrors = dbErrors
  lastSqliteReads = sqliteReads
  lastSqliteWrites = sqliteWrites

  return {
    cpu_percent: sys.cpu,
    memory_percent: sys.memPct,
    memory_mb: sys.memMb,
    disk_percent: sys.disk,
    uptime_hours: sys.uptime,
    task_queue_depth: taskQueueDepth,
    db_queries_total: Math.max(0, deltaQueries),
    db_errors_total: Math.max(0, deltaErrors),
    http_probe_count: httpCount,
    http_avg_ms: httpRing.avg(),
    http_p50_ms: httpRing.percentile(50),
    http_p95_ms: httpRing.percentile(95),
    http_p99_ms: httpRing.percentile(99),
    dns_probe_count: dnsCount,
    dns_avg_ms: dnsRing.avg(),
    dns_p50_ms: dnsRing.percentile(50),
    dns_p95_ms: dnsRing.percentile(95),
    dns_p99_ms: dnsRing.percentile(99),
    sqlite_io_reads: Math.max(0, deltaReads),
    sqlite_io_writes: Math.max(0, deltaWrites),
    recorded_at: new Date().toISOString(),
  }
}

export function clearProbes(): void {
  httpRing.clear()
  dnsRing.clear()
}
