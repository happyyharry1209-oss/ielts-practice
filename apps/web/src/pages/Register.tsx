import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Field } from '../components/ui';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function Register() {
  const { t } = useTranslation();
  const { register, user } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await register(email, password, displayName);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError(t('auth.emailTaken'));
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
        <h1 className="mt-6 text-2xl font-bold text-slate-900">{t('auth.signUpTitle')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('auth.signUpSubtitle')}</p>

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <Field label={t('auth.displayName')} htmlFor="name">
            <input
              id="name"
              type="text"
              autoComplete="name"
              className="input"
              placeholder={t('auth.namePlaceholder')}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
            />
          </Field>
          <Field label={t('auth.email')} htmlFor="email">
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className="input"
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field label={t('auth.password')} htmlFor="password" hint={t('auth.passwordHint')}>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              className="input"
              placeholder={t('auth.passwordPlaceholder')}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          {error ? (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          ) : null}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? t('common.loading') : t('auth.signUp')}
          </button>
        </form>

        <p className="mt-6 text-sm text-slate-500">
          {t('auth.haveAccount')}{' '}
          <Link to="/login" className="font-semibold text-brand-600 hover:underline">
            {t('auth.signIn')}
          </Link>
        </p>
      </div>
    </div>
  );
}
