import { useLanguage } from '@/context/language-context';
import type { TranslationKey } from '@/lib/i18n';

/** Validation messages are i18n keys (see `schedule-form-schema.ts`). */
export function FieldError({ message, id }: { message?: string; id?: string }) {
  const { t } = useLanguage();
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-sm text-destructive">
      {t(message as TranslationKey)}
    </p>
  );
}
