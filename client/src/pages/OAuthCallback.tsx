import { useEffect, useState, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { authApi } from '../api';
import { useToast } from '../hooks/useToast';

// 清理旧的OAuth localStorage条目
function cleanupOldOAuthEntries() {
  const prefix = 'oauth_callback_';
  const entries = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) {
      entries.push({ key, timestamp: localStorage.getItem(key)?.includes('timestamp:') ? 
        parseInt(localStorage.getItem(key)!.split('timestamp:')[1]) || 0 : 0 });
    }
  }
  
  // 按时间戳排序（旧的在前）
  entries.sort((a, b) => a.timestamp - b.timestamp);
  
  // 删除除最新10个以外的所有条目
  if (entries.length > 10) {
    for (let i = 0; i < entries.length - 10; i++) {
      localStorage.removeItem(entries[i].key);
    }
  }
}

export function OAuthCallback() {
  const { loginWithToken } = useAuth();
  const { t } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(true);
  const [succeeded, setSucceeded] = useState(false);
  const hasProcessed = useRef(false);

  useEffect(() => {
    // 防止重复处理
    if (hasProcessed.current) return;
    
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
      setError(t('login.oauthMissingParams'));
      setProcessing(false);
      return;
    }

    hasProcessed.current = true; // 标记为已处理
    
    // 检查localStorage，防止页面刷新后重复处理
    const storageKey = `oauth_callback_${code}_${state}`;
    const existingStatus = localStorage.getItem(storageKey);
    
    if (existingStatus) {
      // 提取状态（去掉时间戳）
      const status = existingStatus.split(':')[0];
      
      // 根据不同的状态进行处理
      if (status === 'success_bind' || status === 'success_login' || 
          status === 'redirected') {
        // 已经成功处理过，直接跳转
        navigate('/settings');
        return;
      } else if (status === 'failed_permanent') {
        // 之前永久失败，显示错误
        setError('Previous OAuth attempt failed. Please try again from the beginning.');
        setProcessing(false);
        return;
      } else if (status === 'processing') {
        // 正在处理中，等待一小段时间
        setTimeout(() => {
          // 检查状态是否变化
          const updatedStatus = localStorage.getItem(storageKey);
          if (updatedStatus) {
            const updatedStatusValue = updatedStatus.split(':')[0];
            if (updatedStatusValue !== 'processing') {
              // 状态已更新，根据新状态处理
              if (updatedStatusValue === 'success_bind' || updatedStatusValue === 'success_login' || 
                  updatedStatusValue === 'redirected') {
                navigate('/settings');
              }
            }
          }
        }, 1000);
      }
      // 其他状态（如'failed'）可以继续尝试
    }
    
    // 标记为正在处理（带时间戳）
    const timestamp = Date.now();
    localStorage.setItem(storageKey, `processing:timestamp:${timestamp}`);
    
    // 清理旧的localStorage条目（最多保留10个）
    cleanupOldOAuthEntries();

    const processCallback = (retryCount = 0) => {
      setProcessing(true);
      authApi.oauthCallback(code, state)
        .then((res) => {
          if (res.data.code !== 0) {
            setError(res.data.msg || t('login.oauthFailed'));
            localStorage.setItem(storageKey, `failed:timestamp:${Date.now()}`); // 标记为失败
            return;
          }

          setSucceeded(true); // 标记为成功
          const { token, user, mode } = res.data.data;
          
          if (mode === 'bind') {
            localStorage.setItem(storageKey, `success_bind:timestamp:${Date.now()}`); // 标记为绑定成功
            toast.success(t('settings.oauthBindSuccess'));
            navigate('/settings');
            return;
          }

          if (token && user) {
            localStorage.setItem(storageKey, `success_login:timestamp:${Date.now()}`); // 标记为登录成功
            loginWithToken(token, user);
            navigate('/');
            return;
          }

          localStorage.setItem(storageKey, `redirected:timestamp:${Date.now()}`); // 标记为重定向
          navigate('/settings');
        })
        .catch((err: any) => {
          // 处理Axios错误，提取服务器返回的错误消息
          let errorMessage = t('login.oauthFailed');
          
          if (err.response?.data?.msg) {
            errorMessage = err.response.data.msg;
          } else if (err.response?.status === 400) {
            // 400错误：state无效或已过期
            // 检查是否已经处理过（可能是其他请求已经成功）
            // 等待2秒后重试，最多重试2次
            if (retryCount < 2) {
              const nextRetryCount = retryCount + 1;
              errorMessage = `Processing OAuth callback, please wait... (${nextRetryCount}/2)`;
              setError(errorMessage);
              setTimeout(() => {
                processCallback(nextRetryCount);
              }, 2000);
              return;
            } else {
              errorMessage = 'OAuth state invalid or expired. Please try again from the beginning.';
            }
          } else if (err.response?.status === 429) {
            // 429错误：请求正在处理中，等待后重试（最多重试3次）
            if (retryCount < 3) {
              const nextRetryCount = retryCount + 1;
              errorMessage = `Request is being processed, retrying in 2 seconds... (${nextRetryCount}/3)`;
              setError(errorMessage);
              setTimeout(() => {
                processCallback(nextRetryCount);
              }, 2000);
              return;
            } else {
              errorMessage = 'Request is still being processed. Please try again later.';
            }
          } else if (err.message) {
            errorMessage = err.message;
          }
          
          setError(errorMessage);
          console.error('OAuth callback failed:', err);
          
          // 在最终失败时清理localStorage（除了429和400重试的情况）
          if (!(err.response?.status === 429 && retryCount < 3) && 
              !(err.response?.status === 400 && retryCount < 2)) {
            localStorage.setItem(storageKey, `failed_permanent:timestamp:${Date.now()}`);
          }
        })
        .finally(() => {
          if (retryCount === 0) {
            setProcessing(false);
          }
        });
    };

    processCallback();
  }, [loginWithToken, navigate, searchParams, t, toast]);

  if (error && !succeeded) {
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
