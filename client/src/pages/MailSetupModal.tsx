import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Input, Select, Space, Tag, Loading, Tabs } from 'tdesign-react';
import { MailIcon, RefreshIcon } from 'tdesign-icons-react';
import { recordsApi } from '../api';
import type { DnsRecord, EmailTemplateRecord } from '../api';
import { useToast } from '../hooks/useToast';
import { Modal } from '../components/Modal';
import { Table } from '../components/Table';
import { useI18n } from '../contexts/I18nContext';
import { useTheme } from '../contexts/ThemeContext';

interface MailSetupModalProps {
  domainId: number;
  domainName: string;
  onClose: () => void;
  existingRecords: DnsRecord[];
}

export function MailSetupModal({ domainId, domainName, onClose, existingRecords }: MailSetupModalProps) {
  const { t } = useI18n();
  const { isDark } = useTheme();
  const toast = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string>('');
  const [hostname, setHostname] = useState<string>('@');
  const [activeTab, setActiveTab] = useState<'records' | 'preview'>('records');

  // 获取该域名的所有记录用于冲突检测（不分页、不筛选）
  const { data: allDomainRecords } = useQuery({
    queryKey: ['all-records-for-conflict-detection', domainId],
    queryFn: () => recordsApi.list(domainId, { page: 1, pageSize: 10000 }).then((r) => r.data.data?.list ?? []),
    staleTime: 5 * 60 * 1000, // 缓存 5 分钟
  });

  // 从后端获取邮件模板列表
  const { data: templateListData, isLoading: loadingTemplates } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => recordsApi.getEmailTemplates().then((r) => r.data.data?.templates ?? []),
    staleTime: 5 * 60 * 1000, // 缓存 5 分钟
  });

  // 获取选中的模板详情
  const { data: selectedTemplateData, isLoading: loadingTemplateDetail } = useQuery({
    queryKey: ['email-template', selected],
    queryFn: () => recordsApi.getEmailTemplate(selected).then((r) => r.data.data?.template ?? null),
    enabled: !!selected,
    staleTime: 5 * 60 * 1000, // 缓存 5 分钟
  });

  // 获取模板预览（使用域名名称）
  const { data: previewData, isLoading: loadingPreview } = useQuery({
    queryKey: ['email-template-preview', selected, domainName],
    queryFn: () => recordsApi.getEmailTemplatePreview(selected, domainName).then((r) => r.data.data?.preview ?? ''),
    enabled: !!selected && !!domainName,
    staleTime: 5 * 60 * 1000, // 缓存 5 分钟
  });

  const template = selectedTemplateData ?? null;

  const host = hostname.trim() || '@';
  const resolvedRecords: Array<EmailTemplateRecord & { mx?: number }> = template?.records.map((r) => {
    // 如果记录名是 @，直接替换为用户输入的主机名
    if (r.name === '@') {
      return {
        ...r,
        name: host,
        mx: r.priority, // MX 记录的 priority 字段映射为 mx
      };
    }
    
    // 如果记录名不是 @ 且用户指定了非 @ 的主机名，则拼接为主机名.记录名
    // 例如：_dmarc + mail -> _dmarc.mail
    if (host !== '@' && r.name) {
      return {
        ...r,
        name: `${r.name}.${host}`,
        mx: r.priority,
      };
    }
    
    // 否则保持原样
    return {
      ...r,
      mx: r.priority,
    };
  }) ?? [];

  // 使用所有域名记录进行冲突检测（而不是分页后的记录）
  const recordsForConflictDetection = allDomainRecords ?? existingRecords;
  const conflicts = resolvedRecords.filter((record) =>
    recordsForConflictDetection.some((existingRecord) => 
      existingRecord.name === record.name && existingRecord.type === record.type
    ),
  );

  const batchMutation = useMutation({
    mutationFn: (records: Partial<DnsRecord>[]) => recordsApi.createBatch(domainId, records),
    onSuccess: (res) => {
      if (res.data.code !== 0) {
        toast.error(res.data.msg);
        return;
      }
      qc.invalidateQueries({ queryKey: ['records', domainId] });
      toast.success(t('mail.addSuccess'));
      onClose();
    },
    onError: () => toast.error(t('mail.addFailed')),
  });

  const handleAdd = () => {
    if (!template) return;
    batchMutation.mutate(resolvedRecords);
  };

  const recordRows = resolvedRecords.map((record, index) => ({ ...record, index }));
  const columns = [
    { key: 'type', label: t('records.fields.type'), render: (row: typeof recordRows[number]) => <Tag theme="primary" variant="light">{row.type}</Tag> },
    { 
      key: 'name', 
      label: t('records.fields.host'), 
      render: (row: typeof recordRows[number]) => (
        <span className="record-mono record-mono--strong" title={row.name}>
          {row.name}
        </span>
      ) 
    },
    { key: 'value', label: t('records.fields.value'), render: (row: typeof recordRows[number]) => (
      <span className="record-mono record-mono--value" title={row.value}>
        {row.value}
      </span>
    ) },
    { key: 'mx', label: t('records.fields.mx'), render: (row: typeof recordRows[number]) => <span className="page-muted">{row.mx ?? '-'}</span> },
  ];

  return (
    <Modal title={t('mail.title')} onClose={onClose} size="lg">
      <div className="page-shell" style={{ padding: '16px' }}>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ marginBottom: '8px', fontWeight: 500 }}>{t('mail.selectProvider')}</div>
          {loadingTemplates ? (
            <Loading loading size="small" />
          ) : (
            <Select
              clearable
              value={selected}
              placeholder={t('mail.chooseProvider')}
              options={templateListData?.map((item) => ({ label: `${item.name} (${item.provider})`, value: item.id })) ?? []}
              onChange={(value) => setSelected(String(Array.isArray(value) ? value[0] ?? '' : value ?? ''))}
            />
          )}
        </div>
        
        <div style={{ marginBottom: '16px' }}>
          <div style={{ marginBottom: '8px', fontWeight: 500 }}>{t('mail.hostname')}</div>
          <Input
            value={hostname}
            placeholder={t('mail.hostnamePlaceholder')}
            onChange={(value) => setHostname(String(value))}
          />
        </div>

        {loadingTemplateDetail ? (
          <div className="page-state"><Loading loading /></div>
        ) : template ? (
          <>
            <Tabs
              theme="card"
              value={activeTab}
              onChange={(value) => setActiveTab(value as 'records' | 'preview')}
              list={[
                { value: 'records', label: t('mail.recordsAdded') },
                { value: 'preview', label: t('mail.preview') },
              ]}
              style={{ marginBottom: '16px' }}
            />

            {activeTab === 'records' ? (
              <>
                <Table columns={columns} data={recordRows} rowKey={(row) => row.index} emptyText={t('common.noData')} />

                {conflicts.length > 0 && (
                  <Alert
                    theme="warning"
                    title={t('mail.conflicts')}
                    message={t('mail.conflictsDesc', { types: conflicts.map((conflict) => conflict.type).join(', ') })}
                    style={{ marginTop: '16px' }}
                  />
                )}
              </>
            ) : (
              <div className="page-shell" style={{ maxHeight: '400px', overflow: 'auto' }}>
                {loadingPreview ? (
                  <div className="page-state"><Loading loading /></div>
                ) : (
                  <pre style={{ 
                    whiteSpace: 'pre-wrap', 
                    wordWrap: 'break-word',
                    fontFamily: 'monospace',
                    fontSize: '13px',
                    lineHeight: '1.6',
                    padding: '16px',
                    borderRadius: '4px',
                    // 根据主题动态设置背景色和文字颜色
                    background: isDark ? '#1a1a1a' : '#f5f5f5',
                    color: isDark ? '#e0e0e0' : '#333333',
                    border: isDark ? '1px solid #333' : '1px solid #e0e0e0'
                  }}>
                    {previewData || ''}
                  </pre>
                )}
              </div>
            )}

            <Space className="record-form__actions" style={{ marginTop: '16px' }}>
              <Button variant="outline" onClick={onClose}>{t('mail.cancel')}</Button>
              <Button
                theme="primary"
                loading={batchMutation.isPending}
                icon={batchMutation.isPending ? <RefreshIcon /> : <MailIcon />}
                onClick={handleAdd}
              >
                {t('mail.add')}
              </Button>
            </Space>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
