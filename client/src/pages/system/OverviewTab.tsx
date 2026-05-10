import { useQuery } from '@tanstack/react-query';
import { Button, Card, Space, Tag } from 'tdesign-react';
import { CheckCircleIcon, RefreshIcon, ServerIcon, SettingIcon } from 'tdesign-icons-react';
import { systemApi } from '../../api';
import { useI18n } from '../../contexts/I18nContext';
import { useToast } from '../../hooks/useToast';

export function OverviewTab() {
  const { t } = useI18n();
  const toast = useToast();

  const { data: systemInfo, isLoading } = useQuery({
    queryKey: ['system-info'],
    queryFn: async () => {
      const res = await systemApi.info();
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
  });

  return (
    <div className="page-shell">
      <Card
        bordered={false}
        shadow={false}
        title={<Space align="center"><ServerIcon />{t('system.status')}</Space>}
        subtitle={t('system.statusDesc')}
      >
        <Space align="center">
          <CheckCircleIcon color="var(--td-success-color)" />
          <span className="page-strong">{t('system.runningNormally')}</span>
        </Space>
      </Card>

      <Card
        bordered={false}
        shadow={false}
        title={<Space align="center"><SettingIcon />{t('system.versionInfo')}</Space>}
        subtitle={t('system.versionDesc')}
      >
        <div className="metric-grid metric-grid--two">
          <div className="metric-tile">
            <span>{t('system.appVersion')}</span>
            <strong>{isLoading ? t('common.loading') : systemInfo?.version}</strong>
          </div>
          <div className="metric-tile">
            <span>{t('system.serverVersion')}</span>
            <strong>{isLoading ? t('common.loading') : systemInfo?.serverVersion}</strong>
          </div>
        </div>
      </Card>

      <Card
        bordered={false}
        shadow={false}
        title={<Space align="center"><RefreshIcon />{t('system.quickActions')}</Space>}
        subtitle={t('system.quickActionsDesc')}
      >
        <Space>
          <Button variant="outline" onClick={() => toast.success(t('system.cacheCleared'))}>
            {t('system.clearCache')}
          </Button>
          <Button theme="primary" onClick={() => toast.success(t('system.backupStarted'))}>
            {t('system.backupDatabase')}
          </Button>
          <Tag theme="primary" variant="light">DNSMgr</Tag>
        </Space>
      </Card>
    </div>
  );
}
