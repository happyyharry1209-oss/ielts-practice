import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Card, Field, PageHeader } from '../components/ui';
import { ApiError, api } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function Account() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (next !== confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await api('/api/auth/change-password', {
        method: 'POST',
        json: { currentPassword: current, newPassword: next },
      });
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) setError(t('account.wrongCurrent'));
      else if (err instanceof ApiError && err.status === 0) setError(t('errors.network'));
      else setError(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={t('account.title')} subtitle={t('account.subtitle')} />

      <Card className="mb-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wide text-slate-400">{t('auth.email')}</p>
            <p className="truncate text-sm font-medium text-slate-800">{user?.email}</p>
          </div>
          <Badge tone={user?.emailVerified ? 'emerald' : 'amber'}>
            {user?.emailVerified ? t('account.verified') : t('account.unverified')}
          </Badge>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-slate-900">{t('account.changeTitle')}</h2>
        <form className="mt-4 space-y-4" onSubmit={submit}>
          <Field label={t('account.currentPassword')} htmlFor="current">
            <input
              id="current"
              type="password"
              required
              autoComplete="current-password"
              className="input"
              value={current}
              onChange={(event) => setCurrent(event.target.value)}
            />
          </Field>
          <Field label={t('auth.newPassword')} htmlFor="next" hint={t('auth.passwordHint')}>
            <input
              id="next"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="input"
              value={next}
              onChange={(event) => setNext(event.target.value)}
            />
          </Field>
          <Field label={t('auth.confirmPassword')} htmlFor="confirm">
            <input
              id="confirm"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="input"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </Field>

          {error ? (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          ) : null}
          {done ? (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {t('account.changed')}
            </p>
          ) : null}

          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? t('common.saving') : t('account.change')}
          </button>
        </form>
      </Card>
    </div>
  );
}
