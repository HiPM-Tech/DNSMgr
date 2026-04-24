/**
 * NS Monitor Job Service
 * NS 监测定时任务服务
 */

import { NSMonitorOperations, DomainOperations, AuditOperations, formatDateForDB } from '../db/business-adapter';
import { resolveNsRecords, getNsStatus } from '../lib/dns/ns-lookup';
import { sendNotification } from './notification';
import { log } from '../lib/logger';

let monitorInterval: NodeJS.Timeout | null = null;

// 告警抑制配置：同一问题在30分钟内只发送一次通知
const ALERT_SUPPRESS_MINUTES = 30;

/**
 * 检查是否需要抑制告警（避免重复发送）
 * @returns true 表示需要抑制（不发送），false 表示可以发送
 */
async function shouldSuppressAlert(configId: number, alertType: string): Promise<boolean> {
  try {
    // 获取最近一次的相同类型告警
    const recentAlerts = await NSMonitorOperations.getRecentAlerts(configId, alertType, 1);
    if (recentAlerts.length === 0) {
      return false; // 没有历史告警，不需要抑制
    }

    const lastAlert = recentAlerts[0];
    const lastAlertTime = new Date(lastAlert.created_at as string).getTime();
    const now = Date.now();
    const suppressTimeMs = ALERT_SUPPRESS_MINUTES * 60 * 1000;

    // 如果在抑制时间内，则抑制告警
    if (now - lastAlertTime < suppressTimeMs) {
      log.info('NSMonitorJob', 'Alert suppressed (recent alert exists)', {
        configId,
        alertType,
        lastAlertTime: lastAlert.created_at,
        suppressMinutes: ALERT_SUPPRESS_MINUTES,
      });
      return true;
    }

    return false;
  } catch (error) {
    log.error('NSMonitorJob', 'Failed to check alert suppression', { configId, alertType, error });
    return false; // 出错时不抑制，确保告警能被发送
  }
}

/**
 * 记录NS告警到审计日志
 */
async function logNsAlertToAudit(
  config: {
    id: number;
    domain_id: number;
    domain_name: string;
    created_by?: number;
  },
  status: 'mismatch' | 'missing',
  currentNs: string[],
  expectedNs: string[]
): Promise<void> {
  try {
    const alertTypeText = status === 'mismatch' ? 'NS记录不匹配' : 'NS记录缺失';
    const details = JSON.stringify({
      domain: config.domain_name,
      alertType: status,
      currentNs: currentNs.join(', ') || '无',
      expectedNs: expectedNs.join(', ') || '未配置',
      configId: config.id,
    });

    // 使用系统用户ID (0) 或者配置的创建者ID
    const userId = config.created_by || 0;

    await AuditOperations.log({
      user_id: userId,
      action: `ns_monitor_alert_${status}`,
      target_type: 'domain',
      target_id: config.domain_id.toString(),
      details: `${alertTypeText}: ${config.domain_name} - ${details}`,
    });

    log.info('NSMonitorJob', 'NS alert logged to audit', {
      domain: config.domain_name,
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
async function checkDomainNs(config: {
  id: number;
  domain_id: number;
  domain_name: string;
  expected_ns: string;
  notify_email: number | boolean;
  notify_channels: number | boolean;
  created_by?: number;
  isAdmin?: boolean;
}): Promise<void> {
  try {
    log.info('NSMonitorJob', 'Checking NS records', { domain: config.domain_name, configId: config.id });

    // 查询当前 NS 记录
    const currentNs = await resolveNsRecords(config.domain_name);
    const currentNsStr = currentNs.join(', ');

    // 解析预期的 NS 记录
    const expectedNs = (config.expected_ns as string) || '';
    const expectedList = expectedNs.split(',').map(s => s.trim()).filter(Boolean);

    // 确定状态
    const status = getNsStatus(currentNs, expectedList);

    // 获取当前时间（数据库兼容格式）
    const now = new Date();
    const nowStr = formatDateForDB(now);

    // 获取当前状态
    const existingStatus = await NSMonitorOperations.getStatus(config.id);

    // 更新状态
    await NSMonitorOperations.updateStatus(config.id, {
      current_ns: currentNsStr,
      status,
      last_check_at: nowStr,
    });

    // 如果状态异常且与上次不同，发送告警
    if (status !== 'ok' && (!existingStatus || existingStatus.status !== status)) {
      log.warn('NSMonitorJob', 'NS record anomaly detected', {
        domain: config.domain_name,
        status,
        current: currentNs,
        expected: expectedList,
      });

      // 记录告警到审计日志
      await logNsAlertToAudit(config, status, currentNs, expectedList);

      // 检查是否需要抑制告警
      const isSuppressed = await shouldSuppressAlert(config.id, status);

      // 记录告警到数据库
      await NSMonitorOperations.createAlert({
        config_id: config.id,
        alert_type: status,
        expected_ns: expectedNs,
        actual_ns: currentNsStr,
        sent_email: 0,
        sent_channels: 0,
      });

      // 更新告警计数
      const alertCount = (existingStatus?.alert_count as number) || 0;
      await NSMonitorOperations.updateStatus(config.id, {
        alert_count: alertCount + 1,
        last_alert_at: nowStr,
      });

      // 发送通知（如果被抑制则不发送）
      if (!isSuppressed) {
        await sendNsAlert(config, status, currentNs, expectedList);
      }
    }

    log.info('NSMonitorJob', 'NS check completed', {
      domain: config.domain_name,
      status,
      currentNs: currentNsStr,
    });
  } catch (error) {
    log.error('NSMonitorJob', 'Failed to check NS records', {
      domain: config.domain_name,
      error,
    });
  }
}

/**
 * 发送 NS 告警通知
 * 仅管理员添加的监测会使用通知渠道
 */
async function sendNsAlert(
  config: {
    id: number;
    domain_name: string;
    notify_email: number | boolean;
    notify_channels: number | boolean;
    created_by?: number;
    isAdmin?: boolean;
  },
  status: 'mismatch' | 'missing',
  currentNs: string[],
  expectedNs: string[]
): Promise<void> {
  const alertTypeText = status === 'mismatch' ? 'NS 记录不匹配' : 'NS 记录缺失';
  const title = `【DNSMgr 告警】${config.domain_name} ${alertTypeText}`;

  const message = `域名: ${config.domain_name}\n` +
    `告警类型: ${alertTypeText}\n` +
    `当前 NS: ${currentNs.join(', ') || '无'}\n` +
    `预期 NS: ${expectedNs.join(', ') || '未配置'}\n` +
    `时间: ${new Date().toLocaleString('zh-CN')}`;

  try {
    // 仅管理员添加的监测使用通知渠道
    const isAdminCreated = config.isAdmin === true;

    // 检查是否需要发送邮件（仅管理员）
    const shouldSendEmail = isAdminCreated && (config.notify_email === 1 || config.notify_email === true);
    // 检查是否需要发送渠道通知（仅管理员）
    const shouldSendChannels = isAdminCreated && (config.notify_channels === 1 || config.notify_channels === true);

    if (!isAdminCreated) {
      log.info('NSMonitorJob', 'Notification skipped (non-admin created config)', {
        domain: config.domain_name,
        createdBy: config.created_by,
      });
      return;
    }

    if (shouldSendEmail || shouldSendChannels) {
      // 生成 HTML 格式的消息
      const htmlMessage = `<h3>${title}</h3>
<p><strong>域名:</strong> ${config.domain_name}</p>
<p><strong>告警类型:</strong> ${alertTypeText}</p>
<p><strong>当前 NS:</strong> ${currentNs.join(', ') || '无'}</p>
<p><strong>预期 NS:</strong> ${expectedNs.join(', ') || '未配置'}</p>
<p><strong>时间:</strong> ${new Date().toLocaleString('zh-CN')}</p>`;

      await sendNotification(title, message, htmlMessage);

      log.info('NSMonitorJob', 'Alert notification sent', {
        domain: config.domain_name,
        status,
        email: shouldSendEmail,
        channels: shouldSendChannels,
        isAdmin: isAdminCreated,
      });
    }
  } catch (error) {
    log.error('NSMonitorJob', 'Failed to send alert notification', {
      domain: config.domain_name,
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
    const configs = await NSMonitorOperations.getAllEnabled() as unknown as Array<{
      id: number;
      domain_id: number;
      domain_name: string;
      expected_ns: string;
      notify_email: number | boolean;
      notify_channels: number | boolean;
      created_by: number;
      creator_role: string;
    }>;

    if (configs.length === 0) {
      log.info('NSMonitorJob', 'No enabled NS monitor configurations');
      return;
    }

    log.info('NSMonitorJob', `Checking ${configs.length} domains`);

    // 逐个检查
    for (const config of configs) {
      // 判断创建者是否为管理员
      const isAdmin = config.creator_role === 'super' || config.creator_role === 'admin';
      await checkDomainNs({
        ...config,
        isAdmin,
      });
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
