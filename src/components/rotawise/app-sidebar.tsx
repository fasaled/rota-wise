import { Check, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import LanguageSelector from '@/components/rotawise/language-selector';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLanguage } from '@/context/language-context';
import { useTheme } from '@/context/theme-context';
import type { Language, TranslationKey } from '@/lib/i18n';
import type { Theme } from '@/lib/theme';
import { SOURCE_CODE_URL } from '@/lib/source';

export type AppTab = 'config' | 'calendar' | 'weekly' | 'monthly';

export interface AppSidebarNavItem {
  id: AppTab;
  icon: React.ElementType;
  labelKey: TranslationKey;
  disabled?: boolean;
}

interface AppSidebarProps {
  navItems: AppSidebarNavItem[];
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

const LANGUAGES: { value: Language; labelKey: TranslationKey }[] = [
  { value: 'en', labelKey: 'language.en' },
  { value: 'es', labelKey: 'language.es' },
];

const THEMES: { value: Theme; labelKey: TranslationKey }[] = [
  { value: 'light', labelKey: 'theme.light' },
  { value: 'dark', labelKey: 'theme.dark' },
  { value: 'system', labelKey: 'theme.system' },
];

/** Language, theme and source link for the phone layout, where the sidebar footer is hidden. */
function MobileSettingsMenu() {
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="sidebar-more" aria-label={t('nav.settings')}>
          <MoreHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{t('nav.more')}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-52">
        <DropdownMenuLabel>{t('language.selector.label')}</DropdownMenuLabel>
        {LANGUAGES.map(({ value, labelKey }) => (
          <DropdownMenuItem key={value} onClick={() => setLanguage(value)}>
            <Check className={cn('h-4 w-4 mr-2', language !== value && 'invisible')} aria-hidden="true" />
            {t(labelKey)}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t('theme.label')}</DropdownMenuLabel>
        {THEMES.map(({ value, labelKey }) => (
          <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
            <Check className={cn('h-4 w-4 mr-2', theme !== value && 'invisible')} aria-hidden="true" />
            {t(labelKey)}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href={SOURCE_CODE_URL} target="_blank" rel="noopener noreferrer" title={t('license.sourceTitle')}>
            <span className="w-4 mr-2" aria-hidden="true" />
            {t('license.source')}
          </a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppSidebar({ navItems, activeTab, onTabChange }: AppSidebarProps) {
  const { t } = useLanguage();

  return (
    <aside className="app-sidebar">
      <div className="sidebar-logo flex items-center gap-2 px-3 py-4 border-b border-white/10">
        <img
          src="/favicon.svg"
          alt=""
          width={28}
          height={28}
          className="h-7 w-7 shrink-0 drop-shadow-[0_2px_8px_rgba(37,99,235,0.6)]"
        />
        <span className="text-sm font-semibold text-white hidden md:block truncate">
          Rota<span className="text-blue-400 font-normal">wise</span>
        </span>
      </div>

      <nav className="flex flex-col gap-1 p-2 flex-1" aria-label={t('nav.label')}>
        {navItems.map(({ id, icon: Icon, labelKey, disabled }) => {
          const isActive = activeTab === id && !disabled;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onTabChange(id)}
              disabled={disabled}
              title={t(labelKey)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 w-full text-left',
                'disabled:opacity-30 disabled:cursor-not-allowed',
                isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-white/10 hover:text-slate-100',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="sidebar-nav-label truncate">{t(labelKey)}</span>
            </button>
          );
        })}
        <MobileSettingsMenu />
      </nav>

      <div className="sidebar-bottom-controls border-t border-white/10 p-2 flex flex-col gap-1">
        <div className="flex items-center justify-between px-1">
          <LanguageSelector />
          <ThemeToggle />
        </div>
        <a
          href={SOURCE_CODE_URL}
          target="_blank"
          rel="noopener noreferrer"
          title={t('license.sourceTitle')}
          className="px-3 py-1.5 text-[11px] text-slate-400 hover:text-slate-200 truncate"
        >
          {t('license.source')}
        </a>
      </div>
    </aside>
  );
}
