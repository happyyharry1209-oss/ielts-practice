import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthShell } from '../components/AuthShell';
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
    <AuthShell title={t('auth.verifyTitle')}>
      <div className="text-center">

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
    </AuthShell>
  );
}
