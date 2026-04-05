import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import crypto from 'crypto';
import { getAdapter } from '../db/adapter';

/**
 * TOTP (Time-based One-Time Password) 2FA 服务
 */

export interface TOTPSetup {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export interface TOTPStatus {
  enabled: boolean;
  backupCodesRemaining: number;
}

/**
 * 生成 TOTP 密钥和二维码
 */
export async function generateTOTPSecret(userId: number, email: string): Promise<TOTPSetup> {
  const secret = authenticator.generateSecret();
  
  // 生成二维码
  const otpauth_url = authenticator.keyuri(email, 'DNSMgr', secret);
  const qrCode = await QRCode.toDataURL(otpauth_url);
  
  // 生成 10 个备用恢复码
  const backupCodes = generateBackupCodes(10);
  
  return {
    secret,
    qrCode,
    backupCodes,
  };
}

/**
 * 验证 TOTP 令牌
 */
export function verifyTOTPToken(secret: string, token: string): boolean {
  try {
    return authenticator.check(token, secret);
  } catch {
    return false;
  }
}

/**
 * 启用 TOTP 2FA
 */
export async function enableTOTP(userId: number, secret: string, backupCodes: string[]): Promise<void> {
  const db = getAdapter();
  if (!db) throw new Error('Database not available');

  // 加密备用码
  const encryptedCodes = backupCodes.map(code => encryptBackupCode(code));

  if (db.type === 'sqlite') {
    const stmt = (db as any).prepare(`
      INSERT INTO user_2fa (user_id, type, secret, backup_codes, enabled, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, type) DO UPDATE SET
        secret = excluded.secret,
        backup_codes = excluded.backup_codes,
        enabled = 1,
        updated_at = datetime('now')
    `);
    stmt.run(userId, 'totp', secret, JSON.stringify(encryptedCodes));
  } else {
    const sql = db.type === 'mysql'
      ? `INSERT INTO user_2fa (user_id, type, secret, backup_codes, enabled, created_at)
         VALUES (?, ?, ?, ?, 1, NOW())
         ON DUPLICATE KEY UPDATE
         secret = VALUES(secret),
         backup_codes = VALUES(backup_codes),
         enabled = 1,
         updated_at = NOW()`
      : `INSERT INTO user_2fa (user_id, type, secret, backup_codes, enabled, created_at)
         VALUES ($1, $2, $3, $4, true, NOW())
         ON CONFLICT(user_id, type) DO UPDATE SET
         secret = EXCLUDED.secret,
         backup_codes = EXCLUDED.backup_codes,
         enabled = true,
         updated_at = NOW()`;
    
    await db.execute(sql, [userId, 'totp', secret, JSON.stringify(encryptedCodes)]);
  }
}

/**
 * 禁用 TOTP 2FA
 */
export async function disableTOTP(userId: number): Promise<void> {
  const db = getAdapter();
  if (!db) throw new Error('Database not available');

  await db.execute(
    'UPDATE user_2fa SET enabled = ? WHERE user_id = ? AND type = ?',
    [db.type === 'sqlite' ? 0 : false, userId, 'totp']
  );
}

/**
 * 获取 TOTP 状态
 */
export async function getTOTPStatus(userId: number): Promise<TOTPStatus> {
  const db = getAdapter();
  if (!db) throw new Error('Database not available');

  const result = await db.get(
    'SELECT enabled, backup_codes FROM user_2fa WHERE user_id = ? AND type = ?',
    [userId, 'totp']
  );

  if (!result) {
    return { enabled: false, backupCodesRemaining: 0 };
  }

  const backupCodes = JSON.parse((result as { backup_codes: string }).backup_codes || '[]');
  return {
    enabled: !!(result as { enabled: number | boolean }).enabled,
    backupCodesRemaining: backupCodes.length,
  };
}

/**
 * 使用备用码验证
 */
export async function verifyBackupCode(userId: number, code: string): Promise<boolean> {
  const db = getAdapter();
  if (!db) throw new Error('Database not available');

  const result = await db.get(
    'SELECT backup_codes FROM user_2fa WHERE user_id = ? AND type = ? AND enabled = ?',
    [userId, 'totp', db.type === 'sqlite' ? 1 : true]
  );

  if (!result) return false;

  const backupCodes = JSON.parse((result as { backup_codes: string }).backup_codes || '[]');
  const encryptedCode = encryptBackupCode(code);

  const index = backupCodes.indexOf(encryptedCode);
  if (index === -1) return false;

  // 移除已使用的备用码
  backupCodes.splice(index, 1);
  await db.execute(
    'UPDATE user_2fa SET backup_codes = ? WHERE user_id = ? AND type = ?',
    [JSON.stringify(backupCodes), userId, 'totp']
  );

  return true;
}

/**
 * 生成备用恢复码
 */
function generateBackupCodes(count: number): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(`${code.slice(0, 4)}-${code.slice(4)}`);
  }
  return codes;
}

/**
 * 加密备用码（简单的 base64 编码，生产环境应使用更强的加密）
 */
function encryptBackupCode(code: string): string {
  return Buffer.from(code).toString('base64');
}

/**
 * 解密备用码
 */
export function decryptBackupCode(encrypted: string): string {
  return Buffer.from(encrypted, 'base64').toString('utf-8');
}
