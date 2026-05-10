import { useQueryClient } from '@tanstack/react-query';
import { Button } from 'tdesign-react';
import { InternetIcon, RefreshIcon } from 'tdesign-icons-react';
import { useI18n } from '../contexts/I18nContext';
import { TunnelList } from '../components/TunnelList';
import { useRealtimeData } from '../hooks/useRealtimeData';

export function Tunnels() {
  const { t } = useI18n();
  const qc = useQueryClient();

  useRealtimeData({
    queryKey: ['tunnels'],
    websocketEventTypes: ['tunnel_config_updated', 'tunnel_deleted'],
    pollingInterval: 60000,
  });

  return (
    <div className="page-shell">
      <section className="page-heading">
        <div>
          <h1 className="page-actions"><InternetIcon />{t('tunnels.title')}</h1>
          <p>{t('tunnels.desc')}</p>
        </div>
        <Button
          variant="outline"
          icon={<RefreshIcon />}
          onClick={() => qc.invalidateQueries({ queryKey: ['tunnels'] })}
        >
          {t('common.refresh')}
        </Button>
      </section>

      <TunnelList />
    </div>
  );
}
