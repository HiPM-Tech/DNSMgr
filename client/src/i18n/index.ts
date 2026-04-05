import { en } from './locales/en';
import { es } from './locales/es';
import { ja } from './locales/ja';
import { zhCN } from './locales/zh-CN';
import { zhCN as zhCNMesugaki } from './locales/zh-CN-Mesugaki';

export const locales = {
  en,
  es,
  ja,
  'zh-CN': zhCN,
  'zh-CN-Mesugaki': zhCNMesugaki,
};

export const defaultLocale = 'zh-CN';

export const localeOptions = Object.values(locales).map((item) => ({
  code: item.code,
  label: item.label,
}));

// Community locales can be added by registering them here.
