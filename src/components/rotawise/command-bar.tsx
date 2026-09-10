import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { File, History, Download, FileText, Trash2, UserX, MoreHorizontal } from 'lucide-react';
import { useLanguage } from '@/context/language-context';

interface CommandBarProps {
  fileName: string | null;
  canGenerate: boolean;
  canUndo: boolean;
  hasSchedule: boolean;
  hasDoctors: boolean;
  isBusy: boolean;
  isLoading: boolean;
  isExportingWord: boolean;
  onGenerate: () => void;
  onUndo: () => void;
  onExportWord: () => void;
  onClearSchedule: () => void;
  onClearDoctors: () => void;
}

export function CommandBar({
  fileName,
  canGenerate,
  canUndo,
  hasSchedule,
  hasDoctors,
  isBusy,
  isLoading,
  isExportingWord,
  onGenerate,
  onUndo,
  onExportWord,
  onClearSchedule,
  onClearDoctors,
}: CommandBarProps) {
  const { t } = useLanguage();
  const generateDisabled = !canGenerate || isBusy;

  return (
    <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-card shrink-0 shadow-sm">
      <div className="flex items-center gap-2 min-w-0">
        <File className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground truncate">
          {fileName ?? t('file.noFileOpen')}
        </span>
        {fileName && !fileName.endsWith('.rw') && (
          <span className="text-xs bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 px-1.5 py-0.5 rounded font-medium shrink-0">
            .json
          </span>
        )}
      </div>

      <div className="hidden sm:flex items-center gap-1.5 shrink-0">
        <Button onClick={onGenerate} size="sm" disabled={generateDisabled}>
          {isLoading ? (
            <>
              <span className="animate-spin mr-2 h-4 w-4 border-t-2 border-b-2 border-current rounded-full" />
              {t('form.generatingButton')}
            </>
          ) : (
            t('form.generateButton')
          )}
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={onUndo}
          disabled={!canUndo || isBusy}
          title={t('nav.undo')}
        >
          <History className="h-3.5 w-3.5 mr-1.5" />
          <span className="hidden sm:inline">{t('nav.undo')}</span>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              disabled={!hasSchedule || isBusy}
              title={t('page.export')}
            >
              {isExportingWord ? (
                <span className="h-3.5 w-3.5 mr-1.5 animate-spin rounded-full border-t-2 border-b-2 border-primary" />
              ) : (
                <Download className="h-3.5 w-3.5 mr-1.5" />
              )}
              <span className="hidden md:inline">{t('page.export')}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onExportWord} disabled={isBusy || isExportingWord}>
              <FileText className="h-4 w-4 mr-2" />
              {t('page.exportWord')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className="h-5" />

        <Button
          size="sm"
          variant="destructive"
          onClick={onClearSchedule}
          disabled={!hasSchedule || isBusy}
          title={t('page.clearSchedule')}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={onClearDoctors}
          disabled={!hasDoctors || isBusy}
          title={t('page.clearDoctorDetails.button')}
        >
          <UserX className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="flex sm:hidden items-center gap-2 shrink-0">
        <Button onClick={onGenerate} size="sm" disabled={generateDisabled}>
          {isLoading ? (
            <>
              <span className="animate-spin mr-1.5 h-4 w-4 border-t-2 border-b-2 border-current rounded-full" />
              {t('form.generatingButton')}
            </>
          ) : (
            t('form.generateButton')
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" title={t('page.moreActions')}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onClick={onUndo} disabled={!canUndo || isBusy}>
              <History className="h-4 w-4 mr-2" />
              {t('nav.undo')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onExportWord} disabled={!hasSchedule || isBusy}>
              <FileText className="h-4 w-4 mr-2" />
              {t('page.exportWord')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={onClearSchedule}
              disabled={!hasSchedule || isBusy}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t('page.clearSchedule')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onClearDoctors}
              disabled={!hasDoctors || isBusy}
              className="text-destructive focus:text-destructive"
            >
              <UserX className="h-4 w-4 mr-2" />
              {t('page.clearDoctorDetails.button')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
