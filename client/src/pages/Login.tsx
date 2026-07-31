import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loading } from 'tdesign-react';
import { useAuth } from '../contexts/AuthContext';
import { useI18n } from '../contexts/I18nContext';
import { initApi } from '../api';
import LoginCard from './LoginCard';
import './Login.css';

export function Login() {
  const year = new Date().getFullYear();
  const { user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('return_to') || '/dash';
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (user) {
      navigate(returnTo, { replace: true });
      return;
    }
    initApi.status()
      .then((res) => {
        if (!res.data.data.initialized) {
          navigate('/setup');
        }
      })
      .catch(() => {})
      .finally(() => setChecking(false));
  }, [navigate, user]);

  if (checking) {
    return (
      <>
        <main className="login-page login-page--checking">
          <Loading loading size="large" text={t('common.loading')} />
        </main>
        <footer className="login-footer">&copy;{year} HiPM-Tech &middot; All Rights Reserved.</footer>
      </>
    );
  }

  return (
    <>
      <main className="login-page">
        <LoginCard />
      </main>
      <footer className="login-footer">&copy;{year} HiPM-Tech &middot; All Rights Reserved.</footer>
    </>
  );
}
