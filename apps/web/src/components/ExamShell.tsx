import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import { cn, formatClock } from '../lib/utils';

export function TimerPill({ remaining, mode }: { remaining: number; mode: 'mock' | 'practice' }) {
  const { t } = useTranslation();
  const urgent = mode === 'mock' && remaining <= 300;
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-semibold tabular-nums',
        urgent ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-700',
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
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
            {subtitle ? <p className="truncate text-xs text-slate-500">{subtitle}</p> : null}
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden rounded-xl bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600 sm:inline">
              {answered} / {total}
            </span>
            {timer}
            <button type="button" className="btn-primary" onClick={onSubmit} disabled={disabled}>
              {submitLabel}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[1400px] flex-1 gap-6 px-4 py-6">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="card w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
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
