import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Field } from '../components/ui';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function Login() {
  const { t } = useTranslation();
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: string } };

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      navigate(location.state?.from ?? '/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setError(t('auth.invalidCredentials'));
      else if (err instanceof ApiError && err.status === 0) setError(t('errors.network'));
      else setError(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-slate-900 p-10 text-white lg:flex">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-sm font-black">
            IE
          </span>
          <span className="font-bold">{t('common.appName')}</span>
        </div>
        <div>
          <h1 className="max-w-md text-4xl font-black leading-tight">{t('common.tagline')}</h1>
          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            <li>• Listening, Reading, Writing and Speaking in one place</li>
            <li>• Automatic marking with explanations</li>
            <li>• AI feedback on your essays</li>
          </ul>
        </div>
        <p className="text-xs text-slate-500">
          Original practice material. Not affiliated with the IELTS test.
        </p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-sm font-black text-white">
              IE
            </span>
          </div>
          <h2 className="text-2xl font-bold text-slate-900">{t('auth.signInTitle')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('auth.signInSubtitle')}</p>

          <form className="mt-6 space-y-4" onSubmit={submit}>
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
            <Field label={t('auth.password')} htmlFor="password">
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                className="input"
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>

            <div className="-mt-2 flex justify-end">
              <Link
                to="/forgot-password"
                className="text-xs font-medium text-slate-500 hover:text-brand-600"
              >
                {t('auth.forgotPassword')}
              </Link>
            </div>

            {error ? (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
            ) : null}

            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? t('common.loading') : t('auth.signIn')}
            </button>
          </form>

          <p className="mt-6 text-sm text-slate-500">
            {t('auth.noAccount')}{' '}
            <Link to="/register" className="font-semibold text-brand-600 hover:underline">
              {t('auth.signUp')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
