import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Form, Input, Select, Space, Switch, Tag } from 'tdesign-react';
import { CheckCircleIcon, CloseCircleIcon, ErrorCircleIcon, InternetIcon, PlayCircleIcon, SecuredIcon, TowerClockIcon } from 'tdesign-icons-react';
import { networkApi, type ConnectivityResult } from '../../api';
import { useToast } from '../../hooks/useToast';
import { useI18n } from '../../contexts/I18nContext';

interface ProxyConfig {
  enabled: boolean;
  type: 'socks5' | 'http';
  host: string;
  port: number;
  username?: string;
  password?: string;
}

export function NetworkTab() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [proxyForm, setProxyForm] = useState<ProxyConfig>({
    enabled: false,
    type: 'http',
    host: '',
    port: 8080,
    username: '',
    password: '',
  });

  const { data: proxyConfig } = useQuery<ProxyConfig | null>({
    queryKey: ['proxy-config'],
    queryFn: async () => {
      const res = await networkApi.getProxy();
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
  });

  useEffect(() => {
    if (proxyConfig) {
      setProxyForm(proxyConfig);
    }
  }, [proxyConfig]);

  const [shouldTest, setShouldTest] = useState(false);
  const { data: connectivityData, isLoading: isTesting, error: connectivityError } = useQuery({
    queryKey: ['network-connectivity'],
    queryFn: async () => {
      const res = await networkApi.testConnectivity();
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
    enabled: shouldTest,
    staleTime: 0,
    gcTime: 0,
  });

  const updateProxyMutation = useMutation({
    mutationFn: (config: ProxyConfig) => networkApi.updateProxy(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proxy-config'] });
      toast.success(t('network.proxySaveSuccess'));
    },
    onError: () => toast.error(t('network.proxySaveFailed')),
  });

  const handleTestConnectivity = () => {
    setShouldTest(true);
    queryClient.invalidateQueries({ queryKey: ['network-connectivity'] });
  };

  const getStatusIcon = (status: string) => {
    if (status === 'ok') return <CheckCircleIcon color="var(--td-success-color)" />;
    if (status === 'timeout') return <TowerClockIcon color="var(--td-warning-color)" />;
    if (status === 'error') return <CloseCircleIcon color="var(--td-error-color)" />;
    return <ErrorCircleIcon color="var(--td-text-color-placeholder)" />;
  };

  const getStatusText = (status: string) => {
    if (status === 'ok') return t('network.statusOk') || '正常';
    if (status === 'timeout') return t('network.statusTimeout') || '超时';
    if (status === 'error') return t('network.statusError') || '错误';
    return t('network.statusUnknown') || '未知';
  };

  return (
    <div className="page-shell">
      <section className="page-heading">
        <div>
          <h2>{t('network.title')}</h2>
          <p>{t('network.subtitle')}</p>
        </div>
      </section>

      {proxyConfig?.enabled && (
        <Alert
          theme="success"
          message={`${t('network.proxyActive')}: ${proxyConfig.type.toUpperCase()} ${proxyConfig.host}:${proxyConfig.port}`}
        />
      )}

      <Card
        bordered={false}
        shadow={false}
        title={<Space align="center"><InternetIcon />{t('network.connectivityTest') || '网络连通性测试'}</Space>}
        subtitle={t('network.connectivityTestDesc') || '测试与各大网络服务的连接状态'}
        actions={(
          <Button theme="primary" icon={<PlayCircleIcon />} loading={isTesting} onClick={handleTestConnectivity}>
            {isTesting ? t('network.testing') || '测试中...' : t('network.startTest') || '开始测试'}
          </Button>
        )}
      >
        {connectivityData && (
          <div className="page-shell">
            <Space size="small">
              <span className="page-muted">{t('network.proxyMode') || '代理模式'}:</span>
              <Tag theme={connectivityData.proxyEnabled ? 'success' : 'default'} variant="light">
                {connectivityData.proxyEnabled ? (t('network.viaProxy') || '通过代理') : (t('network.directConnection') || '直连')}
              </Tag>
            </Space>
            <div className="connectivity-grid">
              {connectivityData.results.map((result: ConnectivityResult) => (
                <div key={result.name} className="connectivity-item">
                  <Space align="center">
                    {getStatusIcon(result.status)}
                    <div className="page-list-item__main">
                      <strong>{result.name}</strong>
                      <span>{getStatusText(result.status)}</span>
                    </div>
                  </Space>
                  <div className="connectivity-latency">
                    <strong>{result.latency}ms</strong>
                    {result.error && <span title={result.error}>{result.error}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {connectivityError && <Alert theme="error" message={t('network.testError') || '测试失败'} />}
      </Card>

      <Card
        bordered={false}
        shadow={false}
        title={<Space align="center"><SecuredIcon />{t('network.proxySettings')}</Space>}
        subtitle={t('network.proxySettingsDesc')}
      >
        <Form layout="vertical" colon={false} requiredMark={false} className="page-shell">
          <Form.FormItem label={t('network.proxyEnabled')}>
            <Switch value={proxyForm.enabled} onChange={(checked: any) => setProxyForm({ ...proxyForm, enabled: Boolean(checked) })} />
          </Form.FormItem>
          <div className="notification-form-grid">
            <Form.FormItem label="Proxy Type">
              <Select
                value={proxyForm.type}
                options={[
                  { label: 'HTTP(S) Proxy', value: 'http' },
                  { label: 'SOCKS5 Proxy', value: 'socks5' },
                ]}
                onChange={(value: any) => setProxyForm({ ...proxyForm, type: String(Array.isArray(value) ? value[0] : value) as 'socks5' | 'http' })}
              />
            </Form.FormItem>
            <Form.FormItem label={t('network.proxyHost')}>
              <Input value={String(proxyForm.host)} onChange={(value: any) => setProxyForm({ ...proxyForm, host: String(value) })} placeholder={t('network.proxyHost')} />
            </Form.FormItem>
            <Form.FormItem label={t('network.proxyPort')}>
              <Input type="number" value={String(proxyForm.port)} onChange={(value: any) => setProxyForm({ ...proxyForm, port: parseInt(String(value), 10) || 0 })} />
            </Form.FormItem>
            <Form.FormItem label={t('network.proxyUsername')}>
              <Input value={String(proxyForm.username || '')} onChange={(value: any) => setProxyForm({ ...proxyForm, username: String(value) })} />
            </Form.FormItem>
            <Form.FormItem label={t('network.proxyPassword')}>
              <Input type="password" value={String(proxyForm.password || '')} onChange={(value: any) => setProxyForm({ ...proxyForm, password: String(value) })} />
            </Form.FormItem>
          </div>
          <Space className="record-form__actions">
            <Button theme="primary" icon={<CheckCircleIcon />} loading={updateProxyMutation.isPending} onClick={() => updateProxyMutation.mutate(proxyForm)}>
              {updateProxyMutation.isPending ? t('network.saving') : t('network.saveProxy')}
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}
