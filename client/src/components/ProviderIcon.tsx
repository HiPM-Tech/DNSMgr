import type { CSSProperties } from 'react';
import type { Provider } from '../api';

interface ProviderIconProps {
  type: string;
  name?: string;
  size?: number;
  className?: string;
}

export function ProviderIcon({ type, name, size = 20, className = '' }: ProviderIconProps) {
  const normalizedType = type.toLowerCase();
  // Dynamic icon URL from backend API
  const iconUrl = `/api/providers/${normalizedType}/icon`;
  const fallbackText = (name || type).trim().slice(0, 2).toUpperCase();
  const style = { '--provider-icon-size': `${size}px` } as CSSProperties;

  return (
    <span className={`provider-icon ${className}`.trim()} style={style} aria-hidden="true">
      <img 
        className="provider-icon__image" 
        src={iconUrl} 
        alt="" 
        loading="lazy"
        onError={(e) => {
          // Hide image on error and show fallback text
          const img = e.target as HTMLImageElement;
          img.style.display = 'none';
          const fallback = img.parentElement?.querySelector('.provider-icon__fallback');
          if (fallback) {
            (fallback as HTMLElement).style.display = 'inline';
          }
        }}
      />
      <span className="provider-icon__fallback" style={{ display: 'none' }}>{fallbackText}</span>
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
