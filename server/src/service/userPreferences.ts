import { getAdapter } from '../db/adapter';

/**
 * 用户偏好设置服务
 */

export interface UserPreferences {
  userId: number;
  theme: 'light' | 'dark' | 'auto';
  language: string;
  notificationsEnabled: boolean;
  emailNotifications: boolean;
}

/**
 * 获取用户偏好设置
 */
export async function getUserPreferences(userId: number): Promise<UserPreferences> {
  const db = getAdapter();
  if (!db) throw new Error('Database not available');

  const result = await db.get(
    'SELECT user_id, theme, language, notifications_enabled, email_notifications FROM user_preferences WHERE user_id = ?',
    [userId]
  );

  if (!result) {
    return {
      userId,
      theme: 'auto',
      language: 'zh-CN',
      notificationsEnabled: true,
      emailNotifications: true,
    };
  }

  return {
    userId,
    theme: (result as any).theme || 'auto',
    language: (result as any).language || 'zh-CN',
    notificationsEnabled: !!(result as any).notifications_enabled,
    emailNotifications: !!(result as any).email_notifications,
  };
}

/**
 * 更新用户偏好设置
 */
export async function updateUserPreferences(
  userId: number,
  preferences: Partial<UserPreferences>
): Promise<void> {
  const db = getAdapter();
  if (!db) throw new Error('Database not available');

  const current = await getUserPreferences(userId);
  const updated = { ...current, ...preferences };

  if (db.type === 'sqlite') {
    const stmt = (db as any).prepare(`
      INSERT INTO user_preferences (user_id, theme, language, notifications_enabled, email_notifications, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        theme = excluded.theme,
        language = excluded.language,
        notifications_enabled = excluded.notifications_enabled,
        email_notifications = excluded.email_notifications,
        updated_at = datetime('now')
    `);
    stmt.run(
      userId,
      updated.theme,
      updated.language,
      updated.notificationsEnabled ? 1 : 0,
      updated.emailNotifications ? 1 : 0
    );
  } else {
    const sql = db.type === 'mysql'
      ? `INSERT INTO user_preferences (user_id, theme, language, notifications_enabled, email_notifications)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
         theme = VALUES(theme),
         language = VALUES(language),
         notifications_enabled = VALUES(notifications_enabled),
         email_notifications = VALUES(email_notifications)`
      : `INSERT INTO user_preferences (user_id, theme, language, notifications_enabled, email_notifications)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT(user_id) DO UPDATE SET
         theme = EXCLUDED.theme,
         language = EXCLUDED.language,
         notifications_enabled = EXCLUDED.notifications_enabled,
         email_notifications = EXCLUDED.email_notifications`;

    await db.execute(sql, [
      userId,
      updated.theme,
      updated.language,
      updated.notificationsEnabled,
      updated.emailNotifications,
    ]);
  }
}
