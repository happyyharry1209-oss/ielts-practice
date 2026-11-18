import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { useAuth } from './lib/auth';
import Login from './pages/Login';

const Admin = lazy(() => import('./pages/Admin'));
const Account = lazy(() => import('./pages/Account'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const Home = lazy(() => import('./pages/Home'));
const ListeningExam = lazy(() => import('./pages/ListeningExam'));
const Practice = lazy(() => import('./pages/Practice'));
const ReadingExam = lazy(() => import('./pages/ReadingExam'));
const Register = lazy(() => import('./pages/Register'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Result = lazy(() => import('./pages/Result'));
const Review = lazy(() => import('./pages/Review'));
const ReviewSession = lazy(() => import('./pages/ReviewSession'));
const SpeakingExam = lazy(() => import('./pages/SpeakingExam'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const WritingExam = lazy(() => import('./pages/WritingExam'));

function RequireAuth({ withLayout = true }: { withLayout?: boolean }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return withLayout ? (
    <Layout />
  ) : (
    <Outlet />
  );
}

function NotFound() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <p className="font-serif text-7xl font-medium text-brand-600">404</p>
      <p className="text-sm text-muted">{t('errors.notFound')}</p>
      <Link className="btn-secondary" to="/">
        {t('admin.backHome')}
      </Link>
    </div>
  );
}

export default function App() {
  const { t } = useTranslation();
  return (
    <Suspense fallback={<Spinner label={t('common.loading')} />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route element={<RequireAuth />}>
          <Route path="/" element={<Home />} />
          <Route path="/practice/:skill" element={<Practice />} />
          <Route path="/result/:attemptId" element={<Result />} />
          <Route path="/review" element={<Review />} />
          <Route path="/review/session" element={<ReviewSession />} />
          <Route path="/account" element={<Account />} />
          <Route path="/admin" element={<Admin />} />
        </Route>

        <Route element={<RequireAuth withLayout={false} />}>
          <Route path="/exam/reading/:testId" element={<ReadingExam />} />
          <Route path="/exam/listening/:testId" element={<ListeningExam />} />
          <Route path="/exam/writing/:testId" element={<WritingExam />} />
          <Route path="/exam/speaking/:testId" element={<SpeakingExam />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
