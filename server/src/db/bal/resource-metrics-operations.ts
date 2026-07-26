import { query, execute, run, get, getDbType, formatDateForDB, getDatabaseStats } from './business-adapter';

export { getDatabaseStats };

export interface ResourceSnapshot {
  cpu_percent: number | null;
  memory_percent: number | null;
  memory_mb: number | null;
  disk_percent: number | null;
  uptime_hours: number | null;
  task_queue_depth: number;
  db_queries_total: number;
  db_errors_total: number;
  http_probe_count: number;
  http_avg_ms: number | null;
  http_p50_ms: number | null;
  http_p95_ms: number | null;
  http_p99_ms: number | null;
  dns_probe_count: number;
  dns_avg_ms: number | null;
  dns_p50_ms: number | null;
  dns_p95_ms: number | null;
  dns_p99_ms: number | null;
  sqlite_io_reads: number;
  sqlite_io_writes: number;
  recorded_at: string;
}

// resource_metrics 为单行快照，固定 id = 1
const resourceMetricsColumns = [
  'id',
  'cpu_percent',
  'memory_percent',
  'memory_mb',
  'disk_percent',
  'uptime_hours',
  'task_queue_depth',
  'db_queries_total',
  'db_errors_total',
  'http_probe_count',
  'http_avg_ms',
  'http_p50_ms',
  'http_p95_ms',
  'http_p99_ms',
  'dns_probe_count',
  'dns_avg_ms',
  'dns_p50_ms',
  'dns_p95_ms',
  'dns_p99_ms',
  'sqlite_io_reads',
  'sqlite_io_writes',
];

const historyColumns = [
  'cpu_percent',
  'memory_percent',
  'memory_mb',
  'disk_percent',
  'uptime_hours',
  'task_queue_depth',
  'db_queries_total',
  'db_errors_total',
  'http_probe_count',
  'http_avg_ms',
  'http_p50_ms',
  'http_p95_ms',
  'http_p99_ms',
  'dns_probe_count',
  'dns_avg_ms',
  'dns_p50_ms',
  'dns_p95_ms',
  'dns_p99_ms',
  'sqlite_io_reads',
  'sqlite_io_writes',
  'recorded_at',
];

function snapshotToMetricParams(snapshot: ResourceSnapshot): unknown[] {
  return [
    1,
    snapshot.cpu_percent,
    snapshot.memory_percent,
    snapshot.memory_mb,
    snapshot.disk_percent,
    snapshot.uptime_hours,
    snapshot.task_queue_depth,
    snapshot.db_queries_total,
    snapshot.db_errors_total,
    snapshot.http_probe_count,
    snapshot.http_avg_ms,
    snapshot.http_p50_ms,
    snapshot.http_p95_ms,
    snapshot.http_p99_ms,
    snapshot.dns_probe_count,
    snapshot.dns_avg_ms,
    snapshot.dns_p50_ms,
    snapshot.dns_p95_ms,
    snapshot.dns_p99_ms,
    snapshot.sqlite_io_reads,
    snapshot.sqlite_io_writes,
  ];
}

function snapshotToHistoryParams(snapshot: ResourceSnapshot): unknown[] {
  return [
    snapshot.cpu_percent,
    snapshot.memory_percent,
    snapshot.memory_mb,
    snapshot.disk_percent,
    snapshot.uptime_hours,
    snapshot.task_queue_depth,
    snapshot.db_queries_total,
    snapshot.db_errors_total,
    snapshot.http_probe_count,
    snapshot.http_avg_ms,
    snapshot.http_p50_ms,
    snapshot.http_p95_ms,
    snapshot.http_p99_ms,
    snapshot.dns_probe_count,
    snapshot.dns_avg_ms,
    snapshot.dns_p50_ms,
    snapshot.dns_p95_ms,
    snapshot.dns_p99_ms,
    snapshot.sqlite_io_reads,
    snapshot.sqlite_io_writes,
    formatDateForDB(new Date(snapshot.recorded_at)),
  ];
}

function buildPlaceholders(count: number): string {
  const dbType = getDbType();
  return dbType === 'postgresql'
    ? Array.from({ length: count }, (_, i) => `$${i + 1}`).join(', ')
    : Array.from({ length: count }, () => '?').join(', ');
}

/** 更新 resource_metrics 实时快照（upsert 单行，固定 id = 1） */
export async function upsertResourceMetrics(snapshot: ResourceSnapshot): Promise<void> {
  const updateColumns = resourceMetricsColumns.filter(col => col !== 'id');
  const dbType = getDbType();

  let sql: string;
  const params = snapshotToMetricParams(snapshot);

  if (dbType === 'mysql') {
    const cols = resourceMetricsColumns.join(', ');
    const placeholders = buildPlaceholders(resourceMetricsColumns.length);
    const updates = updateColumns.map(col => `${col} = VALUES(${col})`).join(', ');
    sql = `INSERT INTO resource_metrics (${cols}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}, updated_at = NOW()`;
  } else if (dbType === 'postgresql') {
    const cols = resourceMetricsColumns.join(', ');
    const placeholders = buildPlaceholders(resourceMetricsColumns.length);
    const updates = updateColumns.map(col => `${col} = EXCLUDED.${col}`).join(', ');
    sql = `INSERT INTO resource_metrics (${cols}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}, updated_at = NOW()`;
  } else {
    const cols = resourceMetricsColumns.join(', ');
    const placeholders = buildPlaceholders(resourceMetricsColumns.length);
    const updates = updateColumns.map(col => `${col} = excluded.${col}`).join(', ');
    sql = `INSERT INTO resource_metrics (${cols}) VALUES (${placeholders}) ON CONFLICT(id) DO UPDATE SET ${updates}, updated_at = CURRENT_TIMESTAMP`;
  }

  await execute(sql, params);
}

/** 写入 resource_metric_history 时序摘要 */
export async function insertResourceHistory(snapshot: ResourceSnapshot): Promise<void> {
  const cols = historyColumns.join(', ');
  const placeholders = buildPlaceholders(historyColumns.length);
  const params = snapshotToHistoryParams(snapshot);
  await execute(`INSERT INTO resource_metric_history (${cols}) VALUES (${placeholders})`, params);
}

export interface ResourceHistoryPage {
  total: number;
  list: ResourceSnapshot[];
}

/** 分页查询 resource_metric_history */
export async function getResourceHistory(
  page: number,
  pageSize: number,
  hours: number
): Promise<ResourceHistoryPage> {
  const cutoff = formatDateForDB(new Date(Date.now() - hours * 60 * 60 * 1000));
  const offset = (page - 1) * pageSize;

  const dbType = getDbType();
  const limitOffset = dbType === 'postgresql'
    ? `LIMIT ${pageSize} OFFSET ${offset}`
    : `LIMIT ${pageSize} OFFSET ${offset}`;

  const [rows, countResult] = await Promise.all([
    query<ResourceSnapshot>(
      `SELECT * FROM resource_metric_history WHERE recorded_at >= ? ORDER BY recorded_at DESC ${limitOffset}`,
      [cutoff]
    ),
    get<{ total: number }>(
      'SELECT COUNT(*) as total FROM resource_metric_history WHERE recorded_at >= ?',
      [cutoff]
    ),
  ]);

  return {
    total: countResult ? Number(countResult.total) : 0,
    list: rows,
  };
}

/** 删除超期历史数据 */
export async function pruneResourceHistory(olderThanHours = 72): Promise<number> {
  const cutoff = formatDateForDB(new Date(Date.now() - olderThanHours * 60 * 60 * 1000));
  const result = await run(
    'DELETE FROM resource_metric_history WHERE recorded_at < ?',
    [cutoff]
  );
  return result.changes;
}
