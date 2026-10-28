import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Field } from '../components/ui';
import { ApiError, api } from '../lib/api';

export default function ResetPassword() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirm) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/reset-password', { method: 'POST', json: { token, password } });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) setError(t('auth.verifyError'));
      else if (err instanceof ApiError && err.status === 0) setError(t('errors.network'));
      else setError(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-sm font-black text-white">
          IE
        </span>
        <h1 className="mt-6 text-2xl font-bold text-slate-900">{t('auth.resetTitle')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('auth.resetSubtitle')}</p>

        {!token ? (
          <p className="mt-6 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {t('auth.missingToken')}
          </p>
        ) : done ? (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-800">{t('auth.resetDone')}</p>
            <p className="mt-1 text-sm text-emerald-700">{t('auth.resetDoneHint')}</p>
            <Link to="/login" className="btn-primary mt-4 w-full">
              {t('auth.backToLogin')}
            </Link>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <Field label={t('auth.newPassword')} htmlFor="password" hint={t('auth.passwordHint')}>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className="input"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
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
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? t('common.loading') : t('auth.resetButton')}
            </button>
          </form>
        )}

        <p className="mt-6 text-sm">
          <Link to="/login" className="font-semibold text-brand-600 hover:underline">
            {t('auth.backToLogin')}
          </Link>
        </p>
      </div>
    </div>
  );
}
