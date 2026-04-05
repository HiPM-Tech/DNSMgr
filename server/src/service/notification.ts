import { getAdapter } from '../db/adapter';
import { sendSmtpEmail } from './smtp';

export interface NotificationChannel {
  id: string;
  type: 'webhook' | 'telegram' | 'dingtalk' | 'email';
  name: string;
  enabled: boolean;
  config: Record<string, any>;
}

// 重试配置
const RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000, // 初始延迟1秒
  maxDelay: 10000, // 最大延迟10秒
};

// 延迟函数
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 带重试的执行函数
async function withRetry<T>(
  fn: () => Promise<T>,
  channelName: string,
  maxRetries: number = RETRY_CONFIG.maxRetries
): Promise<T | null> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      if (attempt > 1) {
        console.log(`[Notification] Success for ${channelName} on attempt ${attempt}`);
      }
      return result;
    } catch (error) {
      lastError = error as Error;
      console.warn(`[Notification] Attempt ${attempt}/${maxRetries} failed for ${channelName}:`, (error as Error).message);
      
      if (attempt < maxRetries) {
        // 指数退避策略
        const retryDelay = Math.min(
          RETRY_CONFIG.retryDelay * Math.pow(2, attempt - 1),
          RETRY_CONFIG.maxDelay
        );
        console.log(`[Notification] Retrying ${channelName} in ${retryDelay}ms...`);
        await delay(retryDelay);
      }
    }
  }
  
  console.error(`[Notification] All ${maxRetries} attempts failed for ${channelName}:`, lastError);
  return null;
}

export async function getNotificationChannels(): Promise<NotificationChannel[]> {
  const db = getAdapter();
  if (!db) return [];
  const row = await db.get('SELECT value FROM system_settings WHERE key = ?', ['notification_channels']) as any;
  if (!row?.value) return [];
  try {
    return JSON.parse(row.value);
  } catch {
    return [];
  }
}

// 发送邮件通知（带重试）
async function sendEmailWithRetry(
  channel: NotificationChannel,
  title: string,
  message: string,
  htmlMessage?: string
): Promise<boolean> {
  const { to } = channel.config;
  if (!to) return false;
  
  const result = await withRetry(
    () => sendSmtpEmail(to, title, htmlMessage || message),
    channel.name
  );
  return result !== null;
}

// 发送Webhook通知（带重试）
async function sendWebhookWithRetry(
  channel: NotificationChannel,
  title: string,
  message: string
): Promise<boolean> {
  const { url, method = 'POST', headers = {} } = channel.config;
  if (!url) return false;
  
  const result = await withRetry(
    () => fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ title, message })
    }).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return res;
    }),
    channel.name
  );
  return result !== null;
}

// 发送Telegram通知（带重试）
async function sendTelegramWithRetry(
  channel: NotificationChannel,
  title: string,
  message: string
): Promise<boolean> {
  const { botToken, chatId } = channel.config;
  if (!botToken || !chatId) return false;
  
  const text = `*${title}*\n\n${message}`;
  const result = await withRetry(
    () => fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    }).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return res.json();
    }).then(data => {
      if (!data.ok) throw new Error(`Telegram API error: ${data.description}`);
      return data;
    }),
    channel.name
  );
  return result !== null;
}

// 发送钉钉通知（带重试）
async function sendDingtalkWithRetry(
  channel: NotificationChannel,
  title: string,
  message: string
): Promise<boolean> {
  const { webhook } = channel.config;
  if (!webhook) return false;
  
  const result = await withRetry(
    () => fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: { title, text: `### ${title}\n\n${message}` }
      })
    }).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return res.json();
    }).then(data => {
      if (data.errcode !== 0) throw new Error(`DingTalk API error: ${data.errmsg}`);
      return data;
    }),
    channel.name
  );
  return result !== null;
}

export async function sendNotification(title: string, message: string, htmlMessage?: string) {
  const channels = await getNotificationChannels();
  const enabledChannels = channels.filter(c => c.enabled);
  
  if (enabledChannels.length === 0) {
    console.log('[Notification] No enabled channels found');
    return;
  }
  
  const results: { channel: string; success: boolean }[] = [];
  
  for (const channel of enabledChannels) {
    try {
      let success = false;
      
      switch (channel.type) {
        case 'email':
          success = await sendEmailWithRetry(channel, title, message, htmlMessage);
          break;
        case 'webhook':
          success = await sendWebhookWithRetry(channel, title, message);
          break;
        case 'telegram':
          success = await sendTelegramWithRetry(channel, title, message);
          break;
        case 'dingtalk':
          success = await sendDingtalkWithRetry(channel, title, message);
          break;
        default:
          console.warn(`[Notification] Unknown channel type: ${channel.type}`);
      }
      
      results.push({ channel: channel.name, success });
    } catch (e) {
      console.error(`[Notification] Unexpected error for ${channel.name} (${channel.type}):`, e);
      results.push({ channel: channel.name, success: false });
    }
  }
  
  // 汇总通知结果
  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;
  
  if (failCount > 0) {
    console.warn(`[Notification] Summary: ${successCount} succeeded, ${failCount} failed`);
    results.filter(r => !r.success).forEach(r => {
      console.warn(`[Notification] Failed: ${r.channel}`);
    });
  } else {
    console.log(`[Notification] All ${successCount} channels succeeded`);
  }
}
