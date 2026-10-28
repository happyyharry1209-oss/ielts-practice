import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Badge, Card, PageHeader, Spinner, Stat } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDate, formatDateTime } from '../lib/utils';

interface Overview {
  counts: {
    users: number;
    admins: number;
    attempts: number;
    submissions: number;
    recordings: number;
    ai_calls: number;
    ai_cost: number;
  };
  content: { reading: number; listening: number; writing: number; speaking: number };
}

interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  role: 'user' | 'admin';
  created_at: string;
  last_login_at: string | null;
  attempts: number;
  writing_submissions: number;
  last_attempt_at: string | null;
}

interface UsageResponse {
  days: number;
  daily: { day: string; calls: number; tokens_in: number; tokens_out: number; cost_usd: number }[];
  topUsers: { email: string; calls: number; cost_usd: number }[];
}

export default function Admin() {
  const { t, i18n } = useTranslation();
  const { isAdmin, loading } = useAuth();
  const queryClient = useQueryClient();

  const overview = useQuery({
    queryKey: ['admin', 'overview'],
    queryFn: () => api<Overview>('/api/admin/overview'),
    enabled: isAdmin,
  });
  const users = useQuery({
    queryKey: ['admin', 'users'],
    queryFn: () => api<{ users: AdminUser[] }>('/api/admin/users'),
    enabled: isAdmin,
  });
  const usage = useQuery({
    queryKey: ['admin', 'usage'],
    queryFn: () => api<UsageResponse>('/api/admin/usage?days=30'),
    enabled: isAdmin,
  });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: 'user' | 'admin' }) =>
      api(`/api/admin/users/${id}`, { method: 'PATCH', json: { role } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
  });

  const [resetInfo, setResetInfo] = useState<{ email: string; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [mailMessage, setMailMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const testMail = useMutation({
    mutationFn: () =>
      api<{ sent: boolean; error?: string; to: string }>('/api/admin/test-mail', { method: 'POST' }),
    onSuccess: (data) => {
      setMailMessage({
        ok: data.sent,
        text: data.sent
          ? t('admin.testSent', { email: data.to })
          : data.error ?? t('admin.testFailed'),
      });
    },
    onError: (error) => setMailMessage({ ok: false, text: errorMessage(error) }),
  });

  const createResetLink = useMutation({
    mutationFn: (id: string) =>
      api<{ email: string; token: string; expiresInMinutes: number }>(
        `/api/admin/users/${id}/reset-link`,
        { method: 'POST' },
      ),
    onSuccess: (data) => {
      // Build the absolute URL in the browser: this works on GitHub Pages
      // sub-paths without needing APP_URL on the server.
      const path = `${import.meta.env.BASE_URL}#/reset-password?token=${encodeURIComponent(data.token)}`;
      setResetInfo({
        email: data.email,
        link: `${window.location.origin}${path}`,
      });
      setCopied(false);
    },
  });

  if (loading) return <Spinner />;
  if (!isAdmin) {
    return (
      <div className="card p-10 text-center">
        <p className="text-sm font-semibold text-slate-700">{t('admin.forbidden')}</p>
        <Link to="/" className="btn-secondary mt-4">
          {t('admin.backHome')}
        </Link>
      </div>
    );
  }

  const counts = overview.data?.counts;

  return (
    <div>
      <PageHeader title={t('admin.title')} subtitle={t('admin.overview')} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t('admin.totalUsers')} value={counts?.users ?? '—'} hint={`${counts?.admins ?? 0} admin`} />
        <Stat label={t('admin.totalAttempts')} value={counts?.attempts ?? '—'} />
        <Stat label={t('admin.submissions')} value={counts?.submissions ?? '—'} />
        <Stat
          label={t('admin.aiCalls')}
          value={counts?.ai_calls ?? '—'}
          hint={`$${(counts?.ai_cost ?? 0).toFixed(4)}`}
        />
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-4">
        <Card className="text-center">
          <p className="text-xs uppercase tracking-wide text-slate-400">{t('admin.readingCount')}</p>
          <p className="text-2xl font-bold">{overview.data?.content.reading ?? '—'}</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs uppercase tracking-wide text-slate-400">{t('admin.listeningCount')}</p>
          <p className="text-2xl font-bold">{overview.data?.content.listening ?? '—'}</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs uppercase tracking-wide text-slate-400">{t('admin.writingCount')}</p>
          <p className="text-2xl font-bold">{overview.data?.content.writing ?? '—'}</p>
        </Card>
        <Card className="text-center">
          <p className="text-xs uppercase tracking-wide text-slate-400">{t('admin.speakingCount')}</p>
          <p className="text-2xl font-bold">{overview.data?.content.speaking ?? '—'}</p>
        </Card>
      </div>

      <Card className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-800">{t('admin.mailTitle')}</p>
          <p className="text-xs text-slate-500">{t('admin.mailHint')}</p>
        </div>
        <div className="flex items-center gap-3">
          {mailMessage ? (
            <span
              className={`text-xs font-medium ${mailMessage.ok ? 'text-emerald-700' : 'text-rose-700'}`}
            >
              {mailMessage.text}
            </span>
          ) : null}
          <button
            type="button"
            className="btn-secondary text-xs"
            disabled={testMail.isPending}
            onClick={() => testMail.mutate()}
          >
            {testMail.isPending ? t('admin.sending') : t('admin.sendTest')}
          </button>
        </div>
      </Card>

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {t('admin.users')}
      </h2>
      {users.isLoading ? (
        <Spinner />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">{t('admin.email')}</th>
                <th className="px-4 py-3">{t('admin.role')}</th>
                <th className="px-4 py-3">{t('admin.joined')}</th>
                <th className="px-4 py-3">{t('admin.lastLogin')}</th>
                <th className="px-4 py-3">{t('admin.attempts')}</th>
                <th className="px-4 py-3">{t('admin.submissions')}</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {users.data?.users.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{user.email}</p>
                    {user.display_name ? (
                      <p className="text-xs text-slate-400">{user.display_name}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={user.role === 'admin' ? 'brand' : 'slate'}>
                      {user.role === 'admin' ? t('admin.admin') : t('admin.user')}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(user.created_at, i18n.language)}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDateTime(user.last_login_at, i18n.language)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{user.attempts}</td>
                  <td className="px-4 py-3 text-slate-500">{user.writing_submissions}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        disabled={createResetLink.isPending}
                        onClick={() => createResetLink.mutate(user.id)}
                      >
                        {t('admin.resetLink')}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost text-xs"
                        disabled={changeRole.isPending}
                        onClick={() =>
                          changeRole.mutate({
                            id: user.id,
                            role: user.role === 'admin' ? 'user' : 'admin',
                          })
                        }
                      >
                        {user.role === 'admin' ? t('admin.makeUser') : t('admin.makeAdmin')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {users.data?.users.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">{t('admin.noUsers')}</p>
          ) : null}
        </div>
      )}

      {resetInfo ? (
        <div className="card mt-3 space-y-2 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('admin.resetLinkFor', { email: resetInfo.email })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              readOnly
              value={resetInfo.link}
              className="input flex-1 font-mono text-xs"
              onFocus={(event) => event.currentTarget.select()}
            />
            <button
              type="button"
              className="btn-secondary text-xs"
              onClick={() => {
                navigator.clipboard
                  .writeText(resetInfo.link)
                  .then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  })
                  .catch(() => undefined);
              }}
            >
              {copied ? t('admin.copied') : t('admin.copy')}
            </button>
            <button
              type="button"
              className="btn-ghost text-xs"
              onClick={() => setResetInfo(null)}
            >
              {t('common.close')}
            </button>
          </div>
          <p className="text-xs text-slate-400">{t('admin.resetLinkHint')}</p>
        </div>
      ) : null}

      <h2 className="mb-3 mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
        {t('admin.aiUsage')}
      </h2>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('admin.aiCost')}
          </p>
          <p className="mt-1 text-2xl font-bold">
            ${usage.data?.daily.reduce((sum, day) => sum + day.cost_usd, 0).toFixed(4) ?? '0.0000'}
          </p>
          <div className="mt-3 space-y-1 text-xs text-slate-500">
            {usage.data?.daily.slice(-7).map((day) => (
              <div key={day.day} className="flex justify-between">
                <span>{day.day}</span>
                <span>
                  {day.calls} calls · ${day.cost_usd.toFixed(4)}
                </span>
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t('admin.topUsers')}
          </p>
          <div className="mt-3 space-y-1 text-xs text-slate-500">
            {usage.data?.topUsers.length ? (
              usage.data.topUsers.map((entry) => (
                <div key={entry.email} className="flex justify-between">
                  <span className="truncate">{entry.email}</span>
                  <span>
                    {entry.calls} · ${entry.cost_usd.toFixed(4)}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-slate-400">—</p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
