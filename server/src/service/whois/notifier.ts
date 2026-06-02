/**
 * WHOIS 过期通知器
 * 
 * 负责检查域名到期时间并发送通知
 */

import { WhoisOperations } from '../../db/bal/business-adapter';
import { Domain } from '../../types';
import { sendNotification } from '../notification';
import { log } from '../../lib/logger';

/**
 * 检查并发送过期通知
 */
export async function checkAndSendNotification(domain: Domain, expiresAt: Date): Promise<void> {
  try {
    const nowTime = new Date();
    const daysLeft = Math.ceil((expiresAt.getTime() - nowTime.getTime()) / (1000 * 60 * 60 * 24));

    // 获取通知设置
    const enableNotifyRow = await WhoisOperations.getNotificationSetting() as any;
    const enableNotify = enableNotifyRow ? enableNotifyRow.value === '1' || enableNotifyRow.value === 'true' : false;

    const thresholdRow = await WhoisOperations.getExpiryDays() as any;
    const threshold = thresholdRow ? parseInt(thresholdRow.value) : 30;

    if (enableNotify && (daysLeft === threshold || daysLeft === 7 || daysLeft === 1)) {
      try {
        await sendNotification(
          `[HiDNS] Domain Expiring Soon: ${domain.name}`,
          `Your domain ${domain.name} is expiring in ${daysLeft} days (on ${expiresAt.toLocaleDateString()}). Please renew it soon.`
        );
        log.info('WhoisNotifier', `Sent expiry notification for ${domain.name} (${daysLeft} days left)`);
      } catch (err) {
        log.error('WhoisNotifier', `Failed to send notification for ${domain.name}`);
      }
    }
  } catch (error) {
    log.error('WhoisNotifier', `Error checking notification for ${domain.name}`);
  }
}
