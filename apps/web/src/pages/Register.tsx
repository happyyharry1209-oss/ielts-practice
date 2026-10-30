import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
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
      const { debugLink } = await register(email, password, displayName);
      const token = debugLink?.split('token=')[1];
      if (token) navigate(`/verify-email?token=${token}`, { replace: true });
      else navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError(t('auth.emailTaken'));
      else if (err instanceof ApiError && err.status === 403) setError(t('auth.registrationClosed'));
      else if (err instanceof ApiError && err.status === 0) setError(t('errors.network'));
      else setError(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t('auth.signUpTitle')} subtitle={t('auth.signUpSubtitle')}>
      <form className="space-y-4" onSubmit={submit}>
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
          <p className="rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        ) : null}
        <button type="submit" className="btn-primary w-full" disabled={busy}>
          {busy ? t('common.loading') : t('auth.signUp')}
        </button>
      </form>
      <p className="mt-6 border-t border-line pt-5 text-sm text-slate-500">
        {t('auth.haveAccount')}{' '}
        <Link to="/login" className="font-semibold text-brand-600 hover:underline">
          {t('auth.signIn')}
        </Link>
      </p>
    </AuthShell>
  );
}
