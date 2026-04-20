import React from 'react';
import { describe, it, expect, beforeEach } from 'bun:test';
import { renderHook, act, waitFor } from '@testing-library/react';
import { LanguageProvider, useLanguage } from '../context/language-context';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <LanguageProvider>{children}</LanguageProvider>
);

describe('useLanguage', () => {
  beforeEach(() => {
    localStorage.clear();
    // Ensure English default for all tests
    localStorage.setItem('rotawise-language', 'en');
  });

  describe('translation function t()', () => {
    it('resolves a flat key that exists in the translation file', async () => {
      const { result } = renderHook(() => useLanguage(), { wrapper });
      await waitFor(() => {
        expect(result.current.t('header.title')).toBe('Rotawise');
      });
    });

    it('resolves another flat key', async () => {
      const { result } = renderHook(() => useLanguage(), { wrapper });
      await waitFor(() => {
        expect(result.current.t('header.description')).toBe(
          'Fair and balanced doctor scheduling',
        );
      });
    });

    it('resolves a nested key using dot-path traversal', async () => {
      const { result } = renderHook(() => useLanguage(), { wrapper });
      await waitFor(() => {
        // "page.noSchedule.title" is stored as a flat key in en.json
        const value = result.current.t('page.noSchedule.title');
        expect(value).toBe('No schedule generated yet');
      });
    });

    it('returns the key itself when no translation is found', async () => {
      const { result } = renderHook(() => useLanguage(), { wrapper });
      await waitFor(() => {
        expect(result.current.t('definitely.does.not.exist')).toBe(
          'definitely.does.not.exist',
        );
      });
    });

    it('replaces a single placeholder with the provided value', async () => {
      const { result } = renderHook(() => useLanguage(), { wrapper });
      await waitFor(() => {
        const value = result.current.t('page.toast.scheduleWarning.description', {
          doctorName: 'Dr. Smith',
        });
        expect(value).toBe('Dr. Smith is scheduled to work on a vacation day.');
      });
    });

    it('replaces multiple placeholders', async () => {
      const { result } = renderHook(() => useLanguage(), { wrapper });
      await waitFor(() => {
        const value = result.current.t('page.toast.minIntervalWarning.description', {
          doctorName: 'Dr. Jones',
          interval: 2,
        });
        expect(value).toBe('Dr. Jones needs at least 2 day(s) off before working again.');
      });
    });

    it('replaces numeric placeholders correctly', async () => {
      const { result } = renderHook(() => useLanguage(), { wrapper });
      await waitFor(() => {
        const value = result.current.t('page.toast.minIntervalWarning.description', {
          doctorName: 'X',
          interval: 0,
        });
        expect(value).toContain('0 day(s)');
      });
    });
  });

  describe('language switching', () => {
    it('defaults to English when localStorage has "en"', async () => {
      const { result } = renderHook(() => useLanguage(), { wrapper });
      await waitFor(() => {
        expect(result.current.language).toBe('en');
      });
    });

    it('switches to Spanish and translates correctly', async () => {
      const { result } = renderHook(() => useLanguage(), { wrapper });

      await waitFor(() => {
        expect(result.current.language).toBe('en');
      });

      act(() => {
        result.current.setLanguage('es');
      });

      await waitFor(() => {
        expect(result.current.t('header.description')).toBe(
          'Programación de médicos justa y equilibrada',
        );
      });
    });

    it('updates the language state after setLanguage', async () => {
      const { result } = renderHook(() => useLanguage(), { wrapper });

      act(() => {
        result.current.setLanguage('es');
      });

      await waitFor(() => {
        expect(result.current.language).toBe('es');
      });
    });

    it('persists the chosen language to localStorage', async () => {
      const { result } = renderHook(() => useLanguage(), { wrapper });

      act(() => {
        result.current.setLanguage('es');
      });

      await waitFor(() => {
        expect(localStorage.getItem('rotawise-language')).toBe('es');
      });
    });

    it('switches back to English from Spanish', async () => {
      const { result } = renderHook(() => useLanguage(), { wrapper });

      act(() => {
        result.current.setLanguage('es');
      });

      act(() => {
        result.current.setLanguage('en');
      });

      await waitFor(() => {
        expect(result.current.t('header.title')).toBe('Rotawise');
        expect(result.current.language).toBe('en');
      });
    });

    it('loads from localStorage on mount when language is "es"', async () => {
      localStorage.setItem('rotawise-language', 'es');
      const { result } = renderHook(() => useLanguage(), { wrapper });
      await waitFor(() => {
        expect(result.current.language).toBe('es');
        expect(result.current.t('header.description')).toBe(
          'Programación de médicos justa y equilibrada',
        );
      });
    });
  });

  describe('date-fns locale', () => {
    it('provides a date-fns locale object', async () => {
      const { result } = renderHook(() => useLanguage(), { wrapper });
      await waitFor(() => {
        expect(result.current.currentDateFnsLocale).toBeDefined();
        expect(typeof result.current.currentDateFnsLocale).toBe('object');
      });
    });

    it('changes date-fns locale when language changes', async () => {
      const { result } = renderHook(() => useLanguage(), { wrapper });

      let enLocale: object;
      await waitFor(() => {
        enLocale = result.current.currentDateFnsLocale;
      });

      act(() => {
        result.current.setLanguage('es');
      });

      await waitFor(() => {
        expect(result.current.currentDateFnsLocale).not.toBe(enLocale!);
      });
    });
  });

  describe('throws when used outside provider', () => {
    it('throws when useLanguage is called without LanguageProvider', () => {
      expect(() => {
        // renderHook without a wrapper — no provider
        const { result } = renderHook(() => useLanguage());
        // Access result to trigger the error
        void result.current;
      }).toThrow();
    });
  });
});
