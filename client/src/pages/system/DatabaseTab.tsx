import { useQuery } from '@tanstack/react-query';
import { Alert, Card, Descriptions, Space } from 'tdesign-react';
import { DataBaseIcon } from 'tdesign-icons-react';
import { systemApi } from '../../api';
import { useI18n } from '../../contexts/I18nContext';

export function DatabaseTab() {
  const { t } = useI18n();

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
        title={<Space align="center"><DataBaseIcon />{t('system.databaseInfo')}</Space>}
        subtitle={t('system.databaseDesc')}
      >
        <Descriptions
          bordered
          column={1}
          items={[
            { label: t('system.databaseType'), content: isLoading ? t('common.loading') : systemInfo?.database?.type },
            { label: t('system.databaseVersion'), content: isLoading ? t('common.loading') : systemInfo?.database?.version },
            { label: t('system.driverVersion'), content: isLoading ? t('common.loading') : systemInfo?.database?.driverVersion },
          ]}
        />
      </Card>

      <Alert theme="warning" title={t('system.databaseWarning')} message={t('system.databaseWarningDesc')} />
    </div>
  );
}
