import { useState } from 'react';
import { Info, X } from 'lucide-react';
import { useLanguage } from '@/context/language-context';
import { Button } from '@/components/ui/button';

const DISMISS_KEY = 'rotawise-fsa-banner-dismissed';

export function FileSystemBanner() {
  const { t } = useLanguage();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  return (
    <div className="flex items-start gap-3 px-4 py-2.5 bg-blue-50 text-blue-950 dark:bg-blue-950/40 dark:text-blue-100 border-b border-blue-200 dark:border-blue-900">
      <Info className="h-4 w-4 mt-0.5 shrink-0" />
      <p className="text-sm leading-snug flex-1">
        <span className="font-medium">{t('unsupportedBrowser.bannerTitle')} </span>
        {t('unsupportedBrowser.bannerDescription')}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 shrink-0"
        onClick={dismiss}
        title={t('unsupportedBrowser.dismiss')}
        aria-label={t('unsupportedBrowser.dismiss')}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
