

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

// Helper function to get a value from a nested object based on a path string
const getNestedValue = (obj: any, path: string): string | undefined => {
  if (!obj || typeof path !== 'string') {
    return undefined;
  }
  
  const keys = path.split('.');
  
  // Strategy 1: Try full nested traversal (existing logic)
  let current: any = obj;
  for (let i = 0; i < keys.length; i++) {
    const keyPart = keys[i];
    if (current === null || typeof current !== 'object' || !current.hasOwnProperty(keyPart)) {
      break; // Path doesn't exist, try strategy 2
    }
    current = current[keyPart];
    if (i === keys.length - 1) {
      // We've traversed the full path successfully
      return typeof current === 'string' ? current : undefined;
    }
  }
  
  // Strategy 2: Try combinations of flat keys + remaining nested path
  // For "page.toast.clearedDoctorItems.title", try:
  // - "page.toast.clearedDoctorItems" as flat key, then traverse ".title"
  // - "page.toast" as flat key, then traverse ".clearedDoctorItems.title"
  // - "page" as flat key, then traverse ".toast.clearedDoctorItems.title"
  for (let splitPoint = keys.length - 1; splitPoint > 0; splitPoint--) {
    const flatKey = keys.slice(0, splitPoint).join('.');
    const remainingPath = keys.slice(splitPoint);
    
    if (obj.hasOwnProperty(flatKey)) {
      let current = obj[flatKey];
      // Traverse the remaining path
      for (let i = 0; i < remainingPath.length; i++) {
        const keyPart = remainingPath[i];
        if (current === null || typeof current !== 'object' || !current.hasOwnProperty(keyPart)) {
          current = undefined;
          break;
        }
        current = current[keyPart];
      }
      if (typeof current === 'string') {
        return current;
      }
    }
  }
  
  return undefined;
};

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('en');
  const [loadedTranslations, setLoadedTranslations] = useState<any>(translationsMap.en);

  useEffect(() => {
    const savedLanguage = localStorage.getItem('rotawise-language') as Language | null;
    if (savedLanguage && (savedLanguage === 'en' || savedLanguage === 'es')) {
      setLanguageState(savedLanguage);
      setLoadedTranslations(translationsMap[savedLanguage]);
    } else {
      let defaultLang: Language = 'en';
      if (typeof navigator !== 'undefined' && navigator.language) {
        const browserLang = navigator.language.toLowerCase();
        if (browserLang.startsWith('es')) {
          defaultLang = 'es';
        }
      }
      setLanguageState(defaultLang);
      setLoadedTranslations(translationsMap[defaultLang]);
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    setLoadedTranslations(translationsMap[lang]);
    localStorage.setItem('rotawise-language', lang);
  };

  const t = useMemo(() => (key: string, replacements?: Record<string, string | number>): string => {
    let translation: string | undefined;
    
    // Try current language - first as flat key, then as nested path
    if (loadedTranslations) {
      // Try flat key first (e.g., "header.title")
      translation = loadedTranslations[key];
      // If not found as flat key, try nested path (e.g., "page.toast.clearedDoctorItems.title")
    if (translation === undefined) {
        translation = getNestedValue(loadedTranslations, key);
      }
    }

    // Fallback to English if not found in current language
    if (translation === undefined && translationsMap.en) {
      // Try flat key first in English
      translation = translationsMap.en[key];
      // If not found as flat key in English, try nested path
      if (translation === undefined) {
        translation = getNestedValue(translationsMap.en, key);
      }
    }

        // Final fallback to the key itself if not found in English either
    if (translation === undefined) {
      // console.warn(`Translation not found for key: ${key}`); // Optional for debugging
      return key;
      }

    // At this point, translation is a string if found successfully
    if (replacements && typeof translation === 'string') {
      Object.keys(replacements).forEach(placeholder => {
        translation = (translation as string).replace(new RegExp(`{${placeholder}}`, 'g'), String(replacements[placeholder]));
      });
    }
    return translation;
  }, [loadedTranslations, language]);

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
