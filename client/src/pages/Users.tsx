import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Form, Input, Loading, Select, Space, Switch, Tag } from 'tdesign-react';
import type { SelectValue } from 'tdesign-react/es/select';
import { AddIcon, DeleteIcon, EditIcon, MobileIcon, SecuredIcon } from 'tdesign-icons-react';
import { usersApi, securityApi } from '../api';
import type { User } from '../api';
import { Table } from '../components/Table';
import { Modal } from '../components/Modal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import { Avatar } from '../components/Avatar';
import { useI18n } from '../contexts/I18nContext';
import { ROLE_ADMIN, ROLE_SUPER, ROLE_USER, roleLabelKey } from '../utils/roles';
import { useRealtimeData } from '../hooks/useRealtimeData';

const usernamePattern = /^[A-Za-z0-9_-]+$/;

function selectToNumber(value: SelectValue) {
  return Number(Array.isArray(value) ? value[0] ?? ROLE_USER : value);
}

interface UserCreateFormProps {
  roleOptions: number[];
  isPending: boolean;
  onSubmit: (data: Parameters<typeof usersApi.create>[0]) => void;
}

function UserCreateForm({ roleOptions, isPending, onSubmit }: UserCreateFormProps) {
  const { t } = useI18n();
  const toast = useToast();
  const [nickname, setNickname] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(roleOptions[0] ?? ROLE_USER);
  const usernameInvalid = username.trim().length > 0 && !usernamePattern.test(username.trim());

  const submit = () => {
    const normalizedUsername = username.trim();
    if (!usernamePattern.test(normalizedUsername)) {
      toast.error(t('users.usernameInvalid'));
      return;
    }
    onSubmit({ nickname, username: normalizedUsername, email, password, role });
  };

  return (
    <Form layout="vertical" colon={false} requiredMark={false} className="page-shell" onSubmit={({ e }: any) => { e?.preventDefault(); submit(); }}>
      <Form.FormItem label={t('users.nicknameRequired')}>
        <Input clearable value={nickname} onChange={(value: any) => setNickname(String(value))} placeholder={t('users.nicknamePlaceholder')} />
      </Form.FormItem>
      <Form.FormItem
        label={t('users.usernameRequired')}
        status={usernameInvalid ? 'error' : undefined}
        tips={usernameInvalid ? t('users.usernameInvalid') : t('users.usernameHelp')}
      >
        <Input clearable value={username} onChange={(value: any) => setUsername(String(value))} placeholder={t('users.usernamePlaceholder')} status={usernameInvalid ? 'error' : undefined} />
      </Form.FormItem>
      <Form.FormItem label={t('users.email')}>
        <Input clearable type="text" value={email} onChange={(value: any) => setEmail(String(value))} placeholder={t('users.emailPlaceholder')} />
      </Form.FormItem>
      <Form.FormItem label={t('users.password')}>
        <Input type="password" value={password} onChange={(value: any) => setPassword(String(value))} placeholder={t('users.passwordPlaceholder')} />
      </Form.FormItem>
      <Form.FormItem label={t('users.role')}>
        <Select
          value={role}
          options={roleOptions.map((item) => ({ label: t(roleLabelKey(item)), value: item }))}
          onChange={(value: any) => setRole(selectToNumber(value))}
        />
      </Form.FormItem>
      <Space className="record-form__actions">
        <Button type="submit" theme="primary" loading={isPending} disabled={usernameInvalid}>
          {t('users.createUser')}
        </Button>
      </Space>
    </Form>
  );
}

interface UserEditModalProps {
  user: User;
  onClose: () => void;
  onSubmit: (data: Parameters<typeof usersApi.update>[1]) => void;
  isPending: boolean;
  roleOptions: number[];
  t: (key: string, params?: Record<string, string | number>) => string;
}

function UserEditModal({ user, onClose, onSubmit, isPending, roleOptions, t }: UserEditModalProps) {
  const [nickname, setNickname] = useState(user.nickname || user.username);
  const [email, setEmail] = useState(user.email || '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<number>(user.role);
  const [status, setStatus] = useState<number>(user.status);
  const [require2FA, setRequire2FA] = useState(false);
  const [global2FAEnabled, setGlobal2FAEnabled] = useState(true);
  const [isLoading2FA, setIsLoading2FA] = useState(true);
  const toast = useToast();
  const qc = useQueryClient();

  // Sync form data when user prop changes
  useEffect(() => {
    setNickname(user.nickname || user.username);
    setEmail(user.email || '');
    setPassword('');
    setRole(user.role);
    setStatus(user.status);
    setRequire2FA(false);
    setIsLoading2FA(true);
  }, [user.id, user.nickname, user.username, user.email, user.role, user.status]);

  useEffect(() => {
    const load2FAStatus = async () => {
      try {
        const res = await securityApi.getUser2FARequirement(user.id);
        if (res.data.code === 0) {
          setRequire2FA(Boolean(res.data.data.require2FA));
          setGlobal2FAEnabled(Boolean(res.data.data.global2FAEnabled ?? true));
        }
      } catch (error) {
        console.error('Failed to load 2FA requirement:', error);
      } finally {
        setIsLoading2FA(false);
      }
    };
    load2FAStatus();
  }, [user.id]);

  const setUser2FAMutation = useMutation({
    mutationFn: ({ userId, nextRequire2FA }: { userId: number; nextRequire2FA: boolean }) =>
      securityApi.setUser2FARequirement(userId, nextRequire2FA),
    onSuccess: (res) => {
      setRequire2FA(Boolean(res.data.data?.require2FA));
      setGlobal2FAEnabled(Boolean(res.data.data?.global2FAEnabled ?? true));
      qc.invalidateQueries({ queryKey: ['user-2fa-requirement', user.id] });
      toast.success(t('users.user2FAUpdated'));
    },
    onError: () => {
      toast.error(t('users.user2FAUpdateFailed'));
    },
  });

  const submit = () => {
    const data: Parameters<typeof usersApi.update>[1] = {
      nickname,
      email,
      role,
      status,
    };
    if (password) data.password = password;
    onSubmit(data);
  };

  const handle2FAToggle = (checked: boolean) => {
    if (!global2FAEnabled) return;
    setRequire2FA(checked);
    setUser2FAMutation.mutate({ userId: user.id, nextRequire2FA: checked });
  };

  return (
    <Modal title={t('users.editUser')} onClose={onClose} size="sm">
      <Form layout="vertical" colon={false} requiredMark={false} className="page-shell" onSubmit={({ e }: any) => { e?.preventDefault(); submit(); }}>
        <Form.FormItem label={t('users.nickname')}>
          <Input clearable value={nickname} onChange={(value: any) => setNickname(String(value))} />
        </Form.FormItem>
        <Form.FormItem label={t('users.username')}>
          <span className="page-strong">{user.username}</span>
        </Form.FormItem>
        <Form.FormItem label={t('users.email')}>
          <Input clearable value={email} onChange={(value: any) => setEmail(String(value))} />
        </Form.FormItem>
        <Form.FormItem label={t('users.newPassword')}>
          <Input type="password" value={password} onChange={(value: any) => setPassword(String(value))} placeholder={t('users.newPasswordPlaceholder')} />
        </Form.FormItem>
        <Form.FormItem label={t('users.role')}>
          <Select
            value={role}
            options={roleOptions.map((item) => ({ label: t(roleLabelKey(item)), value: item }))}
            onChange={(value: any) => setRole(selectToNumber(value))}
          />
        </Form.FormItem>
        <Form.FormItem label={t('users.status')}>
          <Select
            value={status}
            options={[
              { label: t('users.active'), value: 1 },
              { label: t('users.disabled'), value: 0 },
            ]}
            onChange={(value: any) => setStatus(selectToNumber(value))}
          />
        </Form.FormItem>

        <Card bordered className="user-2fa-card">
          <div className="user-2fa-card__content">
            <MobileIcon className="user-2fa-card__icon" />
            <div>
              <div className="settings-switch-row__heading">
                <strong>{t('users.require2FA')}</strong>
                {!global2FAEnabled && <Tag theme="default" variant="light">{t('users.require2FASystemDisabled')}</Tag>}
              </div>
              <p>{t('users.require2FADesc')}</p>
            </div>
          </div>
          {isLoading2FA ? (
            <Loading loading size="small" />
          ) : (
            <Switch
              value={require2FA}
              loading={setUser2FAMutation.isPending}
              disabled={!global2FAEnabled}
              onChange={handle2FAToggle}
            />
          )}
        </Card>

        <Space className="record-form__actions">
          <Button type="submit" theme="primary" loading={isPending}>
            {t('common.saveChanges')}
          </Button>
        </Space>
      </Form>
    </Modal>
  );
}

export function Users() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [deleting, setDeleting] = useState<User | null>(null);

  useRealtimeData({
    queryKey: ['users'],
    websocketEventTypes: ['user_created', 'user_updated', 'user_deleted'],
    pollingInterval: 120000,
  });

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

  const roleOptions = (me?.role ?? ROLE_USER) >= ROLE_SUPER ? [ROLE_USER, ROLE_ADMIN] : [ROLE_USER];
  const canEditTarget = (target: User) => {
    if ((me?.role ?? ROLE_USER) >= ROLE_SUPER) return target.role !== ROLE_SUPER;
    return target.role < ROLE_ADMIN;
  };

  const columns = [
    {
      key: 'nickname',
      label: t('users.nickname'),
      render: (user: User) => (
        <div className="user-cell">
          <Avatar username={user.nickname || user.username} email={user.email} size={28} />
          <div className="user-cell__text">
            <span className="page-strong">{user.nickname || user.username}</span>
            <small>{user.username}</small>
          </div>
          {user.id === me?.id && <Tag theme="primary" variant="light">{t('users.you')}</Tag>}
        </div>
      ),
    },
    { key: 'username', label: t('users.username'), render: (user: User) => <span className="page-muted">{user.username}</span> },
    { key: 'email', label: t('users.email'), render: (user: User) => <span className="page-muted">{user.email || '-'}</span> },
    {
      key: 'role',
      label: t('users.role'),
      render: (user: User) => (
        <Space size="small">
          {user.role >= ROLE_ADMIN && <SecuredIcon color="var(--td-brand-color)" />}
          <Tag theme={user.role >= ROLE_ADMIN ? 'primary' : 'default'} variant="light">{t(roleLabelKey(user.role))}</Tag>
        </Space>
      ),
    },
    {
      key: 'status',
      label: t('users.status'),
      render: (user: User) => (
        <Tag theme={user.status !== 0 ? 'success' : 'danger'} variant="light">
          {user.status !== 0 ? t('users.active') : t('users.disabled')}
        </Tag>
      ),
    },
    { key: 'created_at', label: t('users.created'), render: (user: User) => <span className="page-muted">{new Date(user.created_at).toLocaleDateString()}</span> },
    {
      key: 'actions',
      label: t('common.actions'),
      render: (user: User) => (
        <Space size="small">
          <Button shape="square" variant="text" icon={<EditIcon />} disabled={!canEditTarget(user)} onClick={() => setEditing(user)} />
          <Button shape="square" variant="text" theme="danger" icon={<DeleteIcon />} disabled={user.id === me?.id || !canEditTarget(user)} onClick={() => setDeleting(user)} />
        </Space>
      ),
    },
  ];

  return (
    <div className="page-shell">
      <section className="page-heading">
        <div>
          <h1>{t('users.title')}</h1>
          <p>{t('users.subtitle')}</p>
        </div>
        <Button theme="primary" icon={<AddIcon />} onClick={() => setShowAdd(true)}>
          {t('users.addUser')}
        </Button>
      </section>

      <Card bordered={false} shadow={false} className="page-card">
        <Table columns={columns} data={users} loading={isLoading} rowKey={(user) => user.id} emptyText={t('users.noUsers')} />
      </Card>

      {showAdd && (
        <Modal title={t('users.addUser')} onClose={() => setShowAdd(false)} size="sm">
          <UserCreateForm
            roleOptions={roleOptions}
            isPending={createMutation.isPending}
            onSubmit={(data) => createMutation.mutate(data)}
          />
        </Modal>
      )}

      {editing && canEditTarget(editing) && (
        <UserEditModal
          user={editing}
          onClose={() => setEditing(null)}
          onSubmit={(data) => updateMutation.mutate({ id: editing.id, data })}
          isPending={updateMutation.isPending}
          roleOptions={roleOptions}
          t={t}
        />
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
