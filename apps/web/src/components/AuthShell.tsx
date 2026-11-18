import { BookOpen, Moon, Sun } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { setLanguage } from '../lib/i18n';
import { toggleTheme } from '../lib/theme';

export function AuthShell({ title, subtitle, children }: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-shell items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3 font-serif text-lg font-semibold text-ink">
            <span className="brand-mark"><BookOpen aria-hidden="true" size={19} /></span>
            {t('common.appName')}
          </Link>
          <div className="flex items-center gap-1">
            <button type="button" className="btn-ghost px-3" aria-label={t(dark ? 'nav.lightMode' : 'nav.darkMode')} onClick={() => setDark(toggleTheme() === 'dark')}>
              {dark ? <Sun aria-hidden="true" size={17} /> : <Moon aria-hidden="true" size={17} />}
            </button>
            <button type="button" className="btn-ghost px-3 text-xs" title={t('nav.language')} onClick={() => setLanguage(i18n.language === 'en' ? 'zh-TW' : 'en')}>
              {i18n.language === 'en' ? '中文' : 'EN'}
            </button>
          </div>
        </div>
      </header>
      <main className="grid flex-1 place-items-center px-4 py-10 sm:px-6">
        <section className="card w-full max-w-md p-6 sm:p-9">
          <h1 className="page-title sm:text-4xl">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm leading-6 text-muted">{subtitle}</p> : null}
          <div className="mt-6">{children}</div>
        </section>
      </main>
      <footer className="mx-auto max-w-shell px-4 pb-5 text-center text-xs leading-5 text-muted sm:px-6">
        {t('common.legal')}
      </footer>
    </div>
  );
}
