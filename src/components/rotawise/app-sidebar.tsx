import { cn } from '@/lib/utils';
import LanguageSelector from '@/components/rotawise/language-selector';
import { ThemeToggle } from '@/components/theme-toggle';
import { useLanguage } from '@/context/language-context';
import { SOURCE_CODE_URL } from '@/lib/source';

export type AppTab = 'config' | 'calendar' | 'weekly' | 'monthly';

export interface AppSidebarNavItem {
  id: AppTab;
  icon: React.ElementType;
  labelKey: string;
  disabled?: boolean;
}

interface AppSidebarProps {
  navItems: AppSidebarNavItem[];
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
}

export function AppSidebar({ navItems, activeTab, onTabChange }: AppSidebarProps) {
  const { t } = useLanguage();

  return (
    <aside className="app-sidebar">
      <div className="sidebar-logo flex items-center gap-2 px-3 py-4 border-b border-white/10">
        <img
          src="/favicon.svg"
          alt="Rotawise"
          className="h-7 w-7 shrink-0 drop-shadow-[0_2px_8px_rgba(37,99,235,0.6)]"
        />
        <span className="text-sm font-semibold text-white hidden md:block truncate">
          Rota<span className="text-blue-400 font-normal">wise</span>
        </span>
      </div>

      <nav className="flex flex-col gap-1 p-2 flex-1">
        {navItems.map(({ id, icon: Icon, labelKey, disabled }) => (
          <button
            key={id}
            type="button"
            onClick={() => !disabled && onTabChange(id)}
            disabled={disabled}
            title={t(labelKey as Parameters<typeof t>[0])}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 w-full text-left',
              'disabled:opacity-30 disabled:cursor-not-allowed',
              activeTab === id && !disabled
                ? 'bg-blue-600 text-white'
                : 'text-slate-400 hover:bg-white/10 hover:text-slate-100',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{t(labelKey as Parameters<typeof t>[0])}</span>
          </button>
        ))}
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
          className="px-3 py-1.5 text-[11px] text-slate-500 hover:text-slate-200 truncate"
        >
          {t('license.source')}
        </a>
      </div>
    </aside>
  );
}
