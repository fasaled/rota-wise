
import React from 'react';
import { FolderOpen, FilePlus2 } from 'lucide-react';
import { useLanguage } from '@/context/language-context';
import { useFileSystem } from '@/context/file-system-context';
import type { AppFileData } from '@/lib/types';
import { ENABLE_EXCEL } from '@/lib/features';

interface StartupScreenProps {
  onFileReady: (data: AppFileData, convertedFromJson?: boolean, isExcel?: boolean) => void;
  onError: (msg: string) => void;
}

export function StartupScreen({ onFileReady, onError }: StartupScreenProps) {
  const { t } = useLanguage();
  const { openAnyFile, openFile, createNewFile } = useFileSystem();

  async function handleOpen() {
    try {
      if (!ENABLE_EXCEL) {
        const result = await openFile();
        if (result) onFileReady(result.data, result.convertedFromJson, false);
        return;
      }
      const result = await openAnyFile();
      if (result) onFileReady(result.data, result.convertedFromJson, result.isExcel);
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

  const actionClass =
    'group flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-5 text-left transition-all duration-200 hover:bg-white/10 hover:border-blue-500/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f172a]';

  const iconWrapClass =
    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-600/20 text-blue-400 transition-colors duration-200 group-hover:bg-blue-600/30';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a] overflow-hidden">
      {/* Ambient background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-1/2 -right-1/4 w-[600px] h-[600px] rounded-full bg-blue-600/5 blur-3xl" />
        <div className="absolute -bottom-1/3 -left-1/4 w-[500px] h-[500px] rounded-full bg-indigo-500/5 blur-3xl" />
      </div>

      <div className="relative flex flex-col items-center gap-10 max-w-sm w-full px-6">
        {/* Brand */}
        <div className="text-center space-y-4">
          <div className="flex flex-col items-center gap-3">
            <img
              src="/favicon.svg"
              alt="Rotawise"
              className="h-16 w-16 drop-shadow-[0_8px_24px_rgba(37,99,235,0.5)]"
            />
            <div className="leading-none">
              <span className="text-3xl font-bold tracking-tight text-white">Rota</span>
              <span className="text-3xl font-normal tracking-tight text-blue-400">wise</span>
            </div>
          </div>
          <p className="text-slate-400 text-sm leading-relaxed">
            {t('startup.subtitle')}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-3 w-full">

          {/* Open file (any format) */}
          <button
            type="button"
            onClick={handleOpen}
            className={actionClass}
          >
            <div className={iconWrapClass}>
              <FolderOpen className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-white text-sm">{t('startup.openFile')}</p>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                {ENABLE_EXCEL
                  ? t('startup.openFileDescription')
                  : t('startup.openFileDescriptionRw')}
              </p>
            </div>
          </button>

          {/* Create new file */}
          <button
            type="button"
            onClick={handleCreate}
            className={actionClass}
          >
            <div className={iconWrapClass}>
              <FilePlus2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-white text-sm">{t('startup.createNewFile')}</p>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{t('startup.createNewFileDescription')}</p>
            </div>
          </button>

        </div>
      </div>
    </div>
  );
}

export default StartupScreen;
