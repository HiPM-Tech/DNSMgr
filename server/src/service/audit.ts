import { getAdapter } from '../db/adapter';
import { checkAuditRules } from './auditRules';

export async function logAuditOperation(userId: number, action: string, domain: string, data: unknown): Promise<void> {
  const db = getAdapter();
  if (!db) return;
  await db.execute(
    'INSERT INTO operation_logs (user_id, action, domain, data) VALUES (?, ?, ?, ?)',
    [userId, action, domain, JSON.stringify(data ?? {})]
  );
  
  // Async check against audit rules
  checkAuditRules(userId, action, domain, data).catch(err => {
    console.error('Audit rule engine error:', err);
  });
}

