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

const httpRing = new RingBuffer(5000)
const dnsRing = new RingBuffer(2000)
const dnsEncryptedRing = new RingBuffer(2000)
const dnsPlainRing = new RingBuffer(2000)

let lastDbQueries = 0
let lastDbErrors = 0
let lastSqliteReads = 0
let lastSqliteWrites = 0
let lastHttpCount = 0
let lastDnsCount = 0
let lastDnsEncryptedCount = 0
let lastDnsPlainCount = 0

export function pushHttpProbe(ms: number): void {
  httpRing.push(ms)
}

export function pushDnsProbe(ms: number): void {
  dnsRing.push(ms)
}

export function pushDnsEncryptedProbe(ms: number): void {
  dnsRing.push(ms)
  dnsEncryptedRing.push(ms)
}

export function pushDnsPlainProbe(ms: number): void {
  dnsRing.push(ms)
  dnsPlainRing.push(ms)
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
  const dnsEncryptedCount = dnsEncryptedRing.values.length
  const dnsPlainCount = dnsPlainRing.values.length
  const deltaHttpProbes = httpCount - lastHttpCount
  const deltaDnsProbes = dnsCount - lastDnsCount
  const deltaDnsEncrypted = dnsEncryptedCount - lastDnsEncryptedCount
  const deltaDnsPlain = dnsPlainCount - lastDnsPlainCount
  const deltaQueries = dbQueries - lastDbQueries
  const deltaErrors = dbErrors - lastDbErrors
  const deltaReads = sqliteReads - lastSqliteReads
  const deltaWrites = sqliteWrites - lastSqliteWrites
  lastDbQueries = dbQueries
  lastDbErrors = dbErrors
  lastSqliteReads = sqliteReads
  lastSqliteWrites = sqliteWrites

  // Helper: safely compute percentile
  const pct = (ring: RingBuffer, p: number): number | null => {
    const v = ring.percentile(p)
    return v != null ? Math.round(v) : null
  }
  const avg = (ring: RingBuffer): number | null => {
    const v = ring.avg()
    return v != null ? Math.round(v) : null
  }

  return {
    cpu_percent: sys.cpu != null ? Math.round(sys.cpu) : null,
    memory_percent: sys.memPct != null ? Math.round(sys.memPct) : null,
    memory_mb: sys.memMb != null ? Math.round(sys.memMb) : null,
    disk_percent: sys.disk != null ? Math.round(sys.disk) : null,
    uptime_hours: sys.uptime != null ? Math.round(sys.uptime) : null,
    task_queue_depth: taskQueueDepth,
    db_queries_total: Math.max(0, deltaQueries),
    db_errors_total: Math.max(0, deltaErrors),
    http_probe_count: Math.max(0, deltaHttpProbes),
    http_avg_ms: httpRing.avg() != null ? Math.round(httpRing.avg()!) : null,
    http_p50_ms: httpRing.percentile(50) != null ? Math.round(httpRing.percentile(50)!) : null,
    http_p95_ms: httpRing.percentile(95) != null ? Math.round(httpRing.percentile(95)!) : null,
    http_p99_ms: httpRing.percentile(99) != null ? Math.round(httpRing.percentile(99)!) : null,
    dns_probe_count: Math.max(0, deltaDnsProbes),
    dns_avg_ms: avg(dnsRing),
    dns_p50_ms: pct(dnsRing, 50),
    dns_p95_ms: pct(dnsRing, 95),
    dns_p99_ms: pct(dnsRing, 99),
    dns_encrypted_probe_count: Math.max(0, deltaDnsEncrypted),
    dns_encrypted_avg_ms: avg(dnsEncryptedRing),
    dns_encrypted_p50_ms: pct(dnsEncryptedRing, 50),
    dns_encrypted_p95_ms: pct(dnsEncryptedRing, 95),
    dns_encrypted_p99_ms: pct(dnsEncryptedRing, 99),
    dns_plain_probe_count: Math.max(0, deltaDnsPlain),
    dns_plain_avg_ms: avg(dnsPlainRing),
    dns_plain_p50_ms: pct(dnsPlainRing, 50),
    dns_plain_p95_ms: pct(dnsPlainRing, 95),
    dns_plain_p99_ms: pct(dnsPlainRing, 99),
    sqlite_io_reads: Math.max(0, deltaReads),
    sqlite_io_writes: Math.max(0, deltaWrites),
    recorded_at: new Date().toISOString(),
  }
}

export function clearProbes(): void {
  lastHttpCount = httpRing.values.length
  lastDnsCount = dnsRing.values.length
  lastDnsEncryptedCount = dnsEncryptedRing.values.length
  lastDnsPlainCount = dnsPlainRing.values.length
}
