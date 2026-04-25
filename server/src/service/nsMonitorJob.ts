/**
 * NS Monitor Job Service
 * NS 监测定时任务服务 - 新架构（用户级）
 */

import { NSMonitorOperations, DomainOperations, AuditOperations, UserOperations, formatDateForDB } from '../db/business-adapter';
import { resolveNsRecords, getNsStatus } from '../lib/dns/ns-lookup';
import { sendNotification, sendEmailToUser } from './notification';
import { log } from '../lib/logger';

let monitorInterval: NodeJS.Timeout | null = null;

// 告警抑制配置：同一问题在30分钟内只发送一次通知
const ALERT_SUPPRESS_MINUTES = 30;

/**
 * 检查是否需要抑制告警（避免重复发送）
 * @returns true 表示需要抑制（不发送），false 表示可以发送
 */
async function shouldSuppressAlert(monitorId: number, alertType: string, lastAlertAt: string | null): Promise<boolean> {
  try {
    if (!lastAlertAt) {
      return false; // 没有历史告警，不需要抑制
    }

    const lastAlertTime = new Date(lastAlertAt).getTime();
    const now = Date.now();
    const suppressTimeMs = ALERT_SUPPRESS_MINUTES * 60 * 1000;

    // 如果在抑制时间内，则抑制告警
    if (now - lastAlertTime < suppressTimeMs) {
      log.info('NSMonitorJob', 'Alert suppressed (recent alert exists)', {
        monitorId,
        alertType,
        lastAlertAt,
        suppressMinutes: ALERT_SUPPRESS_MINUTES,
      });
      return true;
    }

    return false;
  } catch (error) {
    log.error('NSMonitorJob', 'Failed to check alert suppression', { monitorId, alertType, error });
    return false; // 出错时不抑制，确保告警能被发送
  }
}

/**
 * 记录NS告警到审计日志
 */
async function logNsAlertToAudit(
  monitor: {
    id: number;
    domain_id: number;
    domain_name: string;
    user_id?: number;
  },
  status: 'mismatch' | 'missing',
  currentNs: string[],
  expectedNs: string[]
): Promise<void> {
  try {
    const alertTypeText = status === 'mismatch' ? 'NS记录不匹配' : 'NS记录缺失';
    const details = JSON.stringify({
      domain: monitor.domain_name,
      alertType: status,
      currentNs: currentNs.join(', ') || '无',
      expectedNs: expectedNs.join(', ') || '未配置',
      monitorId: monitor.id,
    });

    // 使用系统用户ID (0) 或者配置的创建者ID
    const userId = monitor.user_id || 0;

    await AuditOperations.log({
      user_id: userId,
      action: `ns_monitor_alert_${status}`,
      target_type: 'domain',
      target_id: monitor.domain_id.toString(),
      details: `${alertTypeText}: ${monitor.domain_name} - ${details}`,
    });

    log.info('NSMonitorJob', 'NS alert logged to audit', {
      domain: monitor.domain_name,
      status,
      userId,
    });
  } catch (error) {
    log.error('NSMonitorJob', 'Failed to log NS alert to audit', { error });
  }
}

/**
 * 检查单个域名的 NS 记录
 */
async function checkDomainNs(monitor: {
  id: number;
  domain_id: number;
  domain_name: string;
  expected_ns: string;
  user_id: number;
  status: string;
  alert_count: number;
  last_alert_at: string | null;
}): Promise<void> {
  try {
    log.info('NSMonitorJob', 'Checking NS records', { domain: monitor.domain_name, monitorId: monitor.id });

    // 查询当前 NS 记录
    const currentNs = await resolveNsRecords(monitor.domain_name);
    const currentNsStr = currentNs.join(', ');

    // 解析预期的 NS 记录
    const expectedNs = (monitor.expected_ns as string) || '';
    const expectedList = expectedNs.split(',').map(s => s.trim()).filter(Boolean);

    // 确定状态
    const status = getNsStatus(currentNs, expectedList);

    // 获取当前时间（数据库兼容格式）
    const now = new Date();
    const nowStr = formatDateForDB(now);

    // 更新状态
    await NSMonitorOperations.updateStatus(monitor.id, {
      current_ns: currentNsStr,
      status,
      last_check_at: nowStr,
    });

    // 如果状态异常且与上次不同，发送告警
    if (status !== 'ok' && monitor.status !== status) {
      log.warn('NSMonitorJob', 'NS record anomaly detected', {
        domain: monitor.domain_name,
        status,
        current: currentNs,
        expected: expectedList,
      });

      // 记录告警到审计日志
      await logNsAlertToAudit(monitor, status, currentNs, expectedList);

      // 检查是否需要抑制告警
      const isSuppressed = await shouldSuppressAlert(monitor.id, status, monitor.last_alert_at);

      // 更新告警计数和时间
      const alertCount = monitor.alert_count || 0;
      await NSMonitorOperations.updateStatus(monitor.id, {
        alert_count: alertCount + 1,
        last_alert_at: nowStr,
      });

      // 发送通知（如果被抑制则不发送）
      if (!isSuppressed) {
        await sendNsAlert(monitor, status, currentNs, expectedList);
      }
    }

    log.info('NSMonitorJob', 'NS check completed', {
      domain: monitor.domain_name,
      status,
      currentNs: currentNsStr,
    });
  } catch (error) {
    log.error('NSMonitorJob', 'Failed to check NS records', {
      domain: monitor.domain_name,
      error,
    });
  }
}

/**
 * 发送 NS 告警通知
 * 使用用户的通知偏好设置，邮件发送至用户自己的邮箱
 */
async function sendNsAlert(
  monitor: {
    id: number;
    domain_name: string;
    user_id: number;
  },
  status: 'mismatch' | 'missing',
  currentNs: string[],
  expectedNs: string[]
): Promise<void> {
  const alertTypeText = status === 'mismatch' ? 'NS 记录不匹配' : 'NS 记录缺失';
  const title = `【DNSMgr 告警】${monitor.domain_name} ${alertTypeText}`;

  const message = `域名: ${monitor.domain_name}\n` +
    `告警类型: ${alertTypeText}\n` +
    `当前 NS: ${currentNs.join(', ') || '无'}\n` +
    `预期 NS: ${expectedNs.join(', ') || '未配置'}\n` +
    `时间: ${new Date().toLocaleString('zh-CN')}`;

  try {
    // 获取用户的通知偏好设置
    const userId = monitor.user_id;
    let shouldSendEmail = false;
    let shouldSendChannels = false;

    if (userId) {
      const userPrefs = await NSMonitorOperations.getUserPrefs(userId);
      if (userPrefs) {
        shouldSendEmail = userPrefs.notify_email === 1 || userPrefs.notify_email === true;
        shouldSendChannels = userPrefs.notify_channels === 1 || userPrefs.notify_channels === true;
      } else {
        // 默认启用通知
        shouldSendEmail = true;
        shouldSendChannels = true;
      }
    } else {
      // 没有创建者信息，默认启用
      shouldSendEmail = true;
      shouldSendChannels = true;
    }

    // 生成 HTML 格式的消息
    const htmlMessage = `<h3>${title}</h3>
<p><strong>域名:</strong> ${monitor.domain_name}</p>
<p><strong>告警类型:</strong> ${alertTypeText}</p>
<p><strong>当前 NS:</strong> ${currentNs.join(', ') || '无'}</p>
<p><strong>预期 NS:</strong> ${expectedNs.join(', ') || '未配置'}</p>
<p><strong>时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>`;

    // 发送邮件通知到用户自己的邮箱（如果启用）
    if (shouldSendEmail && userId) {
      try {
        const user = await UserOperations.getPublicById(userId);
        if (user && user.email) {
          const emailSent = await sendEmailToUser(user.email as string, title, message, htmlMessage);
          if (emailSent) {
            log.info('NSMonitorJob', 'Email notification sent to user', {
              domain: monitor.domain_name,
              userId,
              email: user.email,
            });
          } else {
            log.warn('NSMonitorJob', 'Failed to send email notification to user', {
              domain: monitor.domain_name,
              userId,
              email: user.email,
            });
          }
        } else {
          log.warn('NSMonitorJob', 'User has no email configured, skipping email notification', {
            domain: monitor.domain_name,
            userId,
          });
        }
      } catch (emailError) {
        log.warn('NSMonitorJob', 'Error sending email to user', {
          domain: monitor.domain_name,
          userId,
          error: emailError,
        });
      }
    }

    // 发送渠道通知（如果启用）
    if (shouldSendChannels) {
      try {
        await sendNotification(title, message, htmlMessage);
        log.info('NSMonitorJob', 'Channel notification sent', {
          domain: monitor.domain_name,
          status,
          userId,
        });
      } catch (channelError) {
        log.warn('NSMonitorJob', 'Error sending channel notification', {
          domain: monitor.domain_name,
          userId,
          error: channelError,
        });
      }
    }

    if (!shouldSendEmail && !shouldSendChannels) {
      log.info('NSMonitorJob', 'Notification skipped (disabled in user preferences)', {
        domain: monitor.domain_name,
        userId,
      });
    }
  } catch (error) {
    log.error('NSMonitorJob', 'Failed to send alert notification', {
      domain: monitor.domain_name,
      error,
    });
  }
}

/**
 * 执行 NS 监测任务
 */
async function runNsMonitorJob(): Promise<void> {
  try {
    log.info('NSMonitorJob', 'Starting NS monitor job');

    // 获取所有启用的监测配置
    const monitors = await NSMonitorOperations.getAllEnabled() as unknown as Array<{
      id: number;
      domain_id: number;
      domain_name: string;
      expected_ns: string;
      user_id: number;
      status: string;
      alert_count: number;
      last_alert_at: string | null;
    }>;

    if (monitors.length === 0) {
      log.info('NSMonitorJob', 'No enabled NS monitor configurations');
      return;
    }

    log.info('NSMonitorJob', `Checking ${monitors.length} domains`);

    // 逐个检查
    for (const monitor of monitors) {
      await checkDomainNs(monitor);
    }

    log.info('NSMonitorJob', 'NS monitor job completed');
  } catch (error) {
    log.error('NSMonitorJob', 'NS monitor job failed', { error });
  }
}

/**
 * 启动 NS 监测定时任务
 */
export function startNsMonitorJob(): void {
  if (monitorInterval) {
    log.warn('NSMonitorJob', 'NS monitor job already started');
    return;
  }

  // 每 5 分钟检查一次
  monitorInterval = setInterval(runNsMonitorJob, 5 * 60 * 1000);

  log.info('NSMonitorJob', 'NS monitor job started (interval: 5 minutes)');

  // 立即执行一次
  runNsMonitorJob();
}

/**
 * 停止 NS 监测定时任务
 */
export function stopNsMonitorJob(): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
    log.info('NSMonitorJob', 'NS monitor job stopped');
  }
}

/**
 * 立即执行一次 NS 监测
 */
export async function runNsMonitorOnce(): Promise<void> {
  await runNsMonitorJob();
}
