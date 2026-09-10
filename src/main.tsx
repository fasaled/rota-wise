import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@/context/theme-context';
import { LanguageProvider } from '@/context/language-context';
import { FileSystemProvider } from '@/context/file-system-context';
import '@/styles/globals.css';
import RotawisePage from '@/rotawise-page';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider>
      <LanguageProvider>
        <FileSystemProvider>
          <RotawisePage />
        </FileSystemProvider>
      </LanguageProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
