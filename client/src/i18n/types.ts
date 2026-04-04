export interface LocaleDefinition {
  code: string;
  label: string;
  messages: TranslationTree;
}

export interface TranslationTree {
  [key: string]: string | TranslationTree;
}
