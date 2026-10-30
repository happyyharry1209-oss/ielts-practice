import { Menu, Moon, Sun, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { setLanguage } from '../lib/i18n';
import { toggleTheme } from '../lib/theme';
import { cn } from '../lib/utils';

function navClass({ isActive }: { isActive: boolean }): string {
  return cn('desktop-nav-link', isActive && 'active');
}

function mobileNavClass({ isActive }: { isActive: boolean }): string {
  return cn(
    'flex min-h-11 items-center border-b border-line px-1 text-sm font-semibold',
    isActive ? 'text-brand-600' : 'text-ink',
  );
}

export function Layout() {
  const { t, i18n } = useTranslation();
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const language = i18n.language === 'zh-TW' ? 'zh-TW' : 'en';
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  const [menuOpen, setMenuOpen] = useState(false);
  const [resending, setResending] = useState(false);
  const [debugToken, setDebugToken] = useState<string | null>(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen]);

  const resendVerification = async () => {
    setResending(true);
    try {
      const response = await api<{ debugLink?: string }>('/api/auth/resend-verification', {
        method: 'POST',
      });
      const token = response.debugLink?.split('token=')[1];
      if (token) setDebugToken(token);
    } catch {
      /* the banner is not critical; ignore failures */
    } finally {
      setResending(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const navItems = [
    { to: '/', label: t('nav.home'), end: true },
    { to: '/practice/reading', label: t('home.skillReading') },
    { to: '/practice/listening', label: t('home.skillListening') },
    { to: '/practice/writing', label: t('home.skillWriting') },
    { to: '/practice/speaking', label: t('home.skillSpeaking') },
    { to: '/review', label: t('nav.review') },
    ...(isAdmin ? [{ to: '/admin', label: t('nav.admin') }] : []),
  ];

  return (
    <div className="app-page min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur-md">
        <div className="mx-auto flex h-[72px] max-w-shell items-center gap-8 px-4">
          <Link to="/" className="flex min-w-0 items-center gap-3" aria-label={t('common.appName')}>
            <span className="grid h-9 w-8 rotate-[-2deg] place-items-center border-[1.5px] border-ink font-serif text-lg font-semibold text-ink">
              IJ
            </span>
            <span className="min-w-0">
              <span className="block whitespace-nowrap font-serif text-lg font-semibold leading-none text-ink">
                {t('common.appName')}
              </span>
              <span className="mt-1 hidden text-[8px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:block">
                {t('common.journal')}
              </span>
            </span>
          </Link>

          <nav className="hidden flex-1 items-center gap-7 lg:flex" aria-label={t('nav.primary')}>
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className={navClass}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={() => setDark(toggleTheme() === 'dark')}
              className="grid h-11 w-10 place-items-center text-slate-500 transition hover:text-ink"
              title={dark ? t('nav.lightMode') : t('nav.darkMode')}
              aria-label={dark ? t('nav.lightMode') : t('nav.darkMode')}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => setLanguage(language === 'en' ? 'zh-TW' : 'en')}
              className="min-h-11 px-2 text-[11px] font-semibold text-slate-500 transition hover:text-ink"
              title={t('nav.language')}
            >
              {language === 'en' ? '中文' : 'EN'}
            </button>
            {user ? (
              <>
                <Link
                  to="/account"
                  title={t('account.title')}
                  className="hidden max-w-[120px] truncate text-xs text-slate-600 transition hover:text-brand-600 sm:inline"
                >
                  {user.displayName || user.email}
                </Link>
                <span className="hidden h-8 w-8 place-items-center rounded-full bg-ink font-serif text-xs text-paper sm:grid">
                  {(user.displayName || user.email).charAt(0).toUpperCase()}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="hidden min-h-11 px-2 text-xs text-slate-500 transition hover:text-ink md:block"
                >
                  {t('nav.logout')}
                </button>
              </>
            ) : (
              <Link to="/login" className="btn-secondary hidden text-xs sm:inline-flex">
                {t('nav.login')}
              </Link>
            )}
            <button
              type="button"
              className="grid h-11 w-11 place-items-center text-ink lg:hidden"
              onClick={() => setMenuOpen((value) => !value)}
              aria-expanded={menuOpen}
              aria-controls="mobile-navigation"
              aria-label={menuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
            >
              {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {menuOpen ? (
          <nav
            id="mobile-navigation"
            aria-label={t('nav.mobile')}
            className="border-t border-line bg-paper px-4 py-3 lg:hidden"
          >
            <div className="mx-auto max-w-shell">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={mobileNavClass}
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </NavLink>
              ))}
              {user ? (
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex min-h-11 w-full items-center px-1 text-left text-sm font-semibold text-slate-500"
                >
                  {t('nav.logout')}
                </button>
              ) : null}
            </div>
          </nav>
        ) : null}
      </header>

      {user && !user.emailVerified ? (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto flex max-w-shell flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm text-amber-900">
            <span>{t('auth.emailUnverified')}</span>
            <button
              type="button"
              onClick={() => void resendVerification()}
              disabled={resending}
              className="font-semibold underline underline-offset-2 disabled:opacity-50"
            >
              {resending ? t('auth.resending') : t('auth.resend')}
            </button>
            {debugToken ? (
              <Link
                to={`/verify-email?token=${debugToken}`}
                className="rounded-sm bg-amber-900 px-2 py-1 text-xs font-semibold text-amber-50"
              >
                {t('auth.debugLink')}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}

      <main className="mx-auto max-w-shell px-4 py-8 sm:py-11">
        <Outlet />
      </main>

      <footer className="mt-14 border-t border-line py-6">
        <div className="mx-auto max-w-shell px-4 font-serif text-[11px] leading-5 text-slate-500">
          <p>{t('common.legal')}</p>
        </div>
      </footer>
    </div>
  );
}
