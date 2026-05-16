import { useState, useEffect, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Empty, Form, Input, Select, Space, Switch, Tag } from 'tdesign-react';
import { AddIcon, DeleteIcon, EditIcon, NotificationIcon, SaveIcon } from 'tdesign-icons-react';
import { settingsApi } from '../api';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../contexts/I18nContext';
import { ConfirmDialog } from './ConfirmDialog';
import { toBoolean } from '../utils/typeConverters';

export interface NotificationChannel {
  id: string;
  type: 'webhook' | 'telegram' | 'dingtalk' | 'email';
  name: string;
  enabled: boolean;
  config: Record<string, any>;
}

const channelField = (label: string, control: ReactNode) => (
  <div className="settings-control-field">
    <span>{label}</span>
    {control}
  </div>
);

function getDefaultChannelConfig(type: NotificationChannel['type']) {
  if (type === 'webhook') return { url: '', method: 'POST' };
  if (type === 'telegram') return { botToken: '', chatId: '' };
  if (type === 'dingtalk') return { webhook: '' };
  return { to: '' };
}

function normalizeChannel(channel: NotificationChannel): NotificationChannel {
  return {
    ...channel,
    id: String(channel.id),
    name: String(channel.name || ''),
    enabled: toBoolean(channel.enabled),
    config: {
      ...getDefaultChannelConfig(channel.type),
      ...(channel.config || {}),
    },
  };
}

function cloneChannel(channel: NotificationChannel): NotificationChannel {
  const normalized = normalizeChannel(channel);
  return {
    ...normalized,
    config: { ...normalized.config },
  };
}

export function NotificationChannels() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<NotificationChannel | null>(null);
  const [editFormDirty, setEditFormDirty] = useState(false);

  const { data: channelsData } = useQuery({
    queryKey: ['notification-channels'],
    queryFn: async () => {
      const res = await settingsApi.getNotificationChannels();
      if (res.data.code === 0) return res.data.data || [];
      throw new Error(res.data.msg);
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (!channelsData) return;
    const normalizedChannels = channelsData.map((channel: NotificationChannel) => normalizeChannel(channel));
    setChannels(normalizedChannels);

    if (editingId && !editFormDirty) {
      const current = normalizedChannels.find((channel: NotificationChannel) => channel.id === editingId);
      if (current) {
        setEditForm(cloneChannel(current));
      }
    }
  }, [channelsData, editingId, editFormDirty]);

  const saveMutation = useMutation({
    mutationFn: (newChannels: NotificationChannel[]) => settingsApi.updateNotificationChannels(newChannels),
    onSuccess: (res) => {
      if (res.data.code !== 0) {
        toast.error(res.data.msg);
        return;
      }
      toast.success(t('system.notifications.saved'));
      qc.invalidateQueries({ queryKey: ['notification-channels'] });
      setEditingId(null);
      setDeletingId(null);
      setEditForm(null);
      setEditFormDirty(false);
    },
    onError: () => toast.error(t('system.notifications.saveFailed')),
  });

  const handleAdd = (type: NotificationChannel['type']) => {
    const newChannel: NotificationChannel = {
      id: Date.now().toString(),
      type,
      name: `New ${type}`,
      enabled: true,
      config: type === 'webhook' ? { url: '', method: 'POST' }
        : type === 'telegram' ? { botToken: '', chatId: '' }
          : type === 'dingtalk' ? { webhook: '' }
            : { to: '' },
    };
    setChannels([...channels, newChannel]);
    setEditingId(newChannel.id);
    setEditForm(cloneChannel(newChannel));
    setEditFormDirty(true);
  };

  const handleSave = () => {
    if (!editForm) return;
    const newChannels = channels.map((channel) => channel.id === editForm.id ? editForm : channel);
    setChannels(newChannels);
    saveMutation.mutate(newChannels);
  };

  const handleToggle = (id: string, enabled: boolean) => {
    const newChannels = channels.map((channel) => channel.id === id ? { ...channel, enabled } : channel);
    setChannels(newChannels);
    saveMutation.mutate(newChannels);
  };

  const handleDelete = () => {
    if (!deletingId) return;
    const newChannels = channels.filter((channel) => channel.id !== deletingId);
    setChannels(newChannels);
    saveMutation.mutate(newChannels);
  };

  const handleCancelEdit = () => {
    if (!editingId) return;
    const isPersistedChannel = channelsData?.some((channel: NotificationChannel) => channel.id === editingId);
    if (!isPersistedChannel) {
      setChannels((current) => current.filter((channel) => channel.id !== editingId));
    }
    setEditForm(null);
    setEditingId(null);
    setEditFormDirty(false);
  };

  const updateConfig = (key: string, value: string) => {
    if (!editForm) return;
    setEditForm({ ...editForm, config: { ...editForm.config, [key]: value } });
    setEditFormDirty(true);
  };

  const updateEditForm = (updates: Partial<NotificationChannel>) => {
    if (!editForm) return;
    setEditForm({ ...editForm, ...updates });
    setEditFormDirty(true);
  };

  const getChannelNamePlaceholder = (type: NotificationChannel['type']) => {
    if (type === 'webhook') return 'Primary Webhook';
    if (type === 'telegram') return 'Ops Telegram';
    if (type === 'dingtalk') return 'DingTalk Bot';
    return 'alerts@example.com';
  };

  const renderEditFields = (channel: NotificationChannel) => (
    <Form layout="vertical" colon={false} requiredMark={false} className="page-shell">
      {channelField(t('system.notifications.name'),
        <Input
          value={editForm?.name || ''}
          onChange={(value) => updateEditForm({ name: String(value) })}
          placeholder={getChannelNamePlaceholder(channel.type)}
        />
      )}

      {channel.type === 'webhook' && (
        <div className="notification-form-grid notification-form-grid--webhook">
          {channelField(t('system.notifications.method'),
            <Select
              value={editForm?.config.method || 'POST'}
              options={[
                { label: 'POST', value: 'POST' },
                { label: 'GET', value: 'GET' },
              ]}
              onChange={(value) => updateConfig('method', String(Array.isArray(value) ? value[0] : value))}
            />
          )}
          {channelField(t('system.notifications.url'),
            <Input value={editForm?.config.url || ''} onChange={(value) => updateConfig('url', String(value))} placeholder="https://..." />
          )}
        </div>
      )}

      {channel.type === 'telegram' && (
        <div className="notification-form-grid">
          {channelField(t('system.notifications.botToken'),
            <Input
              value={editForm?.config.botToken || ''}
              onChange={(value) => updateConfig('botToken', String(value))}
              placeholder="123456789:AAExampleBotToken"
            />
          )}
          {channelField(t('system.notifications.chatId'),
            <Input
              value={editForm?.config.chatId || ''}
              onChange={(value) => updateConfig('chatId', String(value))}
              placeholder="-1001234567890"
            />
          )}
        </div>
      )}

      {channel.type === 'dingtalk' && (
        channelField(t('system.notifications.webhookUrl'),
          <Input
            value={editForm?.config.webhook || ''}
            onChange={(value) => updateConfig('webhook', String(value))}
            placeholder="https://oapi.dingtalk.com/robot/send?access_token=..."
          />
        )
      )}

      {channel.type === 'email' && (
        channelField(t('system.notifications.emailAddress'),
          <Input value={editForm?.config.to || ''} onChange={(value) => updateConfig('to', String(value))} placeholder="admin@example.com" />
        )
      )}

      <Space className="record-form__actions">
        <Button variant="outline" onClick={handleCancelEdit}>
          {t('system.notifications.cancel')}
        </Button>
        <Button theme="primary" icon={<SaveIcon />} loading={saveMutation.isPending} onClick={handleSave}>
          {t('system.notifications.save')}
        </Button>
      </Space>
    </Form>
  );

  const addActions = (
    <div className="notification-add-actions">
      <Button size="small" variant="outline" icon={<AddIcon />} onClick={() => handleAdd('webhook')}>{t('system.notifications.addWebhook')}</Button>
      <Button size="small" variant="outline" icon={<AddIcon />} onClick={() => handleAdd('telegram')}>{t('system.notifications.addTelegram')}</Button>
      <Button size="small" variant="outline" icon={<AddIcon />} onClick={() => handleAdd('dingtalk')}>{t('system.notifications.addDingtalk')}</Button>
      <Button size="small" variant="outline" icon={<AddIcon />} onClick={() => handleAdd('email')}>{t('system.notifications.addEmail')}</Button>
    </div>
  );

  return (
    <Card
      bordered={false}
      shadow={false}
      title={<Space align="center"><NotificationIcon />{t('system.notifications.title')}</Space>}
      subtitle={t('system.notifications.desc')}
      actions={addActions}
    >
      {channels.length === 0 ? (
        <Empty description={t('system.notifications.empty')} />
      ) : (
        <div className="page-list">
          {channels.map((channel) => (
            <div key={channel.id} className="page-list-item notification-channel">
              {editingId === channel.id ? (
                renderEditFields(channel)
              ) : (
                <>
                  <div className="team-member">
                    <NotificationIcon />
                    <div className="page-list-item__main">
                      <strong>{channel.name} <Tag size="small" variant="light">{channel.type}</Tag></strong>
                      <span>
                        {channel.type === 'webhook' ? channel.config.url
                          : channel.type === 'telegram' ? channel.config.chatId
                            : channel.type === 'dingtalk' ? 'DingTalk Webhook'
                              : channel.config.to}
                      </span>
                    </div>
                  </div>
                  <Space size="small">
                    <Switch size="small" value={channel.enabled} onChange={(checked) => handleToggle(channel.id, Boolean(checked))} />
                    <Button shape="square" variant="text" icon={<EditIcon />} onClick={() => { setEditingId(channel.id); setEditForm(cloneChannel(channel)); setEditFormDirty(false); }} />
                    <Button shape="square" variant="text" theme="danger" icon={<DeleteIcon />} onClick={() => setDeletingId(channel.id)} />
                  </Space>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {deletingId && (
        <ConfirmDialog
          message={t('system.notifications.deleteConfirm')}
          onConfirm={handleDelete}
          onCancel={() => setDeletingId(null)}
          isLoading={saveMutation.isPending}
        />
      )}
    </Card>
  );
}
