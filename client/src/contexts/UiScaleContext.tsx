import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

export type UiScale = 'large' | 'small';

interface UiScaleContextType {
  uiScale: UiScale;
  setUiScale: (scale: UiScale) => void;
  scaleValue: number;
}

const UiScaleContext = createContext<UiScaleContextType | undefined>(undefined);

const UI_SCALE_STORAGE_KEY = 'uiScale';
const SCALE_VALUES: Record<UiScale, number> = {
  large: 1,
  small: 0.9,
};

function getStoredUiScale(): UiScale {
  const saved = localStorage.getItem(UI_SCALE_STORAGE_KEY);
  return saved === 'large' || saved === 'small' ? saved : 'small';
}

function applyUiScale(scale: UiScale) {
  const value = String(SCALE_VALUES[scale]);

  document.documentElement.dataset.uiScale = scale;
  document.documentElement.style.setProperty('--app-ui-scale', value);

  if (document.body) {
    document.body.dataset.uiScale = scale;
    document.body.style.setProperty('--app-ui-scale', value);
  }
}

export function UiScaleProvider({ children }: { children: ReactNode }) {
  const [uiScale, setUiScaleState] = useState<UiScale>(() => {
    const initialScale = getStoredUiScale();
    applyUiScale(initialScale);
    return initialScale;
  });

  useEffect(() => {
    const handleStorageChange = () => {
      const nextScale = getStoredUiScale();
      setUiScaleState(nextScale);
      applyUiScale(nextScale);
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('local-storage', handleStorageChange);
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('local-storage', handleStorageChange);
    };
  }, []);

  const value = useMemo<UiScaleContextType>(() => ({
    uiScale,
    setUiScale: (scale: UiScale) => {
      setUiScaleState(scale);
      localStorage.setItem(UI_SCALE_STORAGE_KEY, scale);
      applyUiScale(scale);
      window.dispatchEvent(new Event('local-storage'));
    },
    scaleValue: SCALE_VALUES[uiScale],
  }), [uiScale]);

  return <UiScaleContext.Provider value={value}>{children}</UiScaleContext.Provider>;
}

export function useUiScale() {
  const context = useContext(UiScaleContext);
  if (!context) {
    throw new Error('useUiScale must be used within UiScaleProvider');
  }
  return context;
}
