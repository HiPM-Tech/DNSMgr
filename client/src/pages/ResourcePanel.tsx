import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Col, Row, Tag, Tooltip, Statistic, Progress } from 'tdesign-react';
import {
  ChartBubbleIcon,
  CloudIcon,
} from 'tdesign-icons-react';
import { useI18n } from '../contexts/I18nContext';
import { useWebSocket } from '../hooks/useWebSocket';
import type { ResourceSnapshot } from '../api';

function pctColor(pct: number | null): string {
  if (pct === null) return 'var(--td-text-color-disabled)'
  if (pct < 60) return 'var(--td-success-color)'
  if (pct < 80) return 'var(--td-warning-color)'
  return 'var(--td-error-color)'
}

function formatUptime(hours: number | null): { value: number; suffix: string } {
  if (hours === null || hours <= 0) return { value: 0, suffix: '' }
  const totalSeconds = Math.round(hours * 3600)
  const days = Math.floor(totalSeconds / 86400)
  const remaining = totalSeconds % 86400
  const h = Math.floor(remaining / 3600)
  const m = Math.floor((remaining % 3600) / 60)
  const s = remaining % 60
  if (days > 0) return { value: days, suffix: `d ${h}h ${m}m ${s}s` }
  if (h > 0) return { value: h, suffix: `h ${m}m ${s}s` }
  if (m > 0) return { value: m, suffix: `m ${s}s` }
  return { value: s, suffix: 's' }
}

const defaultSnapshot: ResourceSnapshot = {
  cpu_percent: null,
  memory_percent: null,
  memory_mb: null,
  disk_percent: null,
  uptime_hours: null,
  task_queue_depth: 0,
  db_queries_total: 0,
  db_errors_total: 0,
  http_probe_count: 0,
  http_avg_ms: null,
  http_p50_ms: null,
  http_p95_ms: null,
  http_p99_ms: null,
  dns_probe_count: 0,
  dns_avg_ms: null,
  dns_p50_ms: null,
  dns_p95_ms: null,
  dns_p99_ms: null,
  dns_encrypted_probe_count: 0,
  dns_encrypted_avg_ms: null,
  dns_encrypted_p50_ms: null,
  dns_encrypted_p95_ms: null,
  dns_encrypted_p99_ms: null,
  dns_plain_probe_count: 0,
  dns_plain_avg_ms: null,
  dns_plain_p50_ms: null,
  dns_plain_p95_ms: null,
  dns_plain_p99_ms: null,
  sqlite_io_reads: 0,
  sqlite_io_writes: 0,
  recorded_at: '',
}

export function ResourcePanel() {
  const { t } = useI18n()
  const [snapshot, setSnapshot] = useState<ResourceSnapshot>(defaultSnapshot)
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const onMessage = useCallback((msg: { type: string; data?: ResourceSnapshot }) => {
    if (msg.type === 'resource:snapshot' && msg.data) {
      setSnapshot(msg.data)
    }
  }, [])

  const { isConnected } = useWebSocket({ onMessage })

  // 始终使用轮询获取资源监控数据（WS 不稳定时保底）
  useEffect(() => {
    intervalRef.current = setInterval(async () => {
      try {
        const { resourceMonitorApi } = await import('../api')
        const data = await resourceMonitorApi.current()
        setSnapshot(data)
      } catch { /* ignore */ }
    }, 15000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [])

  const httpColor = `var(--td-success-color)`
  const dnsColor = `var(--td-brand-color)`

  return (
    <Card
      bordered={false}
      shadow={false}
      className="dashboard-panel"
      title={t('resourceMonitor.title')}
      subtitle={
        <Tag theme={isConnected ? 'success' : 'default'} variant="light" size="small">
          {isConnected ? t('resourceMonitor.live') : t('resourceMonitor.polling')}
        </Tag>
      }
    >
      <div className="resource-panel">
        <div className="resource-panel__meters">
          <Row gutter={[8, 8]}>
            {/* System stats */}
            <Col xs={12} sm={6} md={4} lg={3} xl={2}>
              <Statistic
                title={t('resourceMonitor.cpu')}
                value={snapshot.cpu_percent != null ? snapshot.cpu_percent : 0}
                suffix="%"
                loading={snapshot.cpu_percent == null}
                color={pctColor(snapshot.cpu_percent)}
              />
            </Col>
            <Col xs={12} sm={6} md={4} lg={3} xl={2}>
              <Statistic
                title={t('resourceMonitor.memory')}
                value={snapshot.memory_mb != null ? snapshot.memory_mb : 0}
                suffix="MB"
                loading={snapshot.memory_mb == null}
                color={pctColor(snapshot.memory_percent)}
              />
            </Col>
            <Col xs={12} sm={6} md={4} lg={3} xl={2}>
              <Statistic
                title={t('resourceMonitor.uptime')}
                value={snapshot.uptime_hours != null ? formatUptime(snapshot.uptime_hours).value : 0}
                suffix={snapshot.uptime_hours != null ? formatUptime(snapshot.uptime_hours).suffix : ''}
                loading={snapshot.uptime_hours == null}
              />
            </Col>
            <Col xs={12} sm={6} md={4} lg={3} xl={2}>
              <Statistic
                title={t('resourceMonitor.probeHttp')}
                value={snapshot.http_probe_count}
                suffix={snapshot.http_avg_ms != null ? `${snapshot.http_avg_ms.toFixed(0)}ms` : ''}
                color={httpColor}
              />
            </Col>
            <Col xs={12} sm={6} md={4} lg={3} xl={2}>
              <Statistic
                title={t('resourceMonitor.probeDns')}
                value={snapshot.dns_probe_count}
                suffix={snapshot.dns_avg_ms != null ? `${snapshot.dns_avg_ms.toFixed(0)}ms` : ''}
                color={dnsColor}
              />
            </Col>
            <Col xs={12} sm={6} md={4} lg={3} xl={2}>
              <Statistic
                title={t('resourceMonitor.probeDnsEncrypted')}
                value={snapshot.dns_encrypted_probe_count}
                suffix={snapshot.dns_encrypted_avg_ms != null ? `${snapshot.dns_encrypted_avg_ms.toFixed(0)}ms` : ''}
                color={dnsColor}
              />
            </Col>
            <Col xs={12} sm={6} md={4} lg={3} xl={2}>
              <Statistic
                title={t('resourceMonitor.probeDnsPlain')}
                value={snapshot.dns_plain_probe_count}
                suffix={snapshot.dns_plain_avg_ms != null ? `${snapshot.dns_plain_avg_ms.toFixed(0)}ms` : ''}
                color={dnsColor}
              />
            </Col>
            <Col xs={12} sm={6} md={4} lg={3} xl={2}>
              <Statistic
                title={t('resourceMonitor.dbQueries')}
                value={snapshot.db_queries_total}
              />
            </Col>
            <Col xs={12} sm={6} md={4} lg={3} xl={2}>
              <Statistic
                title={t('resourceMonitor.queueDepth')}
                value={snapshot.task_queue_depth}
                suffix="tasks"
              />
            </Col>
          </Row>

          {/* Probe latency bars */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--td-text-color-placeholder)', marginBottom: 8 }}>
              {t('resourceMonitor.latencyTitle')}
            </div>
            <Row gutter={[16, 8]}>
              <Col xs={6}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ChartBubbleIcon style={{ color: httpColor }} />
                  <span style={{ fontSize: 12 }}>HTTP</span>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11, color: 'var(--td-text-color-placeholder)' }}>
                  <Tooltip content={`p50: ${snapshot.http_p50_ms ?? '-'}ms`}>
                    <span>50%</span>
                  </Tooltip>
                  <Tooltip content={`p95: ${snapshot.http_p95_ms ?? '-'}ms`}>
                    <span>95%</span>
                  </Tooltip>
                  <Tooltip content={`p99: ${snapshot.http_p99_ms ?? '-'}ms`}>
                    <span>99%</span>
                  </Tooltip>
                </div>
                <Progress
                  percentage={snapshot.http_p50_ms != null && snapshot.http_p95_ms != null
                    ? Math.min(Math.round((snapshot.http_p50_ms / Math.max(snapshot.http_p95_ms, 1)) * 100), 100)
                    : 0}
                  label={snapshot.http_p50_ms != null ? `${snapshot.http_p50_ms.toFixed(0)}ms` : '-'}
                  color={httpColor}
                  trackColor="var(--td-bg-color-component)"
                  size="small"
                />
              </Col>
              <Col xs={6}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CloudIcon style={{ color: dnsColor }} />
                  <span style={{ fontSize: 12 }}>{t('resourceMonitor.probeDnsEncrypted')}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11, color: 'var(--td-text-color-placeholder)' }}>
                  <Tooltip content={`p50: ${snapshot.dns_encrypted_p50_ms ?? '-'}ms`}>
                    <span>50%</span>
                  </Tooltip>
                  <Tooltip content={`p95: ${snapshot.dns_encrypted_p95_ms ?? '-'}ms`}>
                    <span>95%</span>
                  </Tooltip>
                  <Tooltip content={`p99: ${snapshot.dns_encrypted_p99_ms ?? '-'}ms`}>
                    <span>99%</span>
                  </Tooltip>
                </div>
                <Progress
                  percentage={snapshot.dns_encrypted_p50_ms != null && snapshot.dns_encrypted_p95_ms != null
                    ? Math.min(Math.round((snapshot.dns_encrypted_p50_ms / Math.max(snapshot.dns_encrypted_p95_ms, 1)) * 100), 100)
                    : 0}
                  label={snapshot.dns_encrypted_p50_ms != null ? `${snapshot.dns_encrypted_p50_ms.toFixed(0)}ms` : '-'}
                  color={dnsColor}
                  trackColor="var(--td-bg-color-component)"
                  size="small"
                />
              </Col>
              <Col xs={6}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <CloudIcon style={{ color: dnsColor }} />
                  <span style={{ fontSize: 12 }}>{t('resourceMonitor.probeDnsPlain')}</span>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11, color: 'var(--td-text-color-placeholder)' }}>
                  <Tooltip content={`p50: ${snapshot.dns_plain_p50_ms ?? '-'}ms`}>
                    <span>50%</span>
                  </Tooltip>
                  <Tooltip content={`p95: ${snapshot.dns_plain_p95_ms ?? '-'}ms`}>
                    <span>95%</span>
                  </Tooltip>
                  <Tooltip content={`p99: ${snapshot.dns_plain_p99_ms ?? '-'}ms`}>
                    <span>99%</span>
                  </Tooltip>
                </div>
                <Progress
                  percentage={snapshot.dns_plain_p50_ms != null && snapshot.dns_plain_p95_ms != null
                    ? Math.min(Math.round((snapshot.dns_plain_p50_ms / Math.max(snapshot.dns_plain_p95_ms, 1)) * 100), 100)
                    : 0}
                  label={snapshot.dns_plain_p50_ms != null ? `${snapshot.dns_plain_p50_ms.toFixed(0)}ms` : '-'}
                  color={dnsColor}
                  trackColor="var(--td-bg-color-component)"
                  size="small"
                />
              </Col>
            </Row>
          </div>
        </div>
      </div>
    </Card>
  )
}
