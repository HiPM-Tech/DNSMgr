import { getAdapter } from '../db/adapter';

export interface WebAuthnCredential {
  id: string;
  user_id: number;
  public_key: string;
  counter: number;
  device_type: string;
  backed_up: boolean;
  transports: string[];
  name: string;
  created_at: Date;
  last_used_at: Date;
}

export async function getUserWebAuthnCredentials(userId: number): Promise<WebAuthnCredential[]> {
  const db = getAdapter();
  if (!db) return [];
  const rows = await db.query('SELECT * FROM webauthn_credentials WHERE user_id = ?', [userId]) as any[];
  return rows.map(r => ({
    id: r.id,
    user_id: r.user_id,
    public_key: r.public_key,
    counter: r.counter,
    device_type: r.device_type,
    backed_up: Boolean(r.backed_up),
    transports: typeof r.transports === 'string' ? JSON.parse(r.transports) : r.transports,
    name: r.name,
    created_at: new Date(r.created_at),
    last_used_at: new Date(r.last_used_at),
  }));
}

export async function addWebAuthnCredential(cred: Omit<WebAuthnCredential, 'created_at' | 'last_used_at'>) {
  const db = getAdapter();
  if (!db) return;
  await db.query(
    'INSERT INTO webauthn_credentials (id, user_id, public_key, counter, device_type, backed_up, transports, name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [
      cred.id, cred.user_id, cred.public_key, cred.counter, cred.device_type, 
      cred.backed_up ? 1 : 0, JSON.stringify(cred.transports), cred.name
    ]
  );
  // Ensure user has webauthn enabled in user_2fa
  const existing = await db.get('SELECT * FROM user_2fa WHERE user_id = ? AND type = ?', [cred.user_id, 'webauthn']);
  if (!existing) {
    await db.query(
      'INSERT INTO user_2fa (user_id, type, secret, enabled) VALUES (?, ?, ?, ?)',
      [cred.user_id, 'webauthn', 'webauthn', 1]
    );
  } else {
    await db.query(
      'UPDATE user_2fa SET enabled = 1 WHERE user_id = ? AND type = ?',
      [cred.user_id, 'webauthn']
    );
  }
}

export async function updateWebAuthnCredentialCounter(id: string, counter: number) {
  const db = getAdapter();
  if (!db) return;
  await db.execute(
    `UPDATE webauthn_credentials SET counter = ?, last_used_at = ${db.now()} WHERE id = ?`,
    [counter, id]
  );
}

export async function deleteWebAuthnCredential(userId: number, id: string) {
  const db = getAdapter();
  if (!db) return;
  await db.query('DELETE FROM webauthn_credentials WHERE user_id = ? AND id = ?', [userId, id]);
  
  // Disable webauthn if no credentials left
  const remaining = await getUserWebAuthnCredentials(userId);
  if (remaining.length === 0) {
    await db.query('UPDATE user_2fa SET enabled = 0 WHERE user_id = ? AND type = ?', [userId, 'webauthn']);
  }
}
