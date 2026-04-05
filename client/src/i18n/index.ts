import en from './locales/en.json';
import es from './locales/es.json';
import ja from './locales/ja.json';
import zhCN from './locales/zh-CN.json';
import zhCNMesugaki from './locales/zh-CN-Mesugaki.json';

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
