import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { Building2, ClipboardList, LogOut, ScanQrCode, User } from 'lucide-react';
import { api, setToken, useInfo } from '../lib.jsx';
import { Avatar, Brand, Credit, ErrorNote, PageLoader, cx, useToast } from '../ui.jsx';
import Companies from './Companies.jsx';
import Applications from './Applications.jsx';
import Profile from './Profile.jsx';

// The QR reader is only downloaded when a candidate opens the scanner.
const Scanner = lazy(() => import('./Scanner.jsx'));

// "short" is the name used in the bottom bar on phones, where there is little room.
const TABS = [
  { to: '/dashboard', end: true, label: 'Companies', short: 'Companies', icon: Building2 },
  { to: '/dashboard/scan', label: 'Scan QR', short: 'Scan QR', icon: ScanQrCode },
  { to: '/dashboard/applications', label: 'My applications', short: 'Applications', icon: ClipboardList, badge: true },
  { to: '/dashboard/profile', label: 'My profile', short: 'Profile', icon: User },
];

export default function Dashboard() {
  const { info, refresh: refreshInfo } = useInfo();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();
  const [me, setMe] = useState(null);
  const [companies, setCompanies] = useState(null);
  const [error, setError] = useState('');

  const loadCompanies = useCallback(() => api('/companies').then(setCompanies), []);

  const loadAll = useCallback(() => {
    setError('');
    Promise.all([api('/me'), api('/companies')])
      .then(([profile, list]) => {
        setMe(profile);
        setCompanies(list);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(loadAll, [loadAll]);

  // Keep desk numbers, tokens and results fresh while the page is open.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      loadCompanies().catch(() => {});
      refreshInfo();
    };
    const timer = setInterval(tick, 20000); // often enough to follow the "now serving" token
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [loadCompanies, refreshInfo]);

  // Shown once only: React runs this twice in development, before the state is cleared.
  const welcomed = useRef(false);
  useEffect(() => {
    if (location.state?.welcome && !welcomed.current) {
      welcomed.current = true;
      toast('Registration successful. Next time, log in with your mobile number.');
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location, navigate, toast]);

  function logout() {
    setToken('candidate', null);
    navigate('/', { replace: true });
  }

  if (error) return <ErrorNote message={error} onRetry={loadAll} />;
  if (!me || !companies) return <PageLoader />;

  const applied = companies.filter((c) => c.application).length;

  return (
    <div className="min-h-dvh bg-slate-50 pb-28 sm:pb-12">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 lg:max-w-5xl">
          <Brand name={info.fair_name} to="/dashboard" />
          <div className="flex shrink-0 items-center gap-2">
            <Link to="/dashboard/profile" aria-label="My profile" className="flex items-center gap-2.5 rounded-full py-1 pl-1 hover:bg-slate-100 sm:pr-3">
              <Avatar name={me.full_name} round className="size-9 text-xs" />
              <span className="hidden text-sm font-bold text-slate-800 sm:block">{me.full_name}</span>
            </Link>
            <button type="button" onClick={logout} className="hidden min-h-10 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-bold text-slate-600 hover:bg-slate-100 sm:inline-flex">
              <LogOut className="size-4" aria-hidden="true" /> Logout
            </button>
          </div>
        </div>
        {/* Tabs on tablets and laptops */}
        <nav className="mx-auto hidden max-w-3xl gap-1 px-4 sm:flex lg:max-w-5xl" aria-label="Sections">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                cx(
                  '-mb-px inline-flex items-center gap-2 border-b-[3px] px-3 py-3 text-sm font-bold transition',
                  isActive ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800',
                )
              }
            >
              <tab.icon className="size-4.5" aria-hidden="true" />
              {tab.label}
              {tab.badge && applied > 0 && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-extrabold text-white">{applied}</span>}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5 lg:max-w-5xl">
        <Routes>
          <Route index element={<Companies me={me} companies={companies} info={info} />} />
          <Route
            path="scan"
            element={
              <Suspense fallback={<PageLoader />}>
                <Scanner />
              </Suspense>
            }
          />
          <Route path="applications" element={<Applications companies={companies} reload={loadCompanies} />} />
          <Route path="profile" element={<Profile me={me} setMe={setMe} onLogout={logout} />} />
        </Routes>
        <Credit className="mt-8" />
      </main>

      {/* Bottom bar on phones */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/70 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden" aria-label="Sections">
        <div className="grid grid-cols-4">
          {TABS.map((tab) => (
            <NavLink key={tab.to} to={tab.to} end={tab.end} className="flex flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[11px] font-bold">
              {({ isActive }) => (
                <>
                  <span className={cx('relative grid h-8 w-14 place-items-center rounded-full transition', isActive ? 'bg-blue-600 text-white' : 'text-slate-500')}>
                    <tab.icon className="size-5" aria-hidden="true" />
                    {tab.badge && applied > 0 && (
                      <span className="absolute -right-1 -top-1 min-w-4.5 rounded-full bg-amber-400 px-1 text-center text-[10px] font-extrabold leading-[18px] text-slate-900 ring-2 ring-white">
                        {applied}
                      </span>
                    )}
                  </span>
                  <span className={isActive ? 'text-blue-700' : 'text-slate-500'}>{tab.short}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
