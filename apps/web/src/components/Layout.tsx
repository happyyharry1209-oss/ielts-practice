import { BookOpen, Menu, Moon, Sun, X } from 'lucide-react';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { setLanguage } from '../lib/i18n';
import { toggleTheme } from '../lib/theme';
import { SKILLS, skillLabel } from '../lib/skills';
import { cn } from '../lib/utils';
import { Spinner } from './ui';

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
  const menuButton = useRef<HTMLButtonElement>(null);
  const [resending, setResending] = useState(false);
  const [debugToken, setDebugToken] = useState<string | null>(null);

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
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
    { to: '/', label: t('nav.home') },
    ...SKILLS.map(({ key }) => ({ to: `/practice/${key}`, label: t(skillLabel(key)) })),
    { to: '/mock', label: t('mock.nav') },
    { to: '/review', label: t('nav.review') },
    ...(isAdmin ? [{ to: '/admin', label: t('nav.admin') }] : []),
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-shell items-center gap-3 px-4 sm:px-6 lg:gap-6">
          <Link to="/" className="flex min-w-0 items-center gap-3" aria-label={t('common.appName')}>
            <span className="brand-mark"><BookOpen aria-hidden="true" size={19} /></span>
            <span className="whitespace-nowrap font-serif text-lg font-semibold text-ink">{t('common.appName')}</span>
          </Link>

          <nav className="hidden flex-1 items-center gap-4 lg:flex xl:gap-6" aria-label={t('nav.primary')}>
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === '/'} className={navClass}>
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
                <Link to="/account" title={t('account.title')} aria-label={t('account.title')}
                  className="hidden h-10 w-10 place-items-center rounded-full border border-line bg-surface font-serif text-sm font-semibold text-ink transition hover:border-ink lg:grid"
                >
                  {(user.displayName || user.email).charAt(0).toUpperCase()}
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="hidden min-h-11 px-2 text-xs text-slate-500 transition hover:text-ink lg:block"
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
              ref={menuButton}
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
            className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-line bg-paper px-4 py-3 lg:hidden"
          >
            <div className="mx-auto max-w-shell">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={mobileNavClass}
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </NavLink>
              ))}
              {user ? <NavLink to="/account" className={mobileNavClass} onClick={() => setMenuOpen(false)}>{t('account.title')}</NavLink> : null}
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

      <main className="mx-auto w-full max-w-shell flex-1 px-4 py-7 sm:px-6 sm:py-10">
        <Suspense fallback={<Spinner label={t('common.loading')} />}>
          <Outlet />
        </Suspense>
      </main>

      <footer className="mt-14 border-t border-line py-6">
        <div className="mx-auto max-w-shell px-4 text-xs leading-5 text-muted sm:px-6">
          <p>{t('common.legal')}</p>
        </div>
      </footer>
    </div>
  );
}
