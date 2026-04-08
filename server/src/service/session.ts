import { query, get, execute, insert, run, now, getDbType } from '../db';

/**
 * 用户会话管理服务
 */

export interface Session {
  id: string;
  userId: number;
  token: string;
  ipAddress: string;
  userAgent: string;
  createdAt: string;
  lastActivityAt: string;
  expiresAt: string;
}

/**
 * 创建会话记录
 */
export async function createSession(
  userId: number,
  token: string,
  ipAddress: string,
  userAgent: string,
  expiresAt: string
): Promise<string> {
  const sessionId = generateSessionId();
  const dbType = getDbType();

  if (dbType === 'sqlite') {
    const stmt = (global as any).db?.prepare?.(`
      INSERT INTO user_sessions (id, user_id, token, ip_address, user_agent, created_at, last_activity_at, expires_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'), ?)
    `);
    if (stmt) {
      stmt.run(sessionId, userId, token, ipAddress, userAgent, expiresAt);
      return sessionId;
    }
  }
  
  const sql = dbType === 'mysql'
    ? `INSERT INTO user_sessions (id, user_id, token, ip_address, user_agent, created_at, last_activity_at, expires_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW(), ?)`
    : `INSERT INTO user_sessions (id, user_id, token, ip_address, user_agent, created_at, last_activity_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6)`;
  
  await execute(sql, [sessionId, userId, token, ipAddress, userAgent, expiresAt]);

  return sessionId;
}

/**
 * 获取用户的所有活跃会话
 */
export async function getActiveSessions(userId: number): Promise<Session[]> {
  const nowTime = new Date().toISOString();
  const dbType = getDbType();
  const sql = dbType === 'postgresql'
    ? `SELECT id, user_id, token, ip_address, user_agent, created_at, last_activity_at, expires_at
       FROM user_sessions
       WHERE user_id = $1 AND expires_at > $2
       ORDER BY last_activity_at DESC`
    : `SELECT id, user_id, token, ip_address, user_agent, created_at, last_activity_at, expires_at
       FROM user_sessions
       WHERE user_id = ? AND expires_at > ?
       ORDER BY last_activity_at DESC`;

  const sessions = await query(sql, [userId, nowTime]);
  return sessions as unknown as Session[];
}

/**
 * 更新会话最后活动时间
 */
export async function updateSessionActivity(sessionId: string): Promise<void> {
  const dbType = getDbType();
  const sql = dbType === 'postgresql'
    ? `UPDATE user_sessions SET last_activity_at = NOW() WHERE id = $1`
    : `UPDATE user_sessions SET last_activity_at = ${dbType === 'sqlite' ? "datetime('now')" : 'NOW()'} WHERE id = ?`;

  await execute(sql, [sessionId]);
}

/**
 * 删除会话（登出）
 */
export async function deleteSession(sessionId: string): Promise<void> {
  await execute('DELETE FROM user_sessions WHERE id = ?', [sessionId]);
}

/**
 * 删除用户的所有其他会话（远程登出）
 */
export async function deleteOtherSessions(userId: number, currentSessionId: string): Promise<void> {
  await execute(
    'DELETE FROM user_sessions WHERE user_id = ? AND id != ?',
    [userId, currentSessionId]
  );
}

/**
 * 删除用户的所有会话
 */
export async function deleteAllSessions(userId: number): Promise<void> {
  await execute('DELETE FROM user_sessions WHERE user_id = ?', [userId]);
}

/**
 * 清理过期会话
 */
export async function cleanupExpiredSessions(): Promise<number> {
  const nowTime = new Date().toISOString();
  const dbType = getDbType();
  const sql = dbType === 'postgresql'
    ? `DELETE FROM user_sessions WHERE expires_at < $1`
    : `DELETE FROM user_sessions WHERE expires_at < ?`;

  await execute(sql, [nowTime]);

  // 返回删除的行数（如果支持）
  return 0;
}

/**
 * 生成会话 ID
 */
function generateSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 获取会话信息（通过 token）
 */
export async function getSessionByToken(token: string): Promise<Session | null> {
  const nowTime = new Date().toISOString();
  const dbType = getDbType();
  const sql = dbType === 'postgresql'
    ? `SELECT id, user_id, token, ip_address, user_agent, created_at, last_activity_at, expires_at
       FROM user_sessions
       WHERE token = $1 AND expires_at > $2
       LIMIT 1`
    : `SELECT id, user_id, token, ip_address, user_agent, created_at, last_activity_at, expires_at
       FROM user_sessions
       WHERE token = ? AND expires_at > ?
       LIMIT 1`;

  const session = await get(sql, [token, nowTime]);
  return (session as unknown as Session) || null;
}
