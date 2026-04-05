import { useQueryClient } from '@tanstack/react-query';
import { RefreshCw, Globe } from 'lucide-react';
import { useI18n } from '../contexts/I18nContext';
import { TunnelList } from '../components/TunnelList';

export function Tunnels() {
  const { t } = useI18n();
  const qc = useQueryClient();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Globe className="w-6 h-6 text-blue-500" />
            Cloudflare Tunnels
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage your Cloudflare Zero Trust Tunnels</p>
        </div>
        <button
          onClick={() => qc.invalidateQueries({ queryKey: ['tunnels'] })}
          className="flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> {t('common.refresh')}
        </button>
      </div>

      <TunnelList />
    </div>
  );
}
