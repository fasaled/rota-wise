import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@/context/theme-context';
import { LanguageProvider } from '@/context/language-context';
import { FileSystemProvider } from '@/context/file-system-context';
import { AppErrorBoundary } from '@/components/rotawise/app-error-boundary';
import '@/styles/globals.css';
import RotawisePage from '@/rotawise-page';

// After a deploy, an open tab can ask for a lazy chunk that no longer exists.
// Reload once to pick up the new build; the error boundary covers a second failure.
const RELOAD_FLAG = 'rotawise-chunk-reload';
window.addEventListener('vite:preloadError', (event) => {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return;
    sessionStorage.setItem(RELOAD_FLAG, '1');
  } catch {
    return;
  }
  event.preventDefault();
  window.location.reload();
});
window.addEventListener('load', () => {
  // A full load that got this far has a consistent set of chunks again.
  setTimeout(() => {
    try {
      sessionStorage.removeItem(RELOAD_FLAG);
    } catch {
      // storage blocked
    }
  }, 10_000);
});

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <AppErrorBoundary>
          <FileSystemProvider>
            <RotawisePage />
          </FileSystemProvider>
        </AppErrorBoundary>
      </LanguageProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
