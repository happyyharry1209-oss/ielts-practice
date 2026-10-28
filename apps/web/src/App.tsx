import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Spinner } from './components/ui';
import { useAuth } from './lib/auth';
import Admin from './pages/Admin';
import Home from './pages/Home';
import ListeningExam from './pages/ListeningExam';
import Login from './pages/Login';
import Practice from './pages/Practice';
import ReadingExam from './pages/ReadingExam';
import Register from './pages/Register';
import Result from './pages/Result';
import SpeakingExam from './pages/SpeakingExam';
import WritingExam from './pages/WritingExam';

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
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return withLayout ? (
    <Layout />
  ) : (
    <Outlet />
  );
}

function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
      <p className="text-4xl font-black text-slate-300">404</p>
      <p className="text-sm text-slate-500">Page not found.</p>
      <a className="btn-secondary" href="#/">
        Back to dashboard
      </a>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      <Route element={<RequireAuth />}>
        <Route path="/" element={<Home />} />
        <Route path="/practice/:skill" element={<Practice />} />
        <Route path="/result/:attemptId" element={<Result />} />
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
  );
}
