import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Empty, Form, Input, Select, Space, Switch, Tag } from 'tdesign-react';
import { AddIcon, DeleteIcon, EditIcon, NotificationIcon, SaveIcon } from 'tdesign-icons-react';
import { settingsApi } from '../api';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../contexts/I18nContext';
import { ConfirmDialog } from './ConfirmDialog';

export interface NotificationChannel {
  id: string;
  type: 'webhook' | 'telegram' | 'dingtalk' | 'email';
  name: string;
  enabled: boolean;
  config: Record<string, any>;
}

export function NotificationChannels() {
  const { t } = useI18n();
  const toast = useToast();
  const qc = useQueryClient();
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<NotificationChannel | null>(null);

  useQuery({
    queryKey: ['notification-channels'],
    queryFn: async () => {
      const res = await settingsApi.getNotificationChannels();
      if (res.data.code === 0) {
        setChannels(res.data.data || []);
      }
      return res.data.data;
    },
  });

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
    setEditForm(newChannel);
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

  const updateConfig = (key: string, value: string) => {
    if (!editForm) return;
    setEditForm({ ...editForm, config: { ...editForm.config, [key]: value } });
  };

  const renderEditFields = (channel: NotificationChannel) => (
    <Form layout="vertical" colon={false} requiredMark={false} className="page-shell">
      <Form.FormItem label={t('system.notifications.name')}>
        <Input value={editForm?.name} onChange={(value) => setEditForm({ ...editForm!, name: String(value) })} />
      </Form.FormItem>

      {channel.type === 'webhook' && (
        <div className="notification-form-grid notification-form-grid--webhook">
          <Form.FormItem label={t('system.notifications.method')}>
            <Select
              value={editForm?.config.method}
              options={[
                { label: 'POST', value: 'POST' },
                { label: 'GET', value: 'GET' },
              ]}
              onChange={(value) => updateConfig('method', String(Array.isArray(value) ? value[0] : value))}
            />
          </Form.FormItem>
          <Form.FormItem label={t('system.notifications.url')}>
            <Input value={editForm?.config.url} onChange={(value) => updateConfig('url', String(value))} placeholder="https://..." />
          </Form.FormItem>
        </div>
      )}

      {channel.type === 'telegram' && (
        <div className="notification-form-grid">
          <Form.FormItem label={t('system.notifications.botToken')}>
            <Input value={editForm?.config.botToken} onChange={(value) => updateConfig('botToken', String(value))} />
          </Form.FormItem>
          <Form.FormItem label={t('system.notifications.chatId')}>
            <Input value={editForm?.config.chatId} onChange={(value) => updateConfig('chatId', String(value))} />
          </Form.FormItem>
        </div>
      )}

      {channel.type === 'dingtalk' && (
        <Form.FormItem label={t('system.notifications.webhookUrl')}>
          <Input value={editForm?.config.webhook} onChange={(value) => updateConfig('webhook', String(value))} />
        </Form.FormItem>
      )}

      {channel.type === 'email' && (
        <Form.FormItem label={t('system.notifications.emailAddress')}>
          <Input value={editForm?.config.to} onChange={(value) => updateConfig('to', String(value))} placeholder="admin@example.com" />
        </Form.FormItem>
      )}

      <Space className="record-form__actions">
        <Button variant="outline" onClick={() => setEditingId(null)}>
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
                    <Button shape="square" variant="text" icon={<EditIcon />} onClick={() => { setEditingId(channel.id); setEditForm(channel); }} />
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
