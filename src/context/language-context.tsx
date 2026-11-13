import type React from 'react';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { type Locale } from 'date-fns';
import {
  LANGUAGE_STORAGE_KEY,
  dateFnsLocaleMap,
  detectInitialLanguage,
  translate,
  type Language,
  type TFunction,
} from '@/lib/i18n';

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  t: TFunction;
  currentDateFnsLocale: Locale;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(detectInitialLanguage);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    } catch {
      // private mode / blocked storage
    }
  }, []);

  const t = useCallback<TFunction>((key, replacements) => translate(language, key, replacements), [language]);

  // Keep the document itself in the active language (screen readers, SEO).
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = translate(language, 'meta.title');
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute('content', translate(language, 'meta.description'));

    // `/?lang=xx` is a real, indexable variant (see the hreflang links in
    // index.html), so it must be self-canonical and announce its own locale.
    const explicit = new URLSearchParams(window.location.search).get('lang');
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) {
      const url = new URL(canonical.href);
      url.search = explicit === language ? `?lang=${language}` : '';
      canonical.href = url.toString();
    }
    document
      .querySelector('meta[property="og:locale"]')
      ?.setAttribute('content', language === 'es' ? 'es_ES' : 'en_US');
    document
      .querySelector('meta[property="og:locale:alternate"]')
      ?.setAttribute('content', language === 'es' ? 'en_US' : 'es_ES');
  }, [language]);

  const value = useMemo(
    () => ({ language, setLanguage, t, currentDateFnsLocale: dateFnsLocaleMap[language] }),
    [language, setLanguage, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
