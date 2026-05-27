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

interface MailSetupModalProps {
  domainId: number;
  domainName: string;
  onClose: () => void;
  existingRecords: DnsRecord[];
}

export function MailSetupModal({ domainId, domainName, onClose, existingRecords }: MailSetupModalProps) {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string>('');
  const [hostname, setHostname] = useState<string>('@');
  const [activeTab, setActiveTab] = useState<'records' | 'preview'>('records');

  // 从后端获取邮件模板列表
  const { data: templateListData, isLoading: loadingTemplates } = useQuery({
    queryKey: ['email-templates'],
    queryFn: () => recordsApi.getEmailTemplates().then((r) => r.data.data?.templates ?? []),
    staleTime: 0, // 不缓存，每次都获取最新数据
  });

  // 获取选中的模板详情
  const { data: selectedTemplateData, isLoading: loadingTemplateDetail } = useQuery({
    queryKey: ['email-template', selected],
    queryFn: () => recordsApi.getEmailTemplate(selected).then((r) => r.data.data?.template ?? null),
    enabled: !!selected,
    staleTime: 0, // 不缓存，每次都获取最新数据
  });

  // 获取模板预览（使用域名名称）
  const { data: previewData, isLoading: loadingPreview } = useQuery({
    queryKey: ['email-template-preview', selected, domainName],
    queryFn: () => recordsApi.getEmailTemplatePreview(selected, domainName).then((r) => r.data.data?.preview ?? ''),
    enabled: !!selected && !!domainName,
    staleTime: 0, // 不缓存，每次都获取最新数据
  });

  const template = selectedTemplateData ?? null;

  const host = hostname.trim() || '@';
  const resolvedRecords: Array<EmailTemplateRecord & { mx?: number }> = template?.records.map((r) => ({
    ...r,
    name: r.name === '@' ? host : r.name,
    mx: r.priority, // MX 记录的 priority 字段映射为 mx
  })) ?? [];

  const conflicts = resolvedRecords.filter((record) =>
    existingRecords.some((existingRecord) => existingRecord.name === record.name && existingRecord.type === record.type),
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
    { key: 'name', label: t('records.fields.host'), render: (row: typeof recordRows[number]) => <span className="record-mono record-mono--strong">{row.name}</span> },
    { key: 'value', label: t('records.fields.value'), render: (row: typeof recordRows[number]) => <span className="record-mono record-mono--value">{row.value}</span> },
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
                    background: '#f5f5f5',
                    borderRadius: '4px'
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
