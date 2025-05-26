
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
    let translation = loadedTranslations ? loadedTranslations[key] : undefined;
    
    if (translation === undefined) {
      // Fallback to English if key not found in current language
      translation = translationsMap.en ? translationsMap.en[key] : undefined;
      if (translation === undefined) {
        // Final fallback to the key itself if not found in English either
        translation = key;
      }
    }
    
    if (replacements && typeof translation === 'string') {
      Object.keys(replacements).forEach(placeholder => {
        translation = translation!.replace(new RegExp(`{${placeholder}}`, 'g'), String(replacements[placeholder]));
      });
    }
    return translation! ?? key; // Ensure we always return a string
  }, [loadedTranslations, language]); // Added language to dependency array for safety, though loadedTranslations should cover it.

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

