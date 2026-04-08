import { query, get, execute, insert, run, now, getDbType } from '../db';

/**
 * 审计日志导出服务
 */

export interface AuditLogEntry {
  id: number;
  userId: number;
  username: string;
  nickname: string;
  action: string;
  domain: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface AuditLogFilters {
  domain?: string;
  userId?: number;
  action?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * 获取审计日志（支持筛选）
 */
export async function getAuditLogs(
  page: number = 1,
  pageSize: number = 50,
  filters?: AuditLogFilters
): Promise<{ total: number; logs: AuditLogEntry[] }> {
  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];

  if (filters?.domain) {
    conditions.push('l.domain LIKE ?');
    params.push(`%${filters.domain}%`);
  }
  if (filters?.userId) {
    conditions.push('l.user_id = ?');
    params.push(filters.userId);
  }
  if (filters?.action) {
    conditions.push('l.action = ?');
    params.push(filters.action);
  }
  if (filters?.startDate) {
    conditions.push('l.created_at >= ?');
    params.push(filters.startDate);
  }
  if (filters?.endDate) {
    conditions.push('l.created_at <= ?');
    params.push(filters.endDate);
  }

  const where = conditions.join(' AND ');
  const pageNum = Math.max(1, Math.floor(Number(page) || 1));
  const pageSizeNum = Math.max(1, Math.floor(Number(pageSize) || 50));
  const offset = (pageNum - 1) * pageSizeNum;

  // 获取总数
  const countSql = `SELECT COUNT(*) as cnt FROM operation_logs l WHERE ${where}`;

  const countResult = await get(countSql, params);
  const total = (countResult as { cnt: number })?.cnt || 0;

  // 获取日志
  const dbType = getDbType();
  const listSql = dbType === 'postgresql'
    ? `SELECT l.*, u.username, u.nickname
       FROM operation_logs l
       LEFT JOIN users u ON u.id = l.user_id
       WHERE ${where}
       ORDER BY l.id DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`
    : `SELECT l.*, u.username, u.nickname
       FROM operation_logs l
       LEFT JOIN users u ON u.id = l.user_id
       WHERE ${where}
       ORDER BY l.id DESC
       LIMIT ? OFFSET ?`;

  // MySQL 的 LIMIT/OFFSET 需要直接嵌入数值，不能使用参数化查询
  const finalSql = dbType === 'mysql'
    ? listSql.replace('LIMIT ? OFFSET ?', `LIMIT ${pageSizeNum} OFFSET ${offset}`)
    : listSql;
  const finalParams = dbType === 'mysql' ? params : [...params, pageSizeNum, offset];
  
  const logs = await query(finalSql, finalParams);

  return {
    total,
    logs: logs.map((log: any) => ({
      id: log.id,
      userId: log.user_id,
      username: log.username || 'Unknown',
      nickname: log.nickname || '',
      action: log.action,
      domain: log.domain,
      data: typeof log.data === 'string' ? JSON.parse(log.data || '{}') : log.data || {},
      createdAt: log.created_at,
    })),
  };
}

/**
 * 导出审计日志为 CSV
 */
export async function exportAuditLogsAsCSV(
  filters?: AuditLogFilters
): Promise<string> {
  const { logs } = await getAuditLogs(1, 10000, filters);

  // CSV 头
  const headers = ['ID', 'User', 'Action', 'Domain', 'Data', 'Created At'];
  const rows = logs.map((log) => [
    log.id,
    `${log.nickname || log.username}`,
    log.action,
    log.domain,
    JSON.stringify(log.data),
    log.createdAt,
  ]);

  // 转换为 CSV
  const csv = [
    headers.map(escapeCSV).join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ].join('\n');

  return csv;
}

/**
 * 导出审计日志为 JSON
 */
export async function exportAuditLogsAsJSON(
  filters?: AuditLogFilters
): Promise<string> {
  const { logs, total } = await getAuditLogs(1, 10000, filters);

  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      total,
      filters,
      logs,
    },
    null,
    2
  );
}

/**
 * 检测异常操作
 */
export async function detectAnomalies(userId: number, timeWindowMinutes: number = 60): Promise<string[]> {
  const anomalies: string[] = [];
  const nowTime = new Date();
  const timeWindow = new Date(nowTime.getTime() - timeWindowMinutes * 60 * 1000);
  const dbType = getDbType();

  // 检查：短时间内大量删除记录
  const deleteSql = dbType === 'postgresql'
    ? `SELECT COUNT(*) as cnt FROM operation_logs 
       WHERE user_id = $1 AND action LIKE '%delete%' AND created_at > $2`
    : `SELECT COUNT(*) as cnt FROM operation_logs 
       WHERE user_id = ? AND action LIKE '%delete%' AND created_at > ?`;

  const deleteResult = await get(deleteSql, [userId, timeWindow.toISOString()]);
  const deleteCount = (deleteResult as { cnt: number })?.cnt || 0;

  if (deleteCount > 10) {
    anomalies.push(`Unusual number of delete operations: ${deleteCount} in ${timeWindowMinutes} minutes`);
  }

  // 检查：短时间内大量创建记录
  const createSql = dbType === 'postgresql'
    ? `SELECT COUNT(*) as cnt FROM operation_logs 
       WHERE user_id = $1 AND action LIKE '%create%' AND created_at > $2`
    : `SELECT COUNT(*) as cnt FROM operation_logs 
       WHERE user_id = ? AND action LIKE '%create%' AND created_at > ?`;

  const createResult = await get(createSql, [userId, timeWindow.toISOString()]);
  const createCount = (createResult as { cnt: number })?.cnt || 0;

  if (createCount > 50) {
    anomalies.push(`Unusual number of create operations: ${createCount} in ${timeWindowMinutes} minutes`);
  }

  // 检查：多个不同域名的操作
  const domainSql = dbType === 'postgresql'
    ? `SELECT COUNT(DISTINCT domain) as cnt FROM operation_logs 
       WHERE user_id = $1 AND created_at > $2`
    : `SELECT COUNT(DISTINCT domain) as cnt FROM operation_logs 
       WHERE user_id = ? AND created_at > ?`;

  const domainResult = await get(domainSql, [userId, timeWindow.toISOString()]);
  const domainCount = (domainResult as { cnt: number })?.cnt || 0;

  if (domainCount > 20) {
    anomalies.push(`Unusual number of different domains accessed: ${domainCount} in ${timeWindowMinutes} minutes`);
  }

  return anomalies;
}

/**
 * 获取用户操作统计
 */
export async function getUserActionStats(userId: number, days: number = 7): Promise<Record<string, number>> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const dbType = getDbType();

  const sql = dbType === 'postgresql'
    ? `SELECT action, COUNT(*) as count FROM operation_logs 
       WHERE user_id = $1 AND created_at > $2
       GROUP BY action
       ORDER BY count DESC`
    : `SELECT action, COUNT(*) as count FROM operation_logs 
       WHERE user_id = ? AND created_at > ?
       GROUP BY action
       ORDER BY count DESC`;

  const results = await query(sql, [userId, startDate.toISOString()]);

  const stats: Record<string, number> = {};
  for (const row of results) {
    stats[(row as any).action] = (row as any).count;
  }

  return stats;
}

/**
 * 获取操作时间分布
 */
export async function getActionTimeDistribution(userId: number, days: number = 7): Promise<Record<string, number>> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const dbType = getDbType();

  const sql = dbType === 'postgresql'
    ? `SELECT EXTRACT(HOUR FROM created_at) as hour, COUNT(*) as count FROM operation_logs 
       WHERE user_id = $1 AND created_at > $2
       GROUP BY EXTRACT(HOUR FROM created_at)
       ORDER BY hour`
    : `SELECT STRFTIME('%H', created_at) as hour, COUNT(*) as count FROM operation_logs 
       WHERE user_id = ? AND created_at > ?
       GROUP BY STRFTIME('%H', created_at)
       ORDER BY hour`;

  const results = await query(sql, [userId, startDate.toISOString()]);

  const distribution: Record<string, number> = {};
  for (let i = 0; i < 24; i++) {
    distribution[`${i.toString().padStart(2, '0')}:00`] = 0;
  }

  for (const row of results) {
    const hour = (row as any).hour?.toString().padStart(2, '0') || '00';
    distribution[`${hour}:00`] = (row as any).count;
  }

  return distribution;
}

/**
 * 转义 CSV 字段
 */
function escapeCSV(field: unknown): string {
  const str = String(field || '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
