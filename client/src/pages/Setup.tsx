import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Form, Input } from 'tdesign-react';
import {
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DataBaseIcon,
  DeleteIcon,
  ErrorCircleIcon,
  UserIcon,
} from 'tdesign-icons-react';
import { initApi } from '../api';
import type { InitDbConfig } from '../api';
import { useI18n } from '../contexts/I18nContext';
import './Login.css';
import './Setup.css';

type Step = 'database' | 'dataChoice' | 'admin' | 'complete';

interface DbConfig {
  type: 'sqlite' | 'mysql' | 'postgresql';
  sqlite: { path: string };
  mysql: { host: string; port: number; database: string; user: string; password: string; ssl: boolean };
  postgresql: { host: string; port: number; database: string; user: string; password: string; ssl: boolean };
}

const stepIndex: Record<Step, number> = {
  database: 0,
  dataChoice: 1,
  admin: 2,
  complete: 3,
};

const DEFAULT_DB_CONFIG: DbConfig = {
  type: 'sqlite',
  sqlite: { path: './data/dnsmgr.db' },
  mysql: { host: 'localhost', port: 3306, database: 'dnsmgr', user: 'root', password: '', ssl: false },
  postgresql: { host: 'localhost', port: 5432, database: 'dnsmgr', user: 'postgres', password: '', ssl: false },
};

const setupField = (label: string, control: ReactNode) => (
  <div className="settings-control-field">
    <span>{label}</span>
    {control}
  </div>
);

const databaseTypes: Array<{
  type: DbConfig['type'];
  icon: ReactNode;
  description: string;
}> = [
  { type: 'sqlite', icon: <DataBaseIcon />, description: 'Local file database' },
  { type: 'mysql', icon: <DataBaseIcon />, description: 'MySQL compatible server' },
  { type: 'postgresql', icon: <DataBaseIcon />, description: 'PostgreSQL server' },
];

const normalizeDbConfig = (config?: Partial<InitDbConfig>): DbConfig => {
  const type = config?.type && ['sqlite', 'mysql', 'postgresql'].includes(config.type)
    ? config.type
    : DEFAULT_DB_CONFIG.type;

  return {
    type,
    sqlite: {
      path: String(config?.sqlite?.path || DEFAULT_DB_CONFIG.sqlite.path),
    },
    mysql: {
      host: String(config?.mysql?.host || DEFAULT_DB_CONFIG.mysql.host),
      port: Number(config?.mysql?.port) || DEFAULT_DB_CONFIG.mysql.port,
      database: String(config?.mysql?.database || DEFAULT_DB_CONFIG.mysql.database),
      user: String(config?.mysql?.user || DEFAULT_DB_CONFIG.mysql.user),
      password: String(config?.mysql?.password || DEFAULT_DB_CONFIG.mysql.password),
      ssl: Boolean(config?.mysql?.ssl),
    },
    postgresql: {
      host: String(config?.postgresql?.host || DEFAULT_DB_CONFIG.postgresql.host),
      port: Number(config?.postgresql?.port) || DEFAULT_DB_CONFIG.postgresql.port,
      database: String(config?.postgresql?.database || DEFAULT_DB_CONFIG.postgresql.database),
      user: String(config?.postgresql?.user || DEFAULT_DB_CONFIG.postgresql.user),
      password: String(config?.postgresql?.password || DEFAULT_DB_CONFIG.postgresql.password),
      ssl: Boolean(config?.postgresql?.ssl),
    },
  };
};

export function Setup() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<Step>('database');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dbTested, setDbTested] = useState(false);
  const [hasExistingData, setHasExistingData] = useState(false);

  const [dbConfig, setDbConfig] = useState<DbConfig>(DEFAULT_DB_CONFIG);

  const [adminInfo, setAdminInfo] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const setupSteps = [
    { key: 'database' as const, icon: <DataBaseIcon />, title: t('setup.dbTitle'), subtitle: t('setup.dbSubtitle') },
    { key: 'dataChoice' as const, icon: <ErrorCircleIcon />, title: t('setup.dataChoiceTitle'), subtitle: t('setup.dataChoiceSubtitle') },
    { key: 'admin' as const, icon: <UserIcon />, title: t('setup.adminTitle'), subtitle: t('setup.adminSubtitle') },
    { key: 'complete' as const, icon: <CheckCircleIcon />, title: t('setup.completeTitle'), subtitle: t('setup.completeSubtitle') },
  ];
  const activeStep = setupSteps.find((step) => step.key === currentStep) ?? setupSteps[0];

  useEffect(() => {
    let active = true;

    const loadSetupState = async () => {
      try {
        const statusRes = await initApi.status();
        if (!active) return;
        if (statusRes.data.data.initialized) {
          navigate('/login');
          return;
        }
      } catch {
        // Keep setup accessible if the database is not connected yet.
      }

      try {
        const configRes = await initApi.dbConfig();
        if (!active) return;
        if (configRes.data.code === 0 && configRes.data.data) {
          setDbConfig(normalizeDbConfig(configRes.data.data));
        }
      } catch {
        // Defaults are still usable if the config endpoint is unavailable.
      }
    };

    loadSetupState();

    return () => {
      active = false;
    };
  }, [navigate]);

  const resetDbTest = (nextConfig: DbConfig) => {
    setDbConfig(nextConfig);
    setDbTested(false);
    setHasExistingData(false);
  };

  const buildDbPayload = (reset?: boolean) => ({
    type: dbConfig.type,
    ...(dbConfig.type === 'sqlite' && { sqlite: dbConfig.sqlite }),
    ...(dbConfig.type === 'mysql' && { mysql: dbConfig.mysql }),
    ...(dbConfig.type === 'postgresql' && { postgresql: dbConfig.postgresql }),
    ...(reset !== undefined && { reset }),
  });

  const testDatabase = async () => {
    setLoading(true);
    setError('');
    setHasExistingData(false);
    try {
      const res = await initApi.testDb(buildDbPayload());
      if (res.data.code === 0 && res.data.data.success) {
        setDbTested(true);
        setHasExistingData(res.data.data.hasExistingData || false);
      } else {
        setError(res.data.msg || t('setup.dbTestFailed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('setup.dbTestFailed'));
    } finally {
      setLoading(false);
    }
  };

  const initDatabase = async (reset = false) => {
    setLoading(true);
    setError('');
    try {
      const res = await initApi.initDatabase(buildDbPayload(reset));
      if (res.data.code === 0) {
        if (res.data.data?.skipToComplete) {
          setCurrentStep('complete');
        } else {
          setCurrentStep('admin');
        }
      } else {
        setError(res.data.msg || t('setup.dbInitFailed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('setup.dbInitFailed'));
    } finally {
      setLoading(false);
    }
  };

  const createAdmin = async () => {
    if (!adminInfo.username || !adminInfo.email || !adminInfo.password) {
      setError(t('setup.allFieldsRequired'));
      return;
    }
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(adminInfo.username)) {
      setError(t('setup.usernameInvalid'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminInfo.email)) {
      setError(t('setup.emailInvalid'));
      return;
    }
    if (adminInfo.password.length < 6) {
      setError(t('setup.passwordTooShort'));
      return;
    }
    if (adminInfo.password !== adminInfo.confirmPassword) {
      setError(t('setup.passwordMismatch'));
      return;
    }

    setLoading(true);
    setError('');
    try {
      const res = await initApi.createAdmin({
        username: adminInfo.username,
        email: adminInfo.email,
        password: adminInfo.password,
      });
      if (res.data.code === 0) {
        setCurrentStep('complete');
      } else {
        setError(res.data.msg || t('setup.adminCreateFailed'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('setup.adminCreateFailed'));
    } finally {
      setLoading(false);
    }
  };

  const renderDbConnectionFields = () => {
    if (dbConfig.type === 'sqlite') {
      return setupField(
        t('setup.dbPath'),
          <Input
            value={dbConfig.sqlite.path}
            placeholder="./data/dnsmgr.db"
            onChange={(value) => resetDbTest({ ...dbConfig, sqlite: { path: String(value) } })}
          />
      );
    }

    const isMysql = dbConfig.type === 'mysql';
    const key = isMysql ? 'mysql' : 'postgresql';
    const config = dbConfig[key];
    const defaultPort = isMysql ? 3306 : 5432;

    return (
      <div className="setup-form-grid">
        {setupField(t('setup.dbHost'), (
          <Input
            value={config.host}
            onChange={(value) => resetDbTest({ ...dbConfig, [key]: { ...config, host: String(value) } })}
          />
        ))}
        {setupField(t('setup.dbPort'), (
          <Input
            type="number"
            value={String(config.port)}
            onChange={(value) => resetDbTest({ ...dbConfig, [key]: { ...config, port: parseInt(String(value), 10) || defaultPort } })}
          />
        ))}
        {setupField(t('setup.dbName'), (
          <Input
            value={config.database}
            onChange={(value) => resetDbTest({ ...dbConfig, [key]: { ...config, database: String(value) } })}
          />
        ))}
        {setupField(t('setup.dbUser'), (
          <Input
            value={config.user}
            onChange={(value) => resetDbTest({ ...dbConfig, [key]: { ...config, user: String(value) } })}
          />
        ))}
        {setupField(t('setup.dbPassword'), (
          <Input
            type="password"
            value={config.password}
            onChange={(value) => resetDbTest({ ...dbConfig, [key]: { ...config, password: String(value) } })}
          />
        ))}
        {setupField(t('setup.dbSsl'), (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none' }}>
            <input
              type="checkbox"
              checked={config.ssl}
              onChange={(e) => resetDbTest({ ...dbConfig, [key]: { ...config, ssl: e.target.checked } })}
              style={{ width: 16, height: 16, cursor: 'pointer' }}
            />
            <span style={{ fontSize: 13, color: 'var(--td-text-color-secondary)' }}>{t('setup.dbSslHint')}</span>
          </label>
        ))}
      </div>
    );
  };

  const renderDatabaseStep = () => (
    <div className="page-shell">
      <div className="setup-database-form">
        {setupField(t('setup.dbType'), (
          <div className="setup-db-type-grid" role="radiogroup" aria-label={t('setup.dbType')}>
            {databaseTypes.map((item) => {
              const active = dbConfig.type === item.type;
              return (
                <button
                  key={item.type}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className={`setup-db-type-card${active ? ' is-active' : ''}`}
                  onClick={() => resetDbTest({ ...dbConfig, type: item.type })}
                >
                  <span className="setup-db-type-card__icon">{item.icon}</span>
                  <span className="setup-db-type-card__body">
                    <strong>{t(`setup.dbTypes.${item.type}`)}</strong>
                    <small>{item.description}</small>
                  </span>
                </button>
              );
            })}
          </div>
        ))}
        {renderDbConnectionFields()}
      </div>

      {error && <Alert theme="error" message={error} />}

      <div className="setup-actions">
        <Button
          variant={dbTested ? 'outline' : 'base'}
          theme={dbTested ? (hasExistingData ? 'warning' : 'success') : 'default'}
          loading={loading}
          onClick={testDatabase}
        >
          {dbTested ? (hasExistingData ? t('setup.dbTestedWithData') : t('setup.dbTested')) : t('setup.testConnection')}
        </Button>
        <Button
          theme="primary"
          icon={<ChevronRightIcon />}
          loading={loading}
          disabled={!dbTested}
          onClick={() => {
            if (hasExistingData) setCurrentStep('dataChoice');
            else initDatabase(false);
          }}
        >
          {t('setup.nextStep')}
        </Button>
      </div>
    </div>
  );

  const renderDataChoiceStep = () => (
    <div className="page-shell">
      <Alert theme="warning" title={t('setup.existingDataWarning')} message={t('setup.existingDataDescription')} />

      <div className="setup-choice-grid">
        <Button type="button" variant="outline" className="setup-choice setup-choice--danger" disabled={loading} onClick={() => initDatabase(true)}>
          <DeleteIcon />
          <span>
            <strong>{t('setup.resetDatabase')}</strong>
            <small>{t('setup.resetDatabaseDesc')}</small>
          </span>
        </Button>
        <Button type="button" variant="outline" className="setup-choice" disabled={loading} onClick={() => initDatabase(false)}>
          <DataBaseIcon />
          <span>
            <strong>{t('setup.keepData')}</strong>
            <small>{t('setup.keepDataDesc')}</small>
          </span>
        </Button>
      </div>

      {error && <Alert theme="error" message={error} />}

      <Button block variant="outline" icon={<ChevronLeftIcon />} disabled={loading} onClick={() => setCurrentStep('database')}>
        {t('setup.prevStep')}
      </Button>
    </div>
  );

  const renderAdminStep = () => (
    <div className="page-shell">
      <Form layout="vertical" colon={false} requiredMark={false} onSubmit={({ e }) => { e?.preventDefault(); createAdmin(); }}>
        <Form.FormItem label={t('setup.username')} tips={t('setup.usernameHint')}>
          <Input
            value={adminInfo.username}
            placeholder={t('setup.usernamePlaceholder')}
            onChange={(value) => setAdminInfo((info) => ({ ...info, username: String(value) }))}
          />
        </Form.FormItem>
        <Form.FormItem label={t('setup.email')}>
          <Input
            value={adminInfo.email}
            placeholder={t('setup.emailPlaceholder')}
            onChange={(value) => setAdminInfo((info) => ({ ...info, email: String(value) }))}
          />
        </Form.FormItem>
        <Form.FormItem label={t('setup.password')} tips={t('setup.passwordHint')}>
          <Input
            type="password"
            value={adminInfo.password}
            placeholder={t('setup.passwordPlaceholder')}
            onChange={(value) => setAdminInfo((info) => ({ ...info, password: String(value) }))}
          />
        </Form.FormItem>
        <Form.FormItem label={t('setup.confirmPassword')}>
          <Input
            type="password"
            value={adminInfo.confirmPassword}
            placeholder={t('setup.confirmPasswordPlaceholder')}
            onChange={(value) => setAdminInfo((info) => ({ ...info, confirmPassword: String(value) }))}
          />
        </Form.FormItem>
        {error && <Alert theme="error" message={error} />}
        <div className="setup-actions">
          <Button variant="outline" icon={<ChevronLeftIcon />} onClick={() => setCurrentStep('database')}>
            {t('setup.prevStep')}
          </Button>
          <Button type="submit" theme="primary" loading={loading}>
            {t('setup.createAdmin')}
          </Button>
        </div>
      </Form>
    </div>
  );

  const renderCompleteStep = () => (
    <div className="page-shell">
      <Alert theme="warning" message={t('setup.smtpRecommended')} />
      <Button block theme="primary" onClick={() => navigate('/login')}>
        {t('setup.goToLogin')}
      </Button>
    </div>
  );

  return (
    <main className="login-page setup-page">
      <div className="login-shell setup-login-shell">
        <section className="login-identity setup-identity" aria-label="HiDNS">
          <div className="login-brand">
            <span className="login-brand__mark">
              <img src="/favicon.ico" alt="" />
            </span>
            <div>
              <strong>HiDNS</strong>
              <span>{t('setup.subtitle')}</span>
            </div>
          </div>

          <div className="login-identity__copy setup-identity__copy">
            <h1>HiDNS Manager</h1>
            <p>{t('setup.dbSubtitle')}</p>
          </div>

          <div className="setup-progress-list" aria-label={t('setup.subtitle')}>
            {setupSteps.map((step, index) => {
              const state = step.key === currentStep ? 'is-active' : stepIndex[currentStep] > index ? 'is-done' : '';
              return (
                <div key={step.key} className={`setup-progress-item ${state}`}>
                  <span className="setup-progress-item__icon">{step.icon}</span>
                  <span className="setup-progress-item__content">
                    <strong>{step.title}</strong>
                    <small>{step.subtitle}</small>
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="login-panel setup-panel" aria-labelledby="setup-title">
          <div className="login-panel__heading setup-panel__heading">
            <span className="setup-panel__count">{String(stepIndex[currentStep] + 1).padStart(2, '0')} / 04</span>
            <h2 id="setup-title">{activeStep.title}</h2>
            <p>{activeStep.subtitle}</p>
          </div>

          <div className="setup-step-content">
            {currentStep === 'database' && renderDatabaseStep()}
            {currentStep === 'dataChoice' && renderDataChoiceStep()}
            {currentStep === 'admin' && renderAdminStep()}
            {currentStep === 'complete' && renderCompleteStep()}
          </div>
        </section>
      </div>
    </main>
  );
}
