import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, Trash2, Edit2, Save } from 'lucide-react';
import { settingsApi } from '../api';
import { useToast } from '../hooks/useToast';
import { useI18n } from '../contexts/I18nContext';

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
  const [editForm, setEditForm] = useState<NotificationChannel | null>(null);

  useQuery({
    queryKey: ['notification-channels'],
    queryFn: async () => {
      const res = await settingsApi.getNotificationChannels();
      if (res.data.code === 0) {
        setChannels(res.data.data || []);
      }
      return res.data.data;
    }
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
    },
    onError: () => toast.error(t('system.notifications.saveFailed'))
  });

  const handleAdd = (type: 'webhook' | 'telegram' | 'dingtalk' | 'email') => {
    const newChannel: NotificationChannel = {
      id: Date.now().toString(),
      type,
      name: `New ${type}`,
      enabled: true,
      config: type === 'webhook' ? { url: '', method: 'POST' } 
            : type === 'telegram' ? { botToken: '', chatId: '' }
            : type === 'dingtalk' ? { webhook: '' }
            : { to: '' }
    };
    setChannels([...channels, newChannel]);
    setEditingId(newChannel.id);
    setEditForm(newChannel);
  };

  const handleSave = () => {
    if (!editForm) return;
    const newChannels = channels.map(c => c.id === editForm.id ? editForm : c);
    setChannels(newChannels);
    saveMutation.mutate(newChannels);
  };

  const handleToggle = (id: string, enabled: boolean) => {
    const newChannels = channels.map(c => c.id === id ? { ...c, enabled } : c);
    setChannels(newChannels);
    saveMutation.mutate(newChannels);
  };

  const handleDelete = (id: string) => {
    if (!confirm(t('system.notifications.deleteConfirm'))) return;
    const newChannels = channels.filter(c => c.id !== id);
    setChannels(newChannels);
    saveMutation.mutate(newChannels);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('system.notifications.title')}</h3>
          <p className="text-sm text-gray-500">{t('system.notifications.desc')}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => handleAdd('webhook')} className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300">{t('system.notifications.addWebhook')}</button>
          <button onClick={() => handleAdd('telegram')} className="px-3 py-1.5 text-sm bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg text-blue-700 dark:text-blue-400">{t('system.notifications.addTelegram')}</button>
          <button onClick={() => handleAdd('dingtalk')} className="px-3 py-1.5 text-sm bg-blue-50 dark:bg-blue-900/30 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg text-blue-700 dark:text-blue-400">{t('system.notifications.addDingtalk')}</button>
          <button onClick={() => handleAdd('email')} className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300">{t('system.notifications.addEmail')}</button>
        </div>
      </div>

      <div className="space-y-4">
        {channels.length === 0 && <div className="text-center text-gray-500 py-8 text-sm">{t('system.notifications.empty')}</div>}
        {channels.map(channel => (
          <div key={channel.id} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-900">
            {editingId === channel.id ? (
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">{t('system.notifications.name')}</label>
                    <input type="text" value={editForm?.name} onChange={e => setEditForm({ ...editForm!, name: e.target.value })} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                  </div>
                </div>

                {channel.type === 'webhook' && (
                  <div className="flex gap-4">
                    <div className="w-1/4">
                      <label className="block text-xs text-gray-500 mb-1">{t('system.notifications.method')}</label>
                      <select value={editForm?.config.method} onChange={e => setEditForm({ ...editForm!, config: { ...editForm!.config, method: e.target.value } })} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
                        <option>POST</option>
                        <option>GET</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">{t('system.notifications.url')}</label>
                      <input type="text" value={editForm?.config.url} onChange={e => setEditForm({ ...editForm!, config: { ...editForm!.config, url: e.target.value } })} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" placeholder="https://..." />
                    </div>
                  </div>
                )}

                {channel.type === 'telegram' && (
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">{t('system.notifications.botToken')}</label>
                      <input type="text" value={editForm?.config.botToken} onChange={e => setEditForm({ ...editForm!, config: { ...editForm!.config, botToken: e.target.value } })} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">{t('system.notifications.chatId')}</label>
                      <input type="text" value={editForm?.config.chatId} onChange={e => setEditForm({ ...editForm!, config: { ...editForm!.config, chatId: e.target.value } })} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                    </div>
                  </div>
                )}

                {channel.type === 'dingtalk' && (
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">{t('system.notifications.webhookUrl')}</label>
                      <input type="text" value={editForm?.config.webhook} onChange={e => setEditForm({ ...editForm!, config: { ...editForm!.config, webhook: e.target.value } })} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                    </div>
                  </div>
                )}

                {channel.type === 'email' && (
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">{t('system.notifications.emailAddress')}</label>
                      <input type="email" value={editForm?.config.to} onChange={e => setEditForm({ ...editForm!, config: { ...editForm!.config, to: e.target.value } })} className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white" placeholder="admin@example.com" />
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-2 mt-4">
                  <button onClick={() => { setEditingId(null); if (!channels.find(c => c.id === channel.id)?.name) setChannels(channels.filter(c => c.id !== channel.id)); }} className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400">{t('system.notifications.cancel')}</button>
                  <button onClick={handleSave} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-1"><Save className="w-4 h-4"/> {t('system.notifications.save')}</button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell className="w-5 h-5 text-gray-400" />
                  <div>
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">{channel.name} <span className="text-xs text-gray-400 uppercase ml-2">{channel.type}</span></h4>
                    <p className="text-xs text-gray-500 truncate max-w-md">
                      {channel.type === 'webhook' ? channel.config.url : channel.type === 'telegram' ? channel.config.chatId : channel.type === 'dingtalk' ? 'DingTalk Webhook' : channel.config.to}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => handleToggle(channel.id, !channel.enabled)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${channel.enabled ? 'bg-blue-600' : 'bg-gray-200'}`}
                  >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${channel.enabled ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                  <button onClick={() => { setEditingId(channel.id); setEditForm(channel); }} className="text-gray-400 hover:text-blue-500"><Edit2 className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(channel.id)} className="text-gray-400 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
