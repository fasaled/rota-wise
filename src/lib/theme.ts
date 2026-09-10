export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'rotawise-theme';
/** Previous storage key; read once and migrated. */
const LEGACY_THEME_STORAGE_KEY = 'theme';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function getSystemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === 'system') return getSystemPrefersDark() ? 'dark' : 'light';
  return theme;
}

export function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isTheme(stored)) return stored;

    const legacy = localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (isTheme(legacy)) {
      localStorage.setItem(THEME_STORAGE_KEY, legacy);
      return legacy;
    }
  } catch {
    // private mode / blocked storage
  }
  return 'system';
}

export function writeStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // private mode / blocked storage
  }
}

function disableTransitions(root: HTMLElement): () => void {
  root.classList.add('theme-no-transitions');
  void root.offsetHeight;
  return () => {
    root.classList.remove('theme-no-transitions');
  };
}

export function applyTheme(theme: Theme): ResolvedTheme {
  const resolved = resolveTheme(theme);
  const root = document.documentElement;
  const restore = disableTransitions(root);
  root.classList.toggle('dark', resolved === 'dark');
  root.style.colorScheme = resolved;
  restore();
  return resolved;
}
