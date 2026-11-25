import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { getToken, useInfo } from './lib.jsx';
import { ErrorNote, PageLoader } from './ui.jsx';
import Landing from './Landing.jsx';
import Login from './Login.jsx';
import Register from './Register.jsx';
import Dashboard from './candidate/Dashboard.jsx';
import CompanyPage from './CompanyPage.jsx';

// The admin panel and the company dashboard are only needed by the organisers and the
// companies, so candidates' phones never download them.
const Admin = lazy(() => import('./admin/Admin.jsx'));
const AdminLogin = lazy(() => import('./admin/AdminLogin.jsx'));
const CompanyDashboard = lazy(() => import('./company/CompanyDashboard.jsx'));
const CompanyLogin = lazy(() => import('./company/CompanyLogin.jsx'));
const CompanyRegister = lazy(() => import('./company/CompanyRegister.jsx'));
const Interview = lazy(() => import('./company/Interview.jsx'));

function CandidateOnly({ children }) {
  return getToken('candidate') ? children : <Navigate to="/login" replace />;
}

function CompanyOnly({ children }) {
  return getToken('recruiter') ? children : <Navigate to="/company/login" replace />;
}

function AdminOnly({ children }) {
  return getToken('admin') ? children : <Navigate to="/admin/login" replace />;
}

export default function App() {
  const { info, failed, refresh } = useInfo();

  if (!info) {
    return failed ? (
      <ErrorNote message={failed} onRetry={refresh} />
    ) : (
      <PageLoader />
    );
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<Login />} />
        <Route
          path="/dashboard/*"
          element={
            <CandidateOnly>
              <Dashboard />
            </CandidateOnly>
          }
        />
        {/* Where a desk QR code leads: the company that has activated that desk */}
        <Route path="/c/:id" element={<CompanyPage />} />
        {/* Where the company registration QR code leads: a company registers itself */}
        <Route path="/r/:code" element={<CompanyRegister />} />
        <Route path="/company/login" element={<CompanyLogin />} />
        <Route
          path="/company"
          element={
            <CompanyOnly>
              <CompanyDashboard />
            </CompanyOnly>
          }
        />
        <Route
          path="/company/interview/:id"
          element={
            <CompanyOnly>
              <Interview />
            </CompanyOnly>
          }
        />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin/*"
          element={
            <AdminOnly>
              <Admin />
            </AdminOnly>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
