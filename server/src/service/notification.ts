import { SettingsOperations } from '../db/business-adapter';
import { sendSmtpEmail } from './smtp';
import { log } from '../lib/logger';
import { fetchWithFallback } from '../lib/proxy-http';

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
        log.info('Notification', `Success for ${channelName} on attempt ${attempt}`);
      }
      return result;
    } catch (error) {
      lastError = error as Error;
      log.warn('Notification', `Attempt ${attempt}/${maxRetries} failed for ${channelName}`, { error: (error as Error).message });
      
      if (attempt < maxRetries) {
        // 指数退避策略
        const retryDelay = Math.min(
          RETRY_CONFIG.retryDelay * Math.pow(2, attempt - 1),
          RETRY_CONFIG.maxDelay
        );
        log.info('Notification', `Retrying ${channelName} in ${retryDelay}ms...`);
        await delay(retryDelay);
      }
    }
  }
  
  log.error('Notification', `All ${maxRetries} attempts failed for ${channelName}`, { error: lastError });
  return null;
}

export async function getNotificationChannels(): Promise<NotificationChannel[]> {
  // 使用业务适配器获取设置
  const value = await SettingsOperations.get('notification_channels');
  if (!value) return [];
  try {
    return JSON.parse(value);
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

/**
 * 发送邮件到指定用户邮箱
 * 用于NS监测等用户级通知
 * @param email 目标邮箱地址
 * @param title 邮件标题
 * @param message 邮件内容（纯文本）
 * @param htmlMessage 邮件内容（HTML）
 * @returns 是否发送成功
 */
export async function sendEmailToUser(
  email: string,
  title: string,
  message: string,
  htmlMessage?: string
): Promise<boolean> {
  if (!email) {
    log.warn('Notification', 'Cannot send email: email address is empty');
    return false;
  }

  try {
    const result = await withRetry(
      () => sendSmtpEmail(email, title, htmlMessage || message),
      `UserEmail:${email}`
    );
    return result !== null;
  } catch (error) {
    log.warn('Notification', 'Failed to send email to user', { email, error });
    return false;
  }
}

// 发送Webhook通知（带重试和代理回退）
async function sendWebhookWithRetry(
  channel: NotificationChannel,
  title: string,
  message: string
): Promise<boolean> {
  const { url, method = 'POST', headers = {}, useProxy } = channel.config;
  if (!url) return false;
  
  const result = await withRetry(
    () => fetchWithFallback(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ title, message })
    }, !!useProxy, `Webhook:${channel.name}`).then(res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      return res;
    }),
    channel.name
  );
  return result !== null;
}

// 发送Telegram通知（带重试和代理回退）
async function sendTelegramWithRetry(
  channel: NotificationChannel,
  title: string,
  message: string
): Promise<boolean> {
  const { botToken, chatId, useProxy } = channel.config;
  if (!botToken || !chatId) return false;
  
  const text = `*${title}*\n\n${message}`;
  const result = await withRetry(
    () => fetchWithFallback(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
    }, !!useProxy, `Telegram:${channel.name}`).then(res => {
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

// 发送钉钉通知（带重试和代理回退）
async function sendDingtalkWithRetry(
  channel: NotificationChannel,
  title: string,
  message: string
): Promise<boolean> {
  const { webhook, useProxy } = channel.config;
  if (!webhook) return false;
  
  const result = await withRetry(
    () => fetchWithFallback(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msgtype: 'markdown',
        markdown: { title, text: `### ${title}\n\n${message}` }
      })
    }, !!useProxy, `DingTalk:${channel.name}`).then(res => {
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
    log.info('Notification', 'No enabled channels found');
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
          log.warn('Notification', `Unknown channel type: ${channel.type}`);
      }
      
      results.push({ channel: channel.name, success });
    } catch (e) {
      log.error('Notification', `Unexpected error for ${channel.name} (${channel.type})`, { error: e });
      results.push({ channel: channel.name, success: false });
    }
  }
  
  // 汇总通知结果
  const successCount = results.filter(r => r.success).length;
  const failCount = results.length - successCount;
  
  if (failCount > 0) {
    log.warn('Notification', `Summary: ${successCount} succeeded, ${failCount} failed`);
    results.filter(r => !r.success).forEach(r => {
      log.warn('Notification', `Failed: ${r.channel}`);
    });
  } else {
    log.info('Notification', `All ${successCount} channels succeeded`);
  }
}
