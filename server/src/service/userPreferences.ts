import { UserPreferencesOperations, getDbType } from '../db/business-adapter';

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
  const result = await UserPreferencesOperations.get(userId);

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
  const notificationsEnabled = updated.notificationsEnabled ? 1 : 0;
  const emailNotifications = updated.emailNotifications ? 1 : 0;
  const backgroundImage = updated.backgroundImage || null;

  if (dbType === 'sqlite') {
    await UserPreferencesOperations.upsertSQLite(
      userId,
      updated.theme,
      updated.language,
      notificationsEnabled,
      emailNotifications,
      backgroundImage
    );
  } else if (dbType === 'mysql') {
    await UserPreferencesOperations.upsertMySQL(
      userId,
      updated.theme,
      updated.language,
      notificationsEnabled,
      emailNotifications,
      backgroundImage
    );
  } else {
    await UserPreferencesOperations.upsertPostgreSQL(
      userId,
      updated.theme,
      updated.language,
      notificationsEnabled,
      emailNotifications,
      backgroundImage
    );
  }
}
