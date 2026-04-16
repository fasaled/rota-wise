"use client";

import React, { useRef } from 'react';
import { FolderOpen, FilePlus2, AlertTriangle, Layers } from 'lucide-react';
import { useLanguage } from '@/context/language-context';
import { useFileSystem } from '@/context/file-system-context';
import type { AppFileData } from '@/lib/types';

interface StartupScreenProps {
  onFileReady: (data: AppFileData, convertedFromJson?: boolean) => void;
  onLoadAsPreassigned: (data: AppFileData) => void;
  onError: (msg: string) => void;
}

export function StartupScreen({ onFileReady, onLoadAsPreassigned, onError }: StartupScreenProps) {
  const { t } = useLanguage();
  const { isSupported, openFile, createNewFile } = useFileSystem();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const preassignedInputRef = useRef<HTMLInputElement>(null);

  async function handleOpen() {
    try {
      const result = await openFile();
      if (result) onFileReady(result.data, result.convertedFromJson);
    } catch {
      onError(t('file.openError'));
    }
  }

  async function handleCreate() {
    try {
      const result = await createNewFile();
      if (result) onFileReady(result.data);
    } catch {
      onError(t('file.createError'));
    }
  }

  // Fallback: user picks a file via <input type="file"> for Open
  function handleFallbackOpen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        onFileReady({ fileVersion: 1, versions: [], ...parsed } as AppFileData);
      } catch {
        onError(t('file.openError'));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // User picks a file to import as pre-assigned (both supported and fallback paths)
  function handlePreassignedFilePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        onLoadAsPreassigned({ fileVersion: 1, versions: [], ...parsed } as AppFileData);
      } catch {
        onError(t('file.openError'));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  const actionButtonClass =
    'group flex items-center gap-4 rounded-xl border border-border bg-card p-5 text-left transition-colors hover:bg-accent/40 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

  const iconWrapClass =
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-8 max-w-md w-full px-6">
        {/* Logo / title */}
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">
            {t('startup.title')}
          </h1>
          <p className="text-muted-foreground text-sm">
            {t('startup.subtitle')}
          </p>
        </div>

        {/* Browser unsupported warning */}
        {!isSupported && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100 w-full">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <span>{t('startup.unsupportedBrowser')}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3 w-full">
          {/* Hidden inputs for file picking (used in both supported and fallback paths) */}
          {!isSupported && (
            <input
              ref={fileInputRef}
              type="file"
              accept=".rw,.json"
              className="hidden"
              onChange={handleFallbackOpen}
            />
          )}
          <input
            ref={preassignedInputRef}
            type="file"
            accept=".rw,.json"
            className="hidden"
            onChange={handlePreassignedFilePick}
          />

          {/* Open existing file */}
          <button
            type="button"
            onClick={isSupported ? handleOpen : () => fileInputRef.current?.click()}
            className={actionButtonClass}
          >
            <div className={iconWrapClass}>
              <FolderOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium text-foreground">{t('startup.openFile')}</p>
              <p className="text-sm text-muted-foreground">{t('startup.openFileDescription')}</p>
            </div>
          </button>

          {/* Create new file */}
          <button
            type="button"
            onClick={handleCreate}
            className={actionButtonClass}
          >
            <div className={iconWrapClass}>
              <FilePlus2 className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium text-foreground">{t('startup.createNewFile')}</p>
              <p className="text-sm text-muted-foreground">{t('startup.createNewFileDescription')}</p>
            </div>
          </button>

          {/* Import as pre-assigned */}
          <button
            type="button"
            onClick={() => preassignedInputRef.current?.click()}
            className={actionButtonClass}
          >
            <div className={iconWrapClass}>
              <Layers className="h-5 w-5" />
            </div>
            <div>
              <p className="font-medium text-foreground">{t('startup.importAsPreassigned')}</p>
              <p className="text-sm text-muted-foreground">{t('startup.importAsPreassignedDescription')}</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

export default StartupScreen;
