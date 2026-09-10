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
  showClearSchedule: boolean;
  showClearDoctors: boolean;
  onShowClearScheduleChange: (open: boolean) => void;
  onShowClearDoctorsChange: (open: boolean) => void;
  onConfirmClearSchedule: () => void;
  onConfirmClearDoctors: () => void;
}

export function ConfirmDialogs({
  showClearSchedule,
  showClearDoctors,
  onShowClearScheduleChange,
  onShowClearDoctorsChange,
  onConfirmClearSchedule,
  onConfirmClearDoctors,
}: ConfirmDialogsProps) {
  const { t } = useLanguage();

  return (
    <>
      <AlertDialog open={showClearSchedule} onOpenChange={onShowClearScheduleChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('page.confirmClearSchedule.title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('page.confirmClearSchedule.description')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('page.confirmClearSchedule.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmClearSchedule}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('page.confirmClearSchedule.confirm')}
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
    </>
  );
}
