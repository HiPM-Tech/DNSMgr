import { query, get, execute, insert, run, now } from '../db';
import { checkAuditRules } from './auditRules';
import { log } from '../lib/logger';

export async function logAuditOperation(userId: number, action: string, domain: string, data: unknown): Promise<void> {
  await execute(
    'INSERT INTO operation_logs (user_id, action, domain, data) VALUES (?, ?, ?, ?)',
    [userId, action, domain, JSON.stringify(data ?? {})]
  );
  
  // Async check against audit rules
  checkAuditRules(userId, action, domain, data).catch(err => {
    log.error('Audit', 'Audit rule engine error', { error: err });
  });
}
