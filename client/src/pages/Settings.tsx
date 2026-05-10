import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Form, Input, Select, Space, Switch, Tag } from 'tdesign-react';
import { ClearIcon, ImageIcon, LockOnIcon, UserSettingIcon } from 'tdesign-icons-react';
import { authApi } from '../api';
import type { OAuthBinding } from '../api';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../contexts/AuthContext';
import { roleLabelKey } from '../utils/roles';
import { Avatar } from '../components/Avatar';
import { useI18n } from '../contexts/I18nContext';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { useRealtimeData } from '../hooks/useRealtimeData';
import { useUiScale } from '../contexts/UiScaleContext';
import type { UiScale } from '../contexts/UiScaleContext';

export function Settings() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const { t } = useI18n();
  const { uiScale, setUiScale } = useUiScale();
  const queryClient = useQueryClient();

  useRealtimeData({
    queryKey: ['user-profile'],
    websocketEventTypes: ['user_updated'],
    pollingInterval: 300000,
  });

  const displayName = user?.nickname || user?.username;
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [showTunnels, setShowTunnels] = useLocalStorage('showTunnels', false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [selectedOauthProvider, setSelectedOauthProvider] = useState<'custom' | 'logto'>('custom');
  const [backgroundImage, setBackgroundImage] = useState('');
  const [avatarImage, setAvatarImage] = useState('');

  useEffect(() => {
    setNickname(user?.nickname ?? '');
    setEmail(user?.email ?? '');
  }, [user?.id, user?.nickname, user?.email]);

  const { data: preferencesData } = useQuery({
    queryKey: ['userPreferences'],
    queryFn: async () => {
      const res = await authApi.getPreferences();
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
  });

  useEffect(() => {
    if (preferencesData) {
      setBackgroundImage(preferencesData.backgroundImage || '');
      setAvatarImage(preferencesData.avatarImage || '');
    }
  }, [preferencesData]);

  const updateBackgroundMutation = useMutation({
    mutationFn: (imageUrl: string) => authApi.updatePreferences({ backgroundImage: imageUrl }),
    onSuccess: (res) => {
      if (res.data.code !== 0) {
        toast.error(res.data.msg);
        return;
      }
      toast.success(t('settings.backgroundImageUpdated'));
      queryClient.invalidateQueries({ queryKey: ['userPreferences'] });
    },
    onError: () => toast.error(t('settings.backgroundImageUpdateFailed')),
  });

  const { data: oauthStatusData } = useQuery({
    queryKey: ['oauth-status'],
    queryFn: async () => {
      const res = await authApi.oauthStatus();
      if (res.data.code === 0) return res.data.data;
      throw new Error(res.data.msg);
    },
  });

  const { data: oauthBindings = [], refetch: refetchBindings } = useQuery({
    queryKey: ['oauth-bindings'],
    queryFn: async () => {
      const res = await authApi.oauthBindings();
      if (res.data.code === 0) return res.data.data || [];
      throw new Error(res.data.msg);
    },
  });

  const oauthEnabled = oauthStatusData?.enabled ?? false;
  const oauthProviderName = oauthStatusData?.providerName || 'OIDC';
  const oauthProviders = oauthStatusData?.providers || [];

  const profileMutation = useMutation({
    mutationFn: async () => {
      let updatedUser = null;

      if (profileFieldsChanged) {
        const res = await authApi.updateProfile({ nickname: nickname.trim(), email: email.trim(), emailCode: emailCode.trim() || undefined });
        if (res.data.code !== 0) {
          throw new Error(res.data.msg || t('settings.profileUpdateFailed'));
        }
        updatedUser = res.data.data;
      }

      if (avatarChanged) {
        const res = await authApi.updatePreferences({ avatarImage });
        if (res.data.code !== 0) {
          throw new Error(res.data.msg || t('settings.profileUpdateFailed'));
        }
      }

      return updatedUser;
    },
    onSuccess: (updatedUser) => {
      if (updatedUser) updateUser(updatedUser);
      setEmailCode('');
      toast.success(t('settings.profileUpdated'));
      queryClient.invalidateQueries({ queryKey: ['userPreferences'] });
    },
    onError: (err) => toast.error(err instanceof Error ? err.message : t('settings.profileUpdateFailed')),
  });

  const sendEmailCodeMutation = useMutation({
    mutationFn: () => authApi.sendEmailVerificationCode(email.trim()),
    onSuccess: (res) => {
      if (res.data.code !== 0) {
        toast.error(res.data.msg);
        return;
      }
      toast.success(t('settings.emailCodeSent'));
    },
    onError: () => toast.error(t('settings.emailCodeSendFailed')),
  });

  const passwordMutation = useMutation({
    mutationFn: () => authApi.changePassword(oldPassword, newPassword),
    onSuccess: (res) => {
      if (res.data.code !== 0) { setError(res.data.msg); return; }
      setSuccess(true);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success(t('settings.passwordChanged'));
      setTimeout(() => setSuccess(false), 3000);
    },
    onError: () => setError(t('settings.passwordChangeFailed')),
  });

  const bindOauthMutation = useMutation({
    mutationFn: () => authApi.oauthStartBind(selectedOauthProvider),
    onSuccess: (res) => {
      if (res.data.code !== 0) {
        toast.error(res.data.msg || t('settings.oauthBindStartFailed'));
        return;
      }
      window.location.href = res.data.data.authUrl;
    },
    onError: () => toast.error(t('settings.oauthBindStartFailed')),
  });

  const unbindOauthMutation = useMutation({
    mutationFn: (provider: string) => authApi.unbindOAuth(provider),
    onSuccess: (res) => {
      if (res.data.code !== 0) {
        toast.error(res.data.msg || t('settings.oauthUnbindFailed'));
        return;
      }
      toast.success(t('settings.oauthUnbound'));
      refetchBindings();
    },
    onError: () => toast.error(t('settings.oauthUnbindFailed')),
  });

  const profileFieldsChanged = (nickname !== (user?.nickname ?? '')) || (email !== (user?.email ?? ''));
  const avatarChanged = avatarImage !== (preferencesData?.avatarImage || '');
  const hasProfileChanges = profileFieldsChanged || avatarChanged;
  const emailChanged = email.trim() !== (user?.email ?? '');

  const handleProfileSubmit = () => {
    if (!user) return;
    if (emailChanged && !emailCode.trim()) {
      toast.error(t('settings.emailCodeRequired'));
      return;
    }
    profileMutation.mutate();
  };

  const handlePasswordSubmit = () => {
    setError('');
    if (newPassword.length < 6) { setError(t('settings.passwordTooShort')); return; }
    if (newPassword !== confirmPassword) { setError(t('settings.passwordMismatch')); return; }
    passwordMutation.mutate();
  };

  const handleSendEmailCode = () => {
    if (!email.trim()) {
      toast.error(t('settings.emailCodeRequired'));
      return;
    }
    sendEmailCodeMutation.mutate();
  };

  return (
    <div className="page-shell">
      <section className="page-heading">
        <div>
          <h1>{t('nav.settings')}</h1>
          <p>{t('settings.profileSubtitle')}</p>
        </div>
      </section>

      <div className="settings-grid">
        <div className="page-shell">
          <Card
            bordered={false}
            shadow={false}
            title={<Space align="center"><UserSettingIcon />{t('settings.profileTitle')}</Space>}
          >
            <div className="settings-profile">
              <Avatar username={displayName} email={user?.email} image={avatarImage} size={56} textClassName="text-xl" />
              <div>
                <strong>{displayName}</strong>
                <span>{user?.email || t('common.noEmailSet')}</span>
                <Tag theme="primary" variant="light">{t(roleLabelKey(user?.role))}</Tag>
              </div>
            </div>

            <Form layout="vertical" colon={false} requiredMark={false} className="settings-form" onSubmit={({ e }) => { e?.preventDefault(); handleProfileSubmit(); }}>
              <Form.FormItem label={t('settings.avatarImageUrl')} tips={t('settings.avatarImageHint')}>
                <div className="settings-background-input">
                  <Input
                    clearable
                    value={avatarImage}
                    onChange={(value) => setAvatarImage(String(value))}
                    placeholder={t('settings.avatarImagePlaceholder')}
                  />
                  {avatarImage && (
                    <Button type="button" shape="square" variant="outline" icon={<ClearIcon />} onClick={() => setAvatarImage('')} />
                  )}
                </div>
              </Form.FormItem>
              <Form.FormItem label={t('settings.nickname')}>
                <Input clearable value={nickname} onChange={(value) => setNickname(String(value))} placeholder={t('settings.nicknamePlaceholder')} />
              </Form.FormItem>
              <Form.FormItem label={t('settings.email')}>
                <Input clearable value={email} onChange={(value) => setEmail(String(value))} placeholder={t('settings.emailPlaceholder')} />
              </Form.FormItem>
              {emailChanged && (
                <Form.FormItem label={t('settings.emailCode')}>
                  <Space>
                    <Input value={emailCode} onChange={(value) => setEmailCode(String(value))} placeholder={t('settings.emailCodePlaceholder')} />
                    <Button variant="outline" loading={sendEmailCodeMutation.isPending} onClick={handleSendEmailCode}>
                      {t('settings.sendEmailCode')}
                    </Button>
                  </Space>
                </Form.FormItem>
              )}
              <Space className="record-form__actions">
                <Button type="submit" theme="primary" loading={profileMutation.isPending} disabled={!hasProfileChanges}>
                  {t('settings.updateProfile')}
                </Button>
              </Space>
            </Form>
          </Card>

          <Card
            bordered={false}
            shadow={false}
            title={<Space align="center"><LockOnIcon />{t('settings.changePassword')}</Space>}
          >
            <div className="page-shell">
              {success && <Alert theme="success" message={t('settings.passwordChanged')} />}
              {error && <Alert theme="error" message={error} />}
              <Form layout="vertical" colon={false} requiredMark={false} onSubmit={({ e }) => { e?.preventDefault(); handlePasswordSubmit(); }}>
                <Form.FormItem label={t('settings.currentPassword')}>
                  <Input type="password" value={oldPassword} onChange={(value) => setOldPassword(String(value))} placeholder={t('settings.currentPasswordPlaceholder')} />
                </Form.FormItem>
                <Form.FormItem label={t('settings.newPassword')}>
                  <Input type="password" value={newPassword} onChange={(value) => setNewPassword(String(value))} placeholder={t('settings.newPasswordPlaceholder')} />
                </Form.FormItem>
                <Form.FormItem label={t('settings.confirmPassword')}>
                  <Input type="password" value={confirmPassword} onChange={(value) => setConfirmPassword(String(value))} placeholder={t('settings.confirmPasswordPlaceholder')} />
                </Form.FormItem>
                <Space className="record-form__actions">
                  <Button type="submit" theme="primary" loading={passwordMutation.isPending}>
                    {t('settings.updatePassword')}
                  </Button>
                </Space>
              </Form>
            </div>
          </Card>
        </div>

        <div className="page-shell">
          <Card bordered={false} shadow={false} title={t('settings.displayScale')}>
            <div className="settings-switch-row settings-scale-row">
              <div>
                <strong>{t('settings.displayScale')}</strong>
                <span>{t('settings.displayScaleDesc')}</span>
              </div>
              <Select
                className="settings-scale-select"
                value={uiScale}
                options={[
                  { label: t('settings.scaleLarge'), value: 'large' },
                  { label: t('settings.scaleSmall'), value: 'small' },
                ]}
                onChange={(value) => setUiScale(String(value) as UiScale)}
              />
            </div>
          </Card>

          <Card bordered={false} shadow={false} title={t('settings.cloudflareTunnels')}>
            <div className="settings-switch-row">
              <div>
                <strong>{t('settings.showTunnels')}</strong>
                <span>{t('settings.showTunnelsDesc')}</span>
              </div>
              <Switch value={showTunnels} onChange={(checked) => setShowTunnels(Boolean(checked))} />
            </div>
          </Card>

          <Card
            bordered={false}
            shadow={false}
            title={<Space align="center"><ImageIcon />{t('settings.backgroundImage')}</Space>}
          >
            <Form layout="vertical" colon={false} requiredMark={false} className="page-shell">
              <Form.FormItem label={t('settings.backgroundImageUrl')} tips={t('settings.backgroundImageHint')}>
                <div className="settings-background-input">
                  <Input
                    clearable
                    value={backgroundImage}
                    onChange={(value) => setBackgroundImage(String(value))}
                    placeholder={t('settings.backgroundImagePlaceholder')}
                  />
                  {backgroundImage && (
                    <Button shape="square" variant="outline" icon={<ClearIcon />} onClick={() => setBackgroundImage('')} />
                  )}
                </div>
              </Form.FormItem>
              {backgroundImage && (
                <div className="settings-image-preview">
                  <img
                    src={backgroundImage}
                    alt="Background preview"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23f3f4f6"/%3E%3Ctext x="50" y="50" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="12"%3EInvalid Image%3C/text%3E%3C/svg%3E';
                    }}
                  />
                </div>
              )}
              <Space className="record-form__actions">
                <Button
                  theme="primary"
                  loading={updateBackgroundMutation.isPending}
                  disabled={backgroundImage === (preferencesData?.backgroundImage || '')}
                  onClick={() => updateBackgroundMutation.mutate(backgroundImage)}
                >
                  {t('settings.updateBackgroundImage')}
                </Button>
              </Space>
            </Form>
          </Card>

          <Card bordered={false} shadow={false} title={t('settings.oauthBindingTitle')}>
            {!oauthEnabled ? (
              <p className="page-muted">{t('settings.oauthDisabledTip')}</p>
            ) : (
              <div className="page-shell">
                <p className="page-muted">{t('settings.oauthBindingDesc', { provider: oauthProviderName })}</p>
                {oauthProviders.length > 1 && (
                  <Select
                    value={selectedOauthProvider}
                    options={oauthProviders.map((provider) => ({ label: provider.providerName, value: provider.key }))}
                    onChange={(value) => setSelectedOauthProvider(String(Array.isArray(value) ? value[0] : value) as 'custom' | 'logto')}
                  />
                )}
                <Space>
                  <Button theme="primary" loading={bindOauthMutation.isPending} onClick={() => bindOauthMutation.mutate()}>
                    {t('settings.bindOauth')}
                  </Button>
                </Space>
                <div className="page-list">
                  {oauthBindings.length === 0 ? (
                    <p className="page-muted">{t('settings.noOauthBound')}</p>
                  ) : oauthBindings.map((binding) => (
                    <div key={`${binding.provider}:${binding.subject}`} className="page-list-item">
                      <div className="page-list-item__main">
                        <strong>{binding.provider}</strong>
                        <span>{binding.email || binding.subject}</span>
                      </div>
                      <Button
                        variant="outline"
                        theme="danger"
                        size="small"
                        loading={unbindOauthMutation.isPending}
                        onClick={() => unbindOauthMutation.mutate(binding.provider)}
                      >
                        {t('settings.unbindOauth')}
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
