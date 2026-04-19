

import React, { useEffect, useState } from 'react';
import { X, CheckCircle2, AlertTriangle, XCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/context/language-context';
import type { InfoBarMessage } from '@/hooks/use-info-bar';

// ---------------------------------------------------------------------------
// Severity config
// ---------------------------------------------------------------------------

const severityConfig = {
  success: {
    Icon: CheckCircle2,
    classes: 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-100',
    iconClass: 'text-emerald-600 dark:text-emerald-400',
  },
  warning: {
    Icon: AlertTriangle,
    classes: 'bg-amber-50 border-amber-200 text-amber-900 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-100',
    iconClass: 'text-amber-600 dark:text-amber-400',
  },
  error: {
    Icon: XCircle,
    classes: 'bg-red-50 border-red-200 text-red-900 dark:bg-red-950 dark:border-red-800 dark:text-red-100',
    iconClass: 'text-red-600 dark:text-red-400',
  },
  info: {
    Icon: Info,
    classes: 'bg-blue-50 border-blue-200 text-blue-900 dark:bg-blue-950 dark:border-blue-800 dark:text-blue-100',
    iconClass: 'text-blue-600 dark:text-blue-400',
  },
};

// ---------------------------------------------------------------------------
// Single toast
// ---------------------------------------------------------------------------

interface InfoBarProps {
  message: InfoBarMessage;
  onDismiss: (id: string) => void;
}

function InfoBar({ message, onDismiss }: InfoBarProps) {
  const { t } = useLanguage();
  const config = severityConfig[message.severity];
  const { Icon } = config;
  const [visible, setVisible] = useState(false);

  // Slide-in on mount
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg',
        'transition-all duration-200',
        visible ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0',
        config.classes,
      )}
    >
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', config.iconClass)} />
      <div className="flex-1 min-w-0">
        <p className="font-medium leading-snug">{message.title}</p>
        {message.description && (
          <p className="mt-0.5 leading-snug opacity-80 text-xs">{message.description}</p>
        )}
      </div>
      <button
        type="button"
        aria-label={t('infoBar.dismiss')}
        onClick={() => onDismiss(message.id)}
        className="shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Floating list — fixed position, does not affect page layout
// ---------------------------------------------------------------------------

interface InfoBarListProps {
  messages: InfoBarMessage[];
  onDismiss: (id: string) => void;
}

export function InfoBarList({ messages, onDismiss }: InfoBarListProps) {
  if (messages.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm pointer-events-none"
      aria-live="polite"
      aria-atomic="false"
    >
      {messages.map((msg) => (
        <div key={msg.id} className="pointer-events-auto">
          <InfoBar message={msg} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}

export default InfoBar;
