import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
import { Field } from '../components/ui';
import { ApiError, api } from '../lib/api';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [debugLink, setDebugLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ ok: boolean; debugLink?: string }>('/api/auth/forgot-password', {
        method: 'POST',
        json: { email },
      });
      setSent(true);
      setDebugLink(response.debugLink ?? null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) setError(t('errors.network'));
      else setError(t('errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const token = debugLink ? extractToken(debugLink) : null;

  return (
    <AuthShell title={t('auth.forgotTitle')} subtitle={t('auth.forgotSubtitle')}>
      <div>

        {sent ? (
          <div className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm font-semibold text-emerald-800">{t('auth.forgotSent')}</p>
            <p className="mt-1 text-sm text-emerald-700">
              {t('auth.forgotSentHint', { email })}
            </p>
            {token ? (
              <Link
                to={`/reset-password?token=${encodeURIComponent(token)}`}
                className="mt-3 inline-block text-xs font-semibold text-emerald-800 underline"
              >
                {t('auth.debugLink')}
              </Link>
            ) : (
              <p className="mt-3 text-xs text-emerald-700/80">{t('auth.noMailHint')}</p>
            )}
          </div>
        ) : (
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
            {error ? (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
            ) : null}
            <button type="submit" className="btn-primary w-full" disabled={busy}>
              {busy ? t('common.loading') : t('auth.sendResetLink')}
            </button>
          </form>
        )}

        <p className="mt-6 text-sm">
          <Link to="/login" className="font-semibold text-brand-600 hover:underline">
            {t('auth.backToLogin')}
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}

function extractToken(link: string): string | null {
  const index = link.indexOf('token=');
  if (index === -1) return null;
  return decodeURIComponent(link.slice(index + 'token='.length));
}
