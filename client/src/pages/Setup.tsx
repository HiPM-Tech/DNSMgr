import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Zap, Database, User, CheckCircle, AlertCircle, ChevronRight, ChevronLeft, Trash2, DatabaseZap } from 'lucide-react';
import { initApi } from '../api';
import { useI18n } from '../contexts/I18nContext';

type Step = 'database' | 'dataChoice' | 'admin' | 'complete';

interface DbConfig {
  type: 'sqlite' | 'mysql' | 'postgresql';
  sqlite: { path: string };
  mysql: { host: string; port: number; database: string; user: string; password: string; ssl: boolean };
  postgresql: { host: string; port: number; database: string; user: string; password: string; ssl: boolean };
}

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
    // Check if system is already initialized
    initApi.status().then((res) => {
      if (res.data.data.initialized) {
        navigate('/login');
      }
    }).catch(() => {
      // Ignore error, stay on setup page
    });
  }, [navigate]);

  const testDatabase = async () => {
    setLoading(true);
    setError('');
    setHasExistingData(false);
    try {
      const config = {
        type: dbConfig.type,
        ...(dbConfig.type === 'sqlite' && { sqlite: dbConfig.sqlite }),
        ...(dbConfig.type === 'mysql' && { mysql: dbConfig.mysql }),
        ...(dbConfig.type === 'postgresql' && { postgresql: dbConfig.postgresql }),
      };
      const res = await initApi.testDb(config);
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

  const initDatabase = async (reset: boolean = false) => {
    setLoading(true);
    setError('');
    try {
      const config = {
        type: dbConfig.type,
        ...(dbConfig.type === 'sqlite' && { sqlite: dbConfig.sqlite }),
        ...(dbConfig.type === 'mysql' && { mysql: dbConfig.mysql }),
        ...(dbConfig.type === 'postgresql' && { postgresql: dbConfig.postgresql }),
        reset,
      };
      const res = await initApi.initDatabase(config);
      if (res.data.code === 0) {
        // Check if backend indicates we should skip to user creation
        if (res.data.data?.skipToUserCreation) {
          // Database already initialized, skip to admin creation
          setCurrentStep('admin');
        } else if (reset) {
          // If reset, go to admin step
          setCurrentStep('admin');
        } else {
          // Normal initialization, go to admin step
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
    // Validate
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

  const renderDatabaseStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
          <Database className="w-8 h-8 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('setup.dbTitle')}</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">{t('setup.dbSubtitle')}</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('setup.dbType')}</label>
          <div className="grid grid-cols-3 gap-3">
            {(['sqlite', 'mysql', 'postgresql'] as const).map((type) => (
              <button
                key={type}
                onClick={() => {
                  setDbConfig({ ...dbConfig, type });
                  setDbTested(false);
                }}
                className={`px-4 py-3 rounded-lg border text-sm font-medium transition ${
                  dbConfig.type === type
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {t(`setup.dbTypes.${type}`)}
              </button>
            ))}
          </div>
        </div>

        {dbConfig.type === 'sqlite' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('setup.dbPath')}</label>
            <input
              type="text"
              value={dbConfig.sqlite.path}
              onChange={(e) => {
                setDbConfig({ ...dbConfig, sqlite: { path: e.target.value } });
                setDbTested(false);
              }}
              className="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="./data/dnsmgr.db"
            />
          </div>
        )}

        {dbConfig.type === 'mysql' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('setup.dbHost')}</label>
                <input
                  type="text"
                  value={dbConfig.mysql.host}
                  onChange={(e) => {
                    setDbConfig({ ...dbConfig, mysql: { ...dbConfig.mysql, host: e.target.value } });
                    setDbTested(false);
                  }}
                  className="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('setup.dbPort')}</label>
                <input
                  type="number"
                  value={dbConfig.mysql.port}
                  onChange={(e) => {
                    setDbConfig({ ...dbConfig, mysql: { ...dbConfig.mysql, port: parseInt(e.target.value) || 3306 } });
                    setDbTested(false);
                  }}
                  className="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('setup.dbName')}</label>
              <input
                type="text"
                value={dbConfig.mysql.database}
                onChange={(e) => {
                  setDbConfig({ ...dbConfig, mysql: { ...dbConfig.mysql, database: e.target.value } });
                  setDbTested(false);
                }}
                className="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('setup.dbUser')}</label>
                <input
                  type="text"
                  value={dbConfig.mysql.user}
                  onChange={(e) => {
                    setDbConfig({ ...dbConfig, mysql: { ...dbConfig.mysql, user: e.target.value } });
                    setDbTested(false);
                  }}
                  className="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('setup.dbPassword')}</label>
                <input
                  type="password"
                  value={dbConfig.mysql.password}
                  onChange={(e) => {
                    setDbConfig({ ...dbConfig, mysql: { ...dbConfig.mysql, password: e.target.value } });
                    setDbTested(false);
                  }}
                  className="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {dbConfig.type === 'postgresql' && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('setup.dbHost')}</label>
                <input
                  type="text"
                  value={dbConfig.postgresql.host}
                  onChange={(e) => {
                    setDbConfig({ ...dbConfig, postgresql: { ...dbConfig.postgresql, host: e.target.value } });
                    setDbTested(false);
                  }}
                  className="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('setup.dbPort')}</label>
                <input
                  type="number"
                  value={dbConfig.postgresql.port}
                  onChange={(e) => {
                    setDbConfig({ ...dbConfig, postgresql: { ...dbConfig.postgresql, port: parseInt(e.target.value) || 5432 } });
                    setDbTested(false);
                  }}
                  className="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('setup.dbName')}</label>
              <input
                type="text"
                value={dbConfig.postgresql.database}
                onChange={(e) => {
                  setDbConfig({ ...dbConfig, postgresql: { ...dbConfig.postgresql, database: e.target.value } });
                  setDbTested(false);
                }}
                className="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('setup.dbUser')}</label>
                <input
                  type="text"
                  value={dbConfig.postgresql.user}
                  onChange={(e) => {
                    setDbConfig({ ...dbConfig, postgresql: { ...dbConfig.postgresql, user: e.target.value } });
                    setDbTested(false);
                  }}
                  className="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('setup.dbPassword')}</label>
                <input
                  type="password"
                  value={dbConfig.postgresql.password}
                  onChange={(e) => {
                    setDbConfig({ ...dbConfig, postgresql: { ...dbConfig.postgresql, password: e.target.value } });
                    setDbTested(false);
                  }}
                  className="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={testDatabase}
            disabled={loading}
            className={`flex-1 py-2.5 border rounded-lg text-sm font-semibold transition-colors disabled:opacity-60 ${
              dbTested
                ? hasExistingData
                  ? 'border-yellow-500 text-yellow-700 bg-yellow-50'
                  : 'border-green-500 text-green-700 bg-green-50'
                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
            }`}
          >
            {dbTested ? (
              <span className="flex items-center justify-center gap-2">
                {hasExistingData ? (
                  <>
                    <AlertCircle className="w-4 h-4" />
                    {t('setup.dbTestedWithData')}
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    {t('setup.dbTested')}
                  </>
                )}
              </span>
            ) : (
              t('setup.testConnection')
            )}
          </button>
          <button
            onClick={() => {
              if (hasExistingData) {
                setCurrentStep('dataChoice');
              } else {
                initDatabase(false);
              }
            }}
            disabled={loading || !dbTested}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {t('setup.nextStep')}
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );

  const renderDataChoiceStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-yellow-100 rounded-full mb-4">
          <DatabaseZap className="w-8 h-8 text-yellow-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('setup.dataChoiceTitle')}</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">{t('setup.dataChoiceSubtitle')}</p>
      </div>

      <div className="space-y-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-800">{t('setup.existingDataWarning')}</p>
              <p className="text-sm text-yellow-700 mt-1">{t('setup.existingDataDescription')}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <button
            onClick={() => initDatabase(true)}
            disabled={loading}
            className="p-4 border-2 border-red-200 rounded-lg hover:border-red-300 hover:bg-red-50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{t('setup.resetDatabase')}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('setup.resetDatabaseDesc')}</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => initDatabase(false)}
            disabled={loading}
            className="p-4 border-2 border-blue-200 rounded-lg hover:border-blue-300 hover:bg-blue-50 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <Database className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{t('setup.keepData')}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('setup.keepDataDesc')}</p>
              </div>
            </div>
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <button
          onClick={() => setCurrentStep('database')}
          disabled={loading}
          className="w-full py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          {t('setup.prevStep')}
        </button>
      </div>
    </div>
  );

  const renderAdminStep = () => (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
          <User className="w-8 h-8 text-blue-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">{t('setup.adminTitle')}</h2>
        <p className="text-gray-500 dark:text-gray-400 mt-2">{t('setup.adminSubtitle')}</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('setup.username')}</label>
          <input
            type="text"
            value={adminInfo.username}
            onChange={(e) => setAdminInfo({ ...adminInfo, username: e.target.value })}
            placeholder={t('setup.usernamePlaceholder')}
            className="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('setup.usernameHint')}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('setup.email')}</label>
          <input
            type="email"
            value={adminInfo.email}
            onChange={(e) => setAdminInfo({ ...adminInfo, email: e.target.value })}
            placeholder={t('setup.emailPlaceholder')}
            className="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('setup.password')}</label>
          <input
            type="password"
            value={adminInfo.password}
            onChange={(e) => setAdminInfo({ ...adminInfo, password: e.target.value })}
            placeholder={t('setup.passwordPlaceholder')}
            className="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('setup.passwordHint')}</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{t('setup.confirmPassword')}</label>
          <input
            type="password"
            value={adminInfo.confirmPassword}
            onChange={(e) => setAdminInfo({ ...adminInfo, confirmPassword: e.target.value })}
            placeholder={t('setup.confirmPasswordPlaceholder')}
            className="w-full px-3.5 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-white bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => setCurrentStep('database')}
            className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-semibold rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            {t('setup.prevStep')}
          </button>
          <button
            onClick={createAdmin}
            disabled={loading}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {t('setup.createAdmin')}
          </button>
        </div>
      </div>
    </div>
  );

  const renderCompleteStep = () => (
    <div className="text-center py-8">
      <div className="inline-flex items-center justify-center w-20 h-20 bg-green-100 rounded-full mb-6">
        <CheckCircle className="w-10 h-10 text-green-600" />
      </div>
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{t('setup.completeTitle')}</h2>
      <p className="text-gray-500 dark:text-gray-400 mb-8">{t('setup.completeSubtitle')}</p>
      <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6">
        {t('setup.smtpRecommended')}
      </p>
      <button
        onClick={() => navigate('/login')}
        className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors"
      >
        {t('setup.goToLogin')}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg p-8">
        <div className="flex flex-col items-center mb-8">
          <div className="p-3 bg-blue-600 rounded-xl mb-3">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">DNSMgr</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('setup.subtitle')}</p>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className={`w-3 h-3 rounded-full ${currentStep === 'database' ? 'bg-blue-600' : 'bg-blue-300'}`} />
          <div className="w-8 h-0.5 bg-gray-200">
            <div className={`h-full bg-blue-600 transition-all ${currentStep !== 'database' ? 'w-full' : 'w-0'}`} />
          </div>
          <div className={`w-3 h-3 rounded-full ${currentStep === 'admin' ? 'bg-blue-600' : currentStep === 'complete' ? 'bg-blue-300' : 'bg-gray-200'}`} />
          <div className="w-8 h-0.5 bg-gray-200">
            <div className={`h-full bg-blue-600 transition-all ${currentStep === 'complete' ? 'w-full' : 'w-0'}`} />
          </div>
          <div className={`w-3 h-3 rounded-full ${currentStep === 'complete' ? 'bg-green-500' : 'bg-gray-200'}`} />
        </div>

        {currentStep === 'database' && renderDatabaseStep()}
        {currentStep === 'dataChoice' && renderDataChoiceStep()}
        {currentStep === 'admin' && renderAdminStep()}
        {currentStep === 'complete' && renderCompleteStep()}
      </div>
    </div>
  );
}
