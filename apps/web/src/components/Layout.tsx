import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { setLanguage } from '../lib/i18n';
import { cn } from '../lib/utils';

function navClass({ isActive }: { isActive: boolean }): string {
  return cn(
    'rounded-lg px-3 py-1.5 text-sm font-medium transition',
    isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100',
  );
}

export function Layout() {
  const { t, i18n } = useTranslation();
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const language = i18n.language === 'zh-TW' ? 'zh-TW' : 'en';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-xs font-black text-white">
              IE
            </span>
            <span className="hidden text-sm font-bold tracking-tight text-slate-900 sm:inline">
              {t('common.appName')}
            </span>
          </Link>

          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            <NavLink to="/" end className={navClass}>
              {t('nav.home')}
            </NavLink>
            <NavLink to="/practice/reading" className={navClass}>
              {t('home.skillReading')}
            </NavLink>
            <NavLink to="/practice/listening" className={navClass}>
              {t('home.skillListening')}
            </NavLink>
            <NavLink to="/practice/writing" className={navClass}>
              {t('home.skillWriting')}
            </NavLink>
            <NavLink to="/practice/speaking" className={navClass}>
              {t('home.skillSpeaking')}
            </NavLink>
            {isAdmin ? (
              <NavLink to="/admin" className={navClass}>
                {t('nav.admin')}
              </NavLink>
            ) : null}
          </nav>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setLanguage(language === 'en' ? 'zh-TW' : 'en')}
              className="rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100"
              title={t('nav.language')}
            >
              {language === 'en' ? '中文' : 'EN'}
            </button>
            {user ? (
              <div className="flex items-center gap-2">
                <span className="hidden max-w-[140px] truncate text-sm text-slate-600 sm:inline">
                  {user.displayName || user.email}
                </span>
                {isAdmin ? (
                  <span className="chip bg-slate-900 text-white">{t('admin.admin')}</span>
                ) : null}
                <button type="button" onClick={handleLogout} className="btn-ghost text-xs">
                  {t('nav.logout')}
                </button>
              </div>
            ) : (
              <Link to="/login" className="btn-secondary text-xs">
                {t('nav.login')}
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>

      <footer className="mt-12 border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-6 text-xs leading-5 text-slate-400">
          <p>
            This site is an independent practice tool. IELTS is a registered trademark of the
            British Council, IDP: IELTS Australia and Cambridge University Press &amp; Assessment.
            All practice questions here are original and are not real test material.
          </p>
        </div>
      </footer>
    </div>
  );
}
