import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { authApi } from '../api';
import { useToast } from '../hooks/useToast';

export function OAuthCallback() {
  const { loginWithToken } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(true);

  useEffect(() => {
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
      setError(t('login.oauthMissingParams'));
      setProcessing(false);
      return;
    }

    setProcessing(true);
    authApi.oauthCallback(code, state)
      .then((res) => {
        if (res.data.code !== 0) {
          setError(res.data.msg || t('login.oauthFailed'));
          return;
        }

        const { token, user, mode } = res.data.data;
        
        if (mode === 'bind') {
          toast.success(t('settings.oauthBindSuccess'));
          navigate('/settings');
          return;
        }

        if (token && user) {
          loginWithToken(token, user);
          navigate('/');
          return;
        }

        navigate('/settings');
      })
      .catch((err: any) => {
        // 处理Axios错误，提取服务器返回的错误消息
        let errorMessage = t('login.oauthFailed');
        
        if (err.response?.data?.msg) {
          errorMessage = err.response.data.msg;
        } else if (err.response?.status === 400) {
          errorMessage = 'OAuth state invalid or expired. Please try again.';
        } else if (err.response?.status === 429) {
          errorMessage = 'Request is being processed, please wait.';
        } else if (err.message) {
          errorMessage = err.message;
        }
        
        setError(errorMessage);
        console.error('OAuth callback failed:', err);
      })
      .finally(() => {
        setProcessing(false);
      });
  }, [loginWithToken, navigate, searchParams, t, toast]);

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-md p-8 text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{t('common.error')}</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => navigate('/login')}
            className="w-full bg-blue-600 text-white rounded-md py-2 hover:bg-blue-700 transition-colors"
          >
            {t('login.signIn')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="flex flex-col items-center">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-gray-600 dark:text-gray-400">{processing ? t('common.loading') : t('common.redirecting')}</p>
      </div>
    </div>
  );
}
