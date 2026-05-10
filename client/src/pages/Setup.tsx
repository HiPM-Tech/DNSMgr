import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, Form, Input, Radio, Steps } from 'tdesign-react';
import {
  CheckCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  DataBaseIcon,
  DeleteIcon,
  ErrorCircleIcon,
  ThunderIcon,
  UserIcon,
} from 'tdesign-icons-react';
import { initApi } from '../api';
import { useI18n } from '../contexts/I18nContext';

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

export function Setup() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<Step>('database');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [dbTested, setDbTested] = useState(false);
  const [hasExistingData, setHasExistingData] = useState(false);

  const [dbConfig, setDbConfig] = useState<DbConfig>({
    type: 'sqlite',
    sqlite: { path: './data/dnsmgr.db' },
    mysql: { host: 'localhost', port: 3306, database: 'dnsmgr', user: 'root', password: '', ssl: false },
    postgresql: { host: 'localhost', port: 5432, database: 'dnsmgr', user: 'postgres', password: '', ssl: false },
  });

  const [adminInfo, setAdminInfo] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  useEffect(() => {
    initApi.status().then((res) => {
      if (res.data.data.initialized) {
        navigate('/login');
      }
    }).catch(() => undefined);
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

  const renderStepIntro = (icon: ReactNode, title: string, subtitle: string) => (
    <div className="setup-intro">
      <div className="setup-intro__icon">{icon}</div>
      <h2>{title}</h2>
      <p>{subtitle}</p>
    </div>
  );

  const renderDbConnectionFields = () => {
    if (dbConfig.type === 'sqlite') {
      return (
        <Form.FormItem label={t('setup.dbPath')}>
          <Input
            value={dbConfig.sqlite.path}
            placeholder="./data/dnsmgr.db"
            onChange={(value) => resetDbTest({ ...dbConfig, sqlite: { path: String(value) } })}
          />
        </Form.FormItem>
      );
    }

    const isMysql = dbConfig.type === 'mysql';
    const key = isMysql ? 'mysql' : 'postgresql';
    const config = dbConfig[key];
    const defaultPort = isMysql ? 3306 : 5432;

    return (
      <div className="setup-form-grid">
        <Form.FormItem label={t('setup.dbHost')}>
          <Input
            value={config.host}
            onChange={(value) => resetDbTest({ ...dbConfig, [key]: { ...config, host: String(value) } })}
          />
        </Form.FormItem>
        <Form.FormItem label={t('setup.dbPort')}>
          <Input
            type="number"
            value={String(config.port)}
            onChange={(value) => resetDbTest({ ...dbConfig, [key]: { ...config, port: parseInt(String(value), 10) || defaultPort } })}
          />
        </Form.FormItem>
        <Form.FormItem label={t('setup.dbName')}>
          <Input
            value={config.database}
            onChange={(value) => resetDbTest({ ...dbConfig, [key]: { ...config, database: String(value) } })}
          />
        </Form.FormItem>
        <Form.FormItem label={t('setup.dbUser')}>
          <Input
            value={config.user}
            onChange={(value) => resetDbTest({ ...dbConfig, [key]: { ...config, user: String(value) } })}
          />
        </Form.FormItem>
        <Form.FormItem label={t('setup.dbPassword')}>
          <Input
            type="password"
            value={config.password}
            onChange={(value) => resetDbTest({ ...dbConfig, [key]: { ...config, password: String(value) } })}
          />
        </Form.FormItem>
      </div>
    );
  };

  const renderDatabaseStep = () => (
    <div className="page-shell">
      {renderStepIntro(<DataBaseIcon />, t('setup.dbTitle'), t('setup.dbSubtitle'))}
      <Form layout="vertical" colon={false} requiredMark={false}>
        <Form.FormItem label={t('setup.dbType')}>
          <Radio.Group
            value={dbConfig.type}
            variant="primary-filled"
            options={(['sqlite', 'mysql', 'postgresql'] as const).map((type) => ({ label: t(`setup.dbTypes.${type}`), value: type }))}
            onChange={(value) => resetDbTest({ ...dbConfig, type: value as DbConfig['type'] })}
          />
        </Form.FormItem>
        {renderDbConnectionFields()}
      </Form>

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
      {renderStepIntro(<ErrorCircleIcon />, t('setup.dataChoiceTitle'), t('setup.dataChoiceSubtitle'))}
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
      {renderStepIntro(<UserIcon />, t('setup.adminTitle'), t('setup.adminSubtitle'))}
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
      {renderStepIntro(<CheckCircleIcon />, t('setup.completeTitle'), t('setup.completeSubtitle'))}
      <Alert theme="warning" message={t('setup.smtpRecommended')} />
      <Button block theme="primary" onClick={() => navigate('/login')}>
        {t('setup.goToLogin')}
      </Button>
    </div>
  );

  return (
    <div className="setup-shell">
      <Card bordered={false} shadow className="setup-card">
        <div className="setup-brand">
          <div className="setup-brand__icon"><ThunderIcon /></div>
          <h1>DNSMgr</h1>
          <p>{t('setup.subtitle')}</p>
        </div>

        <Steps current={stepIndex[currentStep]} className="setup-steps">
          <Steps.StepItem title={t('setup.dbTitle')} />
          <Steps.StepItem title={t('setup.dataChoiceTitle')} />
          <Steps.StepItem title={t('setup.adminTitle')} />
          <Steps.StepItem title={t('setup.completeTitle')} />
        </Steps>

        {currentStep === 'database' && renderDatabaseStep()}
        {currentStep === 'dataChoice' && renderDataChoiceStep()}
        {currentStep === 'admin' && renderAdminStep()}
        {currentStep === 'complete' && renderCompleteStep()}
      </Card>
    </div>
  );
}
