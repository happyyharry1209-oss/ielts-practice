import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';

type State = 'working' | 'ok' | 'error';

export default function VerifyEmail() {
  const { t } = useTranslation();
  const { refreshUser } = useAuth();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState<State>(token ? 'working' : 'error');
  const [message, setMessage] = useState(token ? '' : 'missing-token');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    api('/api/auth/verify-email', { method: 'POST', json: { token } })
      .then(() => {
        if (cancelled) return;
        setState('ok');
        refreshUser().catch(() => undefined);
      })
      .catch((error) => {
        if (cancelled) return;
        setState('error');
        setMessage(errorMessage(error));
      });
    return () => {
      cancelled = true;
    };
  }, [token, refreshUser]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 text-sm font-black text-white">
          IE
        </span>
        <h1 className="mt-6 text-2xl font-bold text-slate-900">{t('auth.verifyTitle')}</h1>

        {state === 'working' ? <p className="mt-3 text-sm text-slate-500">{t('auth.verifyWorking')}</p> : null}

        {state === 'ok' ? (
          <>
            <p className="mt-3 text-sm font-semibold text-emerald-700">{t('auth.verifyOk')}</p>
            <p className="mt-1 text-sm text-slate-500">{t('auth.verifyOkHint')}</p>
          </>
        ) : null}

        {state === 'error' ? (
          <>
            <p className="mt-3 text-sm font-semibold text-rose-700">{t('auth.verifyError')}</p>
            <p className="mt-1 text-xs text-slate-400">
              {message === 'missing-token' ? t('auth.missingToken') : message}
            </p>
          </>
        ) : null}

        <Link to="/login" className="btn-secondary mt-8">
          {t('auth.backToLogin')}
        </Link>
      </div>
    </div>
  );
}
