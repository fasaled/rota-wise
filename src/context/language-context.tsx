
"use client";

import type React from 'react';
import { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { type Locale } from 'date-fns';
import { enUS, es } from 'date-fns/locale';

// Import translations directly
import enTranslations from '@/locales/en.json';
import esTranslations from '@/locales/es.json';

type Language = 'en' | 'es';

interface LanguageContextType {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, replacements?: Record<string, string | number>) => string;
  currentDateFnsLocale: Locale;
}

const translationsMap: Record<Language, any> = {
  en: enTranslations,
  es: esTranslations,
};

const dateFnsLocaleMap: Record<Language, Locale> = {
  en: enUS,
  es: es,
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Helper to get nested values from an object: e.g., "a.b.c" from {a: {b: {c: "value"}}}
const getNestedValue = (obj: any, path: string): string | undefined => {
  if (!obj || typeof path !== 'string') {
    return undefined;
  }
  return path.split('.').reduce((acc, part) => acc && acc[part], obj);
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('en');
  const [loadedTranslations, setLoadedTranslations] = useState<any>(translationsMap.en);

  useEffect(() => {
    // Attempt to load saved language from localStorage
    const savedLanguage = localStorage.getItem('rotawise-language') as Language | null;
    if (savedLanguage && (savedLanguage === 'en' || savedLanguage === 'es')) {
      setLanguageState(savedLanguage);
      setLoadedTranslations(translationsMap[savedLanguage]);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    setLoadedTranslations(translationsMap[lang]);
    localStorage.setItem('rotawise-language', lang);
  };

  const t = useMemo(() => (key: string, replacements?: Record<string, string | number>): string => {
    let translation = getNestedValue(loadedTranslations, key);
    if (translation === undefined) {
      // Fallback to English if key not found in current language, then to key itself
      translation = getNestedValue(translationsMap.en, key) || key;
    }
    
    if (replacements) {
      Object.keys(replacements).forEach(placeholder => {
        translation = translation!.replace(new RegExp(`{${placeholder}}`, 'g'), String(replacements[placeholder]));
      });
    }
    return translation!;
  }, [loadedTranslations]);

  const currentDateFnsLocale = useMemo(() => dateFnsLocaleMap[language], [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, currentDateFnsLocale }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
