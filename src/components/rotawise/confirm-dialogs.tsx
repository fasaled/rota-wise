import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useLanguage } from '@/context/language-context';

interface ConfirmDialogsProps {
  showNewSchedule: boolean;
  showOpenReplace: boolean;
  showClearDoctors: boolean;
  showRegenerate: boolean;
  onShowNewScheduleChange: (open: boolean) => void;
  onShowOpenReplaceChange: (open: boolean) => void;
  onShowClearDoctorsChange: (open: boolean) => void;
  onShowRegenerateChange: (open: boolean) => void;
  onConfirmNewSchedule: () => void;
  onConfirmOpenReplace: () => void;
  onConfirmClearDoctors: () => void;
  onConfirmRegenerateKeepFixed: () => void;
  onConfirmRegenerateFromScratch: () => void;
}

export function ConfirmDialogs({
  showNewSchedule,
  showOpenReplace,
  showClearDoctors,
  showRegenerate,
  onShowNewScheduleChange,
  onShowOpenReplaceChange,
  onShowClearDoctorsChange,
  onShowRegenerateChange,
  onConfirmNewSchedule,
  onConfirmOpenReplace,
  onConfirmClearDoctors,
  onConfirmRegenerateKeepFixed,
  onConfirmRegenerateFromScratch,
}: ConfirmDialogsProps) {
  const { t } = useLanguage();

  return (
    <>
      <AlertDialog open={showNewSchedule} onOpenChange={onShowNewScheduleChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('page.confirmNewSchedule.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('page.confirmNewSchedule.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('page.confirmNewSchedule.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmNewSchedule}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('page.confirmNewSchedule.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showOpenReplace} onOpenChange={onShowOpenReplaceChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('file.replaceTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('file.replaceDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('file.replaceCancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmOpenReplace}>
              {t('file.replaceConfirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showClearDoctors} onOpenChange={onShowClearDoctorsChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('page.confirmClearDoctorDetails.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('page.confirmClearDoctorDetails.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('page.confirmClearDoctorDetails.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmClearDoctors}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('page.confirmClearDoctorDetails.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showRegenerate} onOpenChange={onShowRegenerateChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('page.confirmRegenerate.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('page.confirmRegenerate.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:justify-end gap-2">
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <Button type="button" variant="outline" onClick={onConfirmRegenerateFromScratch}>
              {t('page.confirmRegenerate.fromScratch')}
            </Button>
            <AlertDialogAction onClick={onConfirmRegenerateKeepFixed}>
              {t('page.confirmRegenerate.keepFixed')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
