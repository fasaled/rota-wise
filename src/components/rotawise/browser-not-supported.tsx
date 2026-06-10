
import React from 'react';
import { ShieldAlert, Chrome, Globe } from 'lucide-react';
import { useLanguage } from '@/context/language-context';
import LanguageSelector from '@/components/rotawise/language-selector';
import { ThemeToggle } from '@/components/theme-toggle';

export function BrowserNotSupported() {
  const { t } = useLanguage();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a] overflow-y-auto">
      {/* Ambient background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-1/2 -right-1/4 w-[600px] h-[600px] rounded-full bg-red-600/5 blur-3xl" />
        <div className="absolute -bottom-1/3 -left-1/4 w-[500px] h-[500px] rounded-full bg-amber-500/5 blur-3xl" />
      </div>

      <div className="relative flex flex-col items-center gap-8 max-w-md w-full px-6 py-12">
        {/* Brand */}
        <div className="text-center space-y-3">
          <div className="flex flex-col items-center gap-3">
            <img
              src="/favicon.svg"
              alt="Rotawise"
              className="h-14 w-14 drop-shadow-[0_8px_24px_rgba(37,99,235,0.5)]"
            />
            <div className="leading-none">
              <span className="text-2xl font-bold tracking-tight text-white">Rota</span>
              <span className="text-2xl font-normal tracking-tight text-blue-400">wise</span>
            </div>
          </div>
        </div>

        {/* Blocking message */}
        <div className="w-full rounded-2xl border border-red-500/20 bg-red-500/5 p-6 shadow-lg backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-500/15">
              <ShieldAlert className="h-5 w-5 text-red-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold text-white">
                {t('unsupportedBrowser.title')}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">
                {t('unsupportedBrowser.description')}
              </p>
            </div>
          </div>

          {/* Supported browsers */}
          <div className="mt-6 border-t border-white/10 pt-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Globe className="h-3.5 w-3.5" />
              {t('unsupportedBrowser.supportedTitle')}
            </p>
            <ul className="mt-3 space-y-2">
              <li className="flex items-start gap-2.5 text-sm text-slate-200">
                <Chrome className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>{t('unsupportedBrowser.chrome')}</span>
              </li>
              <li className="flex items-start gap-2.5 text-sm text-slate-200">
                <Chrome className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>{t('unsupportedBrowser.edge')}</span>
              </li>
              <li className="flex items-start gap-2.5 text-sm text-slate-200">
                <Chrome className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                <span>{t('unsupportedBrowser.opera')}</span>
              </li>
            </ul>
          </div>
        </div>

        {/* UI configuration (language & theme) — not application actions */}
        <div className="flex items-center gap-2">
          <LanguageSelector />
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

export default BrowserNotSupported;
