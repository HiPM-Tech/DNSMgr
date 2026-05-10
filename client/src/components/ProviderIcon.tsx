import type { CSSProperties } from 'react';
import type { Provider } from '../api';

const providerIcons: Record<string, string> = {
  aliyun: new URL('../assets/providers/aliyun.png', import.meta.url).href,
  aliyunesa: new URL('../assets/providers/aliyun.png', import.meta.url).href,
  dnspod: new URL('../assets/providers/dnspod.ico', import.meta.url).href,
  huawei: new URL('../assets/providers/huawei.ico', import.meta.url).href,
  baidu: new URL('../assets/providers/baidu.ico', import.meta.url).href,
  huoshan: new URL('../assets/providers/huoshan.png', import.meta.url).href,
  jdcloud: new URL('../assets/providers/jdcloud.png', import.meta.url).href,
  cloudflare: new URL('../assets/providers/cloudflare.ico', import.meta.url).href,
  dnsla: new URL('../assets/providers/dnsla.ico', import.meta.url).href,
  west: new URL('../assets/providers/west.ico', import.meta.url).href,
  qingcloud: new URL('../assets/providers/qingcloud.ico', import.meta.url).href,
  namesilo: new URL('../assets/providers/namesilo.svg', import.meta.url).href,
  bt: new URL('../assets/providers/bt.ico', import.meta.url).href,
  spaceship: new URL('../assets/providers/spaceship.svg', import.meta.url).href,
  powerdns: new URL('../assets/providers/powerdns.png', import.meta.url).href,
  tencenteo: new URL('../assets/providers/tencenteo.png', import.meta.url).href,
  dnshe: new URL('../assets/providers/dnshe.ico', import.meta.url).href,
  rainyun: new URL('../assets/providers/rainyun.ico', import.meta.url).href,
  hidns: new URL('../assets/providers/hidns.svg', import.meta.url).href,
  caihongdns: new URL('../assets/providers/caihongdns.svg', import.meta.url).href,
  vps8: new URL('../assets/providers/vps8.svg', import.meta.url).href,
};

interface ProviderIconProps {
  type: string;
  name?: string;
  size?: number;
  className?: string;
}

export function ProviderIcon({ type, name, size = 20, className = '' }: ProviderIconProps) {
  const normalizedType = type.toLowerCase();
  const icon = providerIcons[normalizedType];
  const fallbackText = (name || type).trim().slice(0, 2).toUpperCase();
  const style = { '--provider-icon-size': `${size}px` } as CSSProperties;

  return (
    <span className={`provider-icon ${className}`.trim()} style={style} aria-hidden="true">
      {icon ? (
        <img className="provider-icon__image" src={icon} alt="" loading="lazy" />
      ) : (
        <span className="provider-icon__fallback">{fallbackText}</span>
      )}
    </span>
  );
}

export function ProviderSelectLabel({ provider }: { provider: Pick<Provider, 'type' | 'name'> }) {
  return (
    <span className="provider-select-option" title={`${provider.name} (${provider.type})`}>
      <ProviderIcon type={provider.type} name={provider.name} />
      <span className="provider-select-option__name">{provider.name}</span>
    </span>
  );
}
