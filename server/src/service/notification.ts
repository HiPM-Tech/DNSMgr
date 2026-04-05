import { getAdapter } from '../db/adapter';
import { sendSmtpEmail } from './smtp';

export interface NotificationChannel {
  id: string;
  type: 'webhook' | 'telegram' | 'dingtalk' | 'email';
  name: string;
  enabled: boolean;
  config: Record<string, any>;
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

export async function sendNotification(title: string, message: string, htmlMessage?: string) {
  const channels = await getNotificationChannels();
  const enabledChannels = channels.filter(c => c.enabled);
  
  for (const channel of enabledChannels) {
    try {
      if (channel.type === 'email') {
        const { to } = channel.config;
        if (to) await sendSmtpEmail(to, title, htmlMessage || message);
      } 
      else if (channel.type === 'webhook') {
        const { url, method = 'POST', headers = {} } = channel.config;
        if (url) {
          await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify({ title, message })
          });
        }
      }
      else if (channel.type === 'telegram') {
        const { botToken, chatId } = channel.config;
        if (botToken && chatId) {
          const text = `*${title}*\n\n${message}`;
          await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' })
          });
        }
      }
      else if (channel.type === 'dingtalk') {
        const { webhook } = channel.config;
        if (webhook) {
          await fetch(webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              msgtype: 'markdown',
              markdown: { title, text: `### ${title}\n\n${message}` }
            })
          });
        }
      }
    } catch (e) {
      console.error(`Failed to send notification via ${channel.name} (${channel.type}):`, e);
    }
  }
}
