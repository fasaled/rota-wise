import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from 'next-themes';
import { LanguageProvider } from '@/context/language-context';
import { FileSystemProvider } from '@/context/file-system-context';
import '@/app/globals.css';
import RotawisePage from '@/app/page';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ThemeProvider attribute="class" defaultTheme="system" disableTransitionOnChange>
      <LanguageProvider>
        <FileSystemProvider>
          <RotawisePage />
        </FileSystemProvider>
      </LanguageProvider>
    </ThemeProvider>
  </React.StrictMode>,
);
