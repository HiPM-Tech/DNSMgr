import { query, get, execute, insert, run, now, getDbType } from '../db';

/**
 * 用户偏好设置服务
 */

export interface UserPreferences {
  userId: number;
  theme: 'light' | 'dark' | 'auto';
  language: string;
  notificationsEnabled: boolean;
  emailNotifications: boolean;
  backgroundImage?: string;
}

/**
 * 获取用户偏好设置
 */
export async function getUserPreferences(userId: number): Promise<UserPreferences> {
  const result = await get(
    'SELECT user_id, theme, language, notifications_enabled, email_notifications, background_image FROM user_preferences WHERE user_id = ?',
    [userId]
  );

  if (!result) {
    return {
      userId,
      theme: 'auto',
      language: 'zh-CN',
      notificationsEnabled: true,
      emailNotifications: true,
      backgroundImage: undefined,
    };
  }

  return {
    userId,
    theme: (result as any).theme || 'auto',
    language: (result as any).language || 'zh-CN',
    notificationsEnabled: !!(result as any).notifications_enabled,
    emailNotifications: !!(result as any).email_notifications,
    backgroundImage: (result as any).background_image || undefined,
  };
}

/**
 * 更新用户偏好设置
 */
export async function updateUserPreferences(
  userId: number,
  preferences: Partial<UserPreferences>
): Promise<void> {
  const current = await getUserPreferences(userId);
  const updated = { ...current, ...preferences };

  const dbType = getDbType();
  if (dbType === 'sqlite') {
    const stmt = (global as any).db?.prepare?.(`
      INSERT INTO user_preferences (user_id, theme, language, notifications_enabled, email_notifications, background_image, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(user_id) DO UPDATE SET
        theme = excluded.theme,
        language = excluded.language,
        notifications_enabled = excluded.notifications_enabled,
        email_notifications = excluded.email_notifications,
        background_image = excluded.background_image,
        updated_at = datetime('now')
    `);
    if (stmt) {
      stmt.run(
        userId,
        updated.theme,
        updated.language,
        updated.notificationsEnabled ? 1 : 0,
        updated.emailNotifications ? 1 : 0,
        updated.backgroundImage || null
      );
      return;
    }
  }
  
  const sql = dbType === 'mysql'
    ? `INSERT INTO user_preferences (user_id, theme, language, notifications_enabled, email_notifications, background_image)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
       theme = VALUES(theme),
       language = VALUES(language),
       notifications_enabled = VALUES(notifications_enabled),
       email_notifications = VALUES(email_notifications),
       background_image = VALUES(background_image)`
    : `INSERT INTO user_preferences (user_id, theme, language, notifications_enabled, email_notifications, background_image)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT(user_id) DO UPDATE SET
       theme = EXCLUDED.theme,
       language = EXCLUDED.language,
       notifications_enabled = EXCLUDED.notifications_enabled,
       email_notifications = EXCLUDED.email_notifications,
       background_image = EXCLUDED.background_image`;

  await execute(sql, [
    userId,
    updated.theme,
    updated.language,
    updated.notificationsEnabled,
    updated.emailNotifications,
    updated.backgroundImage || null,
  ]);
}
