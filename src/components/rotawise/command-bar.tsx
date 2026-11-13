import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  File,
  Undo2,
  Redo2,
  Download,
  FileText,
  UserX,
  MoreHorizontal,
  ChevronDown,
  FolderOpen,
  Save,
  FilePlus2,
  AlertTriangle,
} from 'lucide-react';
import { useLanguage } from '@/context/language-context';

interface CommandBarProps {
  fileName: string | null;
  persistenceMode: 'browser' | 'file';
  /** Write access to the linked file was lost; auto-save is paused. */
  autoSaveBlocked: boolean;
  canGenerate: boolean;
  canUndo: boolean;
  canRedo: boolean;
  hasSchedule: boolean;
  hasDoctors: boolean;
  isBusy: boolean;
  isLoading: boolean;
  isExportingWord: boolean;
  onGenerate: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onExportWord: () => void;
  onClearDoctors: () => void;
  onNewSchedule: () => void;
  onOpenFile: () => void;
  onSaveToFile: () => void;
  onReactivateAutoSave: () => void;
}

export function CommandBar({
  fileName,
  persistenceMode,
  autoSaveBlocked,
  canGenerate,
  canUndo,
  canRedo,
  hasSchedule,
  hasDoctors,
  isBusy,
  isLoading,
  isExportingWord,
  onGenerate,
  onUndo,
  onRedo,
  onExportWord,
  onClearDoctors,
  onNewSchedule,
  onOpenFile,
  onSaveToFile,
  onReactivateAutoSave,
}: CommandBarProps) {
  const { t } = useLanguage();
  const displayName = fileName ?? t('file.noFileOpen');

  return (
    <header className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b border-border bg-card shrink-0 shadow-sm">
      <div className="flex items-center gap-2 min-w-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="min-w-0 max-w-[14rem] px-2"
              aria-label={t('file.menu')}
              title={t('file.menu')}
              disabled={isBusy}
            >
              <File className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium text-foreground truncate">{displayName}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem onClick={onNewSchedule} disabled={isBusy}>
              <FilePlus2 className="h-4 w-4 mr-2" aria-hidden="true" />
              {t('file.newSchedule')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenFile} disabled={isBusy}>
              <FolderOpen className="h-4 w-4 mr-2" aria-hidden="true" />
              {t('file.open')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onSaveToFile} disabled={isBusy}>
              <Save className="h-4 w-4 mr-2" aria-hidden="true" />
              {persistenceMode === 'file' ? t('file.saveAs') : t('file.saveToFile')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {persistenceMode === 'browser' && (
          <span className="hidden min-[400px]:inline text-xs bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200 px-1.5 py-0.5 rounded font-medium shrink-0">
            {t('file.browserOnly')}
          </span>
        )}
        {fileName && !fileName.endsWith('.rw') && (
          <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 px-1.5 py-0.5 rounded font-medium shrink-0">
            .json
          </span>
        )}
        {autoSaveBlocked && (
          <Button
            size="sm"
            variant="outline"
            onClick={onReactivateAutoSave}
            title={t('file.autoSavePaused.help')}
            className="h-7 shrink-0 gap-1.5 border-amber-300 bg-amber-50 px-2 text-xs text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
          >
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden md:inline">{t('file.autoSavePaused')}</span>
            <span className="font-semibold">{t('file.autoSavePaused.action')}</span>
          </Button>
        )}
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Button onClick={onGenerate} size="sm" disabled={!canGenerate || isBusy} aria-busy={isLoading}>
          {isLoading ? (
            <>
              <span className="animate-spin mr-2 h-4 w-4 border-t-2 border-b-2 border-current rounded-full" aria-hidden="true" />
              {t('form.generatingButton')}
            </>
          ) : (
            t('form.generateButton')
          )}
        </Button>

        {/* Desktop actions */}
        <div className="hidden sm:flex items-center gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={onUndo}
            disabled={!canUndo || isBusy}
            title={t('nav.undo.shortcut')}
          >
            <Undo2 className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
            {t('nav.undo')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={onRedo}
            disabled={!canRedo || isBusy}
            title={t('nav.redo.shortcut')}
            aria-label={t('nav.redo')}
          >
            <Redo2 className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                disabled={!hasSchedule || isBusy}
                title={t('page.export')}
                aria-label={t('page.export')}
              >
                {isExportingWord ? (
                  <span className="h-3.5 w-3.5 md:mr-1.5 animate-spin rounded-full border-t-2 border-b-2 border-primary" aria-hidden="true" />
                ) : (
                  <Download className="h-3.5 w-3.5 md:mr-1.5" aria-hidden="true" />
                )}
                <span className="hidden md:inline">{t('page.export')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onExportWord} disabled={isBusy}>
                <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
                {t('page.exportWord')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Separator orientation="vertical" className="h-5" />

          <Button
            size="sm"
            variant="outline"
            onClick={onClearDoctors}
            disabled={!hasDoctors || isBusy}
            title={t('page.clearDoctorDetails.button')}
            aria-label={t('page.clearDoctorDetails.button')}
          >
            <UserX className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </div>

        {/* Mobile actions */}
        <div className="sm:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" title={t('page.moreActions')} aria-label={t('page.moreActions')}>
                <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={onUndo} disabled={!canUndo || isBusy}>
                <Undo2 className="h-4 w-4 mr-2" aria-hidden="true" />
                {t('nav.undo')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onRedo} disabled={!canRedo || isBusy}>
                <Redo2 className="h-4 w-4 mr-2" aria-hidden="true" />
                {t('nav.redo')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onExportWord} disabled={!hasSchedule || isBusy}>
                <FileText className="h-4 w-4 mr-2" aria-hidden="true" />
                {t('page.exportWord')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onClearDoctors}
                disabled={!hasDoctors || isBusy}
                className="text-destructive focus:text-destructive"
              >
                <UserX className="h-4 w-4 mr-2" aria-hidden="true" />
                {t('page.clearDoctorDetails.button')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
