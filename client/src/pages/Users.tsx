import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, Shield } from 'lucide-react';
import { usersApi } from '../api';
import type { User } from '../api';
import { Table } from '../components/Table';
import { Modal } from '../components/Modal';
import { Badge } from '../components/Badge';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import { Avatar } from '../components/Avatar';
import { useI18n } from '../contexts/I18nContext';
import { ROLE_ADMIN, ROLE_SUPER, ROLE_USER, roleLabelKey } from '../utils/roles';

export function Users() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const usernamePattern = /^[A-Za-z0-9_-]+$/;
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);
  const [usernameInput, setUsernameInput] = useState('');

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list().then((r) => r.data.data ?? []),
  });

  const createMutation = useMutation({
    mutationFn: (data: Parameters<typeof usersApi.create>[0]) => usersApi.create(data),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['users'] });
      setShowAdd(false);
      toast.success(t('users.userCreated'));
    },
    onError: () => toast.error(t('users.createFailed')),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof usersApi.update>[1] }) => usersApi.update(id, data),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['users'] });
      setEditing(null);
      toast.success(t('users.userUpdated'));
    },
    onError: () => toast.error(t('users.updateFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => usersApi.delete(id),
    onSuccess: (res) => {
      if (res.data.code !== 0) { toast.error(res.data.msg); return; }
      qc.invalidateQueries({ queryKey: ['users'] });
      setDeleting(null);
      toast.success(t('users.userDeleted'));
    },
    onError: () => toast.error(t('users.deleteFailed')),
  });

  const inputClass = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const roleOptions = (me?.role ?? ROLE_USER) >= ROLE_SUPER ? [ROLE_USER, ROLE_ADMIN] : [ROLE_USER];
  const canEditTarget = (target: User) => {
    if ((me?.role ?? ROLE_USER) >= ROLE_SUPER) return target.role !== ROLE_SUPER;
    return target.role < ROLE_ADMIN;
  };

  const columns = [
    {
      key: 'nickname', label: t('users.nickname'),
      render: (user: User) => (
        <div className="flex items-center gap-2">
          <Avatar username={user.nickname || user.username} email={user.email} size={28} textClassName="text-xs" />
          <div className="min-w-0">
            <span className="font-medium text-gray-900">{user.nickname || user.username}</span>
            <p className="text-xs text-gray-500 truncate">{user.username}</p>
          </div>
          {user.id === me?.id && <Badge variant="blue">{t('users.you')}</Badge>}
        </div>
      ),
    },
    { key: 'username', label: t('users.username'), render: (user: User) => <span className="text-gray-600">{user.username}</span> },
    { key: 'email', label: t('users.email'), render: (user: User) => <span className="text-gray-600">{user.email || '-'}</span> },
    {
      key: 'role', label: t('users.role'),
      render: (user: User) => (
        <div className="flex items-center gap-1.5">
          {user.role >= ROLE_ADMIN && <Shield className="w-3.5 h-3.5 text-blue-600" />}
          <Badge variant={user.role >= ROLE_ADMIN ? 'blue' : 'gray'}>{t(roleLabelKey(user.role))}</Badge>
        </div>
      ),
    },
    {
      key: 'status', label: t('users.status'),
      render: (user: User) => <Badge variant={user.status !== 0 ? 'green' : 'red'}>{user.status !== 0 ? t('users.active') : t('users.disabled')}</Badge>,
    },
    { key: 'created_at', label: t('users.created'), render: (user: User) => <span className="text-gray-500 text-xs">{new Date(user.created_at).toLocaleDateString()}</span> },
    {
      key: 'actions', label: t('common.actions'),
      render: (user: User) => (
        <div className="flex items-center gap-2">
          <button onClick={() => setEditing(user)} disabled={!canEditTarget(user)}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <Edit2 className="w-4 h-4" />
          </button>
          <button onClick={() => setDeleting(user)} disabled={user.id === me?.id || !canEditTarget(user)}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{t('users.title')}</h2>
          <p className="text-sm text-gray-500">{t('users.subtitle')}</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors">
          <Plus className="w-4 h-4" /> {t('users.addUser')}
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <Table columns={columns} data={users} loading={isLoading} rowKey={(user) => user.id} emptyText={t('users.noUsers')} />
      </div>

      {showAdd && (
        <Modal title={t('users.addUser')} onClose={() => setShowAdd(false)} size="sm">
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.target as HTMLFormElement);
            const username = (fd.get('username') as string).trim();
            if (!usernamePattern.test(username)) {
              toast.error(t('users.usernameInvalid'));
              return;
            }
            createMutation.mutate({
              nickname: fd.get('nickname') as string,
              username,
              email: fd.get('email') as string,
              password: fd.get('password') as string,
              role: Number(fd.get('role')),
            });
          }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('users.nicknameRequired')}</label>
              <input name="nickname" required className={inputClass} placeholder={t('users.nicknamePlaceholder')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('users.usernameRequired')}</label>
              <input
                name="username"
                required
                className={inputClass}
                placeholder={t('users.usernamePlaceholder')}
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
              />
              <p className={`text-xs mt-1 ${usernameInput && !usernamePattern.test(usernameInput.trim()) ? 'text-red-500' : 'text-gray-400'}`}>
                {usernameInput && !usernamePattern.test(usernameInput.trim()) ? t('users.usernameInvalid') : t('users.usernameHelp')}
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('users.email')}</label>
              <input name="email" type="email" className={inputClass} placeholder={t('users.emailPlaceholder')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('users.password')}</label>
              <input name="password" type="password" required className={inputClass} placeholder={t('users.passwordPlaceholder')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('users.role')}</label>
              <select name="role" className={inputClass}>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>{t(roleLabelKey(role))}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={createMutation.isPending || (usernameInput.trim().length > 0 && !usernamePattern.test(usernameInput.trim()))}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2">
                {createMutation.isPending && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {t('users.createUser')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editing && canEditTarget(editing) && (
        <Modal title={t('users.editUser')} onClose={() => setEditing(null)} size="sm">
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.target as HTMLFormElement);
            const data: Parameters<typeof usersApi.update>[1] = {
              nickname: fd.get('nickname') as string,
              email: fd.get('email') as string,
              role: Number(fd.get('role')),
              status: Number(fd.get('status')),
            };
            const pwd = fd.get('password') as string;
            if (pwd) data.password = pwd;
            updateMutation.mutate({ id: editing.id, data });
          }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('users.nickname')}</label>
              <input name="nickname" required defaultValue={editing.nickname || editing.username} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('users.username')}</label>
              <p className="text-sm font-semibold text-gray-900">{editing.username}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('users.email')}</label>
              <input name="email" type="email" defaultValue={editing.email} className={inputClass} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('users.newPassword')}</label>
              <input name="password" type="password" className={inputClass} placeholder={t('users.newPasswordPlaceholder')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('users.role')}</label>
              <select name="role" defaultValue={editing.role} className={inputClass}>
                {roleOptions.map((role) => (
                  <option key={role} value={role}>{t(roleLabelKey(role))}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">{t('users.status')}</label>
              <select name="status" defaultValue={editing.status} className={inputClass}>
                <option value={1}>{t('users.active')}</option>
                <option value={0}>{t('users.disabled')}</option>
              </select>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button type="submit" disabled={updateMutation.isPending}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-60 flex items-center gap-2">
                {updateMutation.isPending && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                {t('common.saveChanges')}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {deleting && (
        <ConfirmDialog
          message={t('users.deleteConfirm', { name: deleting.nickname || deleting.username })}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
          onCancel={() => setDeleting(null)}
          isLoading={deleteMutation.isPending}
        />
      )}
    </div>
  );
}
