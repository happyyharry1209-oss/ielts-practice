import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { cn, formatClock } from '../lib/utils';

export function TimerPill({ remaining, mode }: { remaining: number; mode: 'mock' | 'practice' }) {
  const { t } = useTranslation();
  const urgent = mode === 'mock' && remaining <= 300;
  return (
    <div
      className={cn(
        'flex min-h-10 items-center gap-2 rounded-sm px-3 py-1.5 text-sm font-semibold tabular-nums',
        urgent ? 'bg-rose-100 text-rose-700' : 'bg-paper/10 text-paper/80',
      )}
      title={mode === 'mock' ? t('exam.mockMode') : t('exam.practiceMode')}
    >
      <span className="text-xs font-medium uppercase tracking-wide opacity-70">
        {t('exam.timeLeft')}
      </span>
      {mode === 'mock' ? formatClock(remaining) : '∞'}
    </div>
  );
}

export function ExamShell({
  title,
  subtitle,
  timer,
  answered,
  total,
  onSubmit,
  submitLabel,
  disabled,
  children,
  sidebar,
}: {
  title: string;
  subtitle?: string;
  timer: ReactNode;
  answered: number;
  total: number;
  onSubmit: () => void;
  submitLabel: string;
  disabled?: boolean;
  children: ReactNode;
  sidebar?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="exam-surface flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-paper/15 bg-ink text-paper shadow-sm">
        <div className="mx-auto flex min-h-[70px] max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-base font-semibold text-paper">{title}</p>
            {subtitle ? <p className="truncate text-[11px] text-paper/55">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden min-h-10 items-center rounded-sm bg-paper/10 px-3 py-1.5 text-xs font-medium text-paper/75 sm:inline-flex">
              {answered} / {total}
            </span>
            {timer}
            <button
              type="button"
              className="btn bg-brand-600 text-white hover:bg-brand-500"
              onClick={onSubmit}
              disabled={disabled}
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1400px] flex-1 gap-6 px-4 py-6 lg:py-8">
        <div className="min-w-0 flex-1">{children}</div>
        {sidebar ? <aside className="hidden w-64 shrink-0 lg:block">{sidebar}</aside> : null}
      </main>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/55 p-4 backdrop-blur-sm">
      <div className="card w-full max-w-md p-6">
        <h2 className="font-serif text-2xl font-semibold text-ink">{title}</h2>
        <p className="mt-2 text-sm text-slate-600">{body}</p>
        <div className="mt-6 flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className="btn-primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
