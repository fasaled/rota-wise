import { type Locale } from 'date-fns';
import { enUS, es } from 'date-fns/locale';

import enTranslations from '@/locales/en.json';
import esTranslations from '@/locales/es.json';

export type Language = 'en' | 'es';

/** Every user-facing string. English is the source of truth for the key set. */
export type TranslationKey = keyof typeof enTranslations;
export type TranslationParams = Record<string, string | number>;
export type TFunction = (key: TranslationKey, replacements?: TranslationParams) => string;
/** For keys built at runtime (`assignmentType.${x}`), where the compiler cannot check them. */
export type LooseTFunction = (key: string, replacements?: Record<string, any>) => string;

export const LANGUAGE_STORAGE_KEY = 'rotawise-language';

const translationsMap: Record<Language, Record<string, string>> = {
  en: enTranslations,
  es: esTranslations as Record<string, string>,
};

export const dateFnsLocaleMap: Record<Language, Locale> = {
  en: enUS,
  es: es,
};

export const isLanguage = (value: unknown): value is Language => value === 'en' || value === 'es';

/**
 * Initial language, resolved synchronously so the first paint is already in
 * the right language: `?lang=` in the URL, then the stored choice, then the
 * browser language, then English.
 */
export function detectInitialLanguage(): Language {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('lang');
    if (isLanguage(fromUrl)) return fromUrl;
  } catch {
    // no window / malformed URL
  }
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (isLanguage(stored)) return stored;
  } catch {
    // private mode / blocked storage
  }
  if (typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('es')) {
    return 'es';
  }
  return 'en';
}

/** Look up `key` in `language`, falling back to English and then to the key itself. */
export function translate(language: Language, key: string, replacements?: Record<string, any>): string {
  let translation = translationsMap[language][key] ?? translationsMap.en[key];
  if (translation === undefined) return key;
  if (replacements) {
    for (const [placeholder, value] of Object.entries(replacements)) {
      translation = translation.split(`{${placeholder}}`).join(String(value));
    }
  }
  return translation;
}
