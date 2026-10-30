import { Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();

  return (
    <div className="grid min-h-screen bg-paper lg:grid-cols-[1.05fr_0.95fr]">
      <aside className="hidden flex-col justify-between bg-ink p-10 text-paper lg:flex xl:p-14">
        <Link to="/" className="flex items-center gap-3">
          <span className="grid h-10 w-9 rotate-[-2deg] place-items-center border-[1.5px] border-paper/70 font-serif text-xl">
            IJ
          </span>
          <span>
            <span className="block font-serif text-xl font-semibold">{t('common.appName')}</span>
            <span className="mt-1 block text-[8px] uppercase tracking-[0.18em] text-paper/45">
              {t('common.journal')}
            </span>
          </span>
        </Link>

        <div className="max-w-xl">
          <h1 className="font-serif text-[52px] font-medium leading-[1.06] tracking-[-0.035em]">
            {t('common.tagline')}
          </h1>
          <div className="mt-9 space-y-3 border-t border-paper/15 pt-6 text-sm text-paper/70">
            {[t('auth.benefitOne'), t('auth.benefitTwo'), t('auth.benefitThree')].map((item) => (
              <p key={item} className="flex items-center gap-3">
                <Check className="h-3.5 w-3.5 text-brand-300" strokeWidth={1.8} />
                {item}
              </p>
            ))}
          </div>
        </div>

        <p className="max-w-md font-serif text-[11px] leading-5 text-paper/40">{t('common.legal')}</p>
      </aside>

      <main className="flex min-h-screen items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <Link to="/" className="mb-10 inline-flex items-center gap-3 lg:hidden">
            <span className="grid h-10 w-9 rotate-[-2deg] place-items-center border-[1.5px] border-ink font-serif text-xl text-ink">
              IJ
            </span>
            <span className="font-serif text-xl font-semibold text-ink">{t('common.appName')}</span>
          </Link>
          <h2 className="font-serif text-4xl font-medium tracking-[-0.03em] text-ink">{title}</h2>
          {subtitle ? <p className="mt-2 text-sm leading-6 text-slate-500">{subtitle}</p> : null}
          <div className="mt-7">{children}</div>
        </div>
      </main>
    </div>
  );
}
