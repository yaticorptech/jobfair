import { useState } from 'react';
import { NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { BadgeCheck, Building2, Gauge, Megaphone, ChevronRight, ClipboardList, Ellipsis, ExternalLink, LayoutDashboard, LogOut, QrCode, Settings as SettingsIcon, Users } from 'lucide-react';
import { setToken, useInfo } from '../lib.jsx';
import { Brand, Credit, Modal, cx } from '../ui.jsx';
import Overview from './Overview.jsx';
import Companies from './Companies.jsx';
import DeskControl from './DeskControl.jsx';
import Announcements from './Announcements.jsx';
import CompanyQueue from './CompanyQueue.jsx';
import QrCodes from './QrCodes.jsx';
import Candidates from './Candidates.jsx';
import Applications from './Applications.jsx';
import Settings from './Settings.jsx';
import AiCourse from './AiCourse.jsx';

// "more" sections are reached through the More button on phones, where the bottom bar has room for five.
// In the side bar the sections follow the day: the overview, running the fair, the records,
// then the setup done before the fair.
const NAV = [
  { to: '/admin', end: true, label: 'Overview', icon: LayoutDashboard },
  { group: 'Fair day', to: '/admin/desks', label: 'Desk control', short: 'Desks', icon: Gauge },
  { group: 'Fair day', to: '/admin/announcements', label: 'Announcements', icon: Megaphone, more: true },
  { group: 'Records', to: '/admin/companies', label: 'Companies', icon: Building2 },
  { group: 'Records', to: '/admin/candidates', label: 'Candidates', icon: Users },
  { group: 'Records', to: '/admin/applications', label: 'Applications', short: 'Applied', icon: ClipboardList, more: true },
  { group: 'Records', to: '/admin/ai-course', label: 'AI Course', icon: BadgeCheck, more: true },
  { group: 'Setup', to: '/admin/qr', label: 'QR codes', icon: QrCode, more: true },
  { group: 'Setup', to: '/admin/settings', label: 'Settings', icon: SettingsIcon, more: true },
];
// The side bar, section by section.
const GROUPS = NAV.reduce((list, item) => {
  const last = list[list.length - 1];
  if (last && last.name === (item.group ?? '')) last.items.push(item);
  else list.push({ name: item.group ?? '', items: [item] });
  return list;
}, []);
const BAR = NAV.filter((item) => !item.more);
const MORE = NAV.filter((item) => item.more);

const sheetRow = 'flex min-h-14 w-full cursor-pointer items-center gap-3.5 rounded-2xl px-3 text-left text-base font-bold text-slate-800 hover:bg-slate-100';

export default function Admin() {
  const { info } = useInfo();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const inMore = MORE.some((item) => pathname.startsWith(item.to));

  function logout() {
    setToken('admin', null);
    navigate('/admin/login', { replace: true });
  }

  return (
    <div className="min-h-dvh bg-slate-50 lg:pl-64 print:min-h-0 print:bg-white print:pl-0!">
      {/* Side bar on laptops. The menus are left out when a page (the QR posters) is printed. */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200/70 bg-white lg:flex print:hidden!">
        <div className="px-5 py-5">
          <Brand name={info.fair_name} to="/admin" />
          <p className="mt-1 pl-[46px] text-xs font-bold text-slate-400">Organiser panel</p>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-3" aria-label="Admin sections">
          {GROUPS.map((group) => (
            <div key={group.name || 'top'} className={group.name ? 'mt-5' : ''}>
              {group.name && <p className="mb-1.5 px-3.5 text-[11px] font-extrabold uppercase tracking-widest text-slate-400">{group.name}</p>}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cx(
                        'flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-[15px] font-bold transition',
                        isActive ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                      )
                    }
                  >
                    <item.icon className="size-5 shrink-0" aria-hidden="true" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="space-y-1 border-t border-slate-100 p-3">
          <a href="/" target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-3 rounded-2xl px-3.5 text-sm font-bold text-slate-600 hover:bg-slate-100">
            <ExternalLink className="size-4.5" aria-hidden="true" /> Open candidate page
          </a>
          <button type="button" onClick={logout} className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-2xl px-3.5 text-sm font-bold text-slate-600 hover:bg-slate-100">
            <LogOut className="size-4.5" aria-hidden="true" /> Logout
          </button>
        </div>
      </aside>

      {/* Top bar on phones and tablets */}
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/95 backdrop-blur lg:hidden print:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <Brand name={info.fair_name} to="/admin" />
          <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">Organiser</span>
        </div>
      </header>

      <main className="w-full px-4 pb-28 pt-5 lg:px-8 lg:pb-10 2xl:px-12 print:m-0 print:max-w-none print:p-0!">
        <Routes>
          <Route index element={<Overview />} />
          <Route path="companies" element={<Companies />} />
          <Route path="companies/:id/queue" element={<CompanyQueue />} />
          <Route path="desks" element={<DeskControl />} />
          <Route path="announcements" element={<Announcements />} />
          <Route path="qr" element={<QrCodes />} />
          <Route path="candidates" element={<Candidates />} />
          <Route path="applications" element={<Applications />} />
          <Route path="ai-course" element={<AiCourse />} />
          <Route path="settings" element={<Settings />} />
        </Routes>
        <Credit className="mt-10" />
      </main>

      {/* Bottom bar on phones and tablets: every section is one tap away */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/70 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden" aria-label="Admin sections">
        <div className="mx-auto grid max-w-xl grid-cols-5">
          {BAR.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className="flex flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[11px] font-bold">
              {({ isActive }) => (
                <>
                  <span className={cx('grid h-8 w-full max-w-14 place-items-center rounded-full transition', isActive ? 'bg-blue-600 text-white' : 'text-slate-500')}>
                    <item.icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className={isActive ? 'text-blue-700' : 'text-slate-500'}>{item.short || item.label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button type="button" onClick={() => setMoreOpen(true)} className="flex cursor-pointer flex-col items-center gap-1 px-1 pb-2 pt-2.5 text-[11px] font-bold">
            <span className={cx('grid h-8 w-full max-w-14 place-items-center rounded-full transition', inMore ? 'bg-blue-600 text-white' : 'text-slate-500')}>
              <Ellipsis className="size-5" aria-hidden="true" />
            </span>
            <span className={inMore ? 'text-blue-700' : 'text-slate-500'}>More</span>
          </button>
        </div>
      </nav>

      <Modal open={moreOpen} title="More" onClose={() => setMoreOpen(false)}>
        <div className="space-y-1">
          {MORE.map((item) => (
            <NavLink key={item.to} to={item.to} onClick={() => setMoreOpen(false)} className={sheetRow}>
              <span className="grid size-10 place-items-center rounded-xl bg-blue-50 text-blue-600">
                <item.icon className="size-5" aria-hidden="true" />
              </span>
              <span className="flex-1">{item.label}</span>
              <ChevronRight className="size-5 text-slate-300" aria-hidden="true" />
            </NavLink>
          ))}
          <a href="/" target="_blank" rel="noopener noreferrer" className={sheetRow}>
            <span className="grid size-10 place-items-center rounded-xl bg-slate-100 text-slate-600">
              <ExternalLink className="size-5" aria-hidden="true" />
            </span>
            <span className="flex-1">Open candidate page</span>
          </a>
          <button type="button" onClick={logout} className={cx(sheetRow, 'text-rose-700')}>
            <span className="grid size-10 place-items-center rounded-xl bg-rose-50 text-rose-600">
              <LogOut className="size-5" aria-hidden="true" />
            </span>
            <span className="flex-1">Logout</span>
          </button>
        </div>
      </Modal>
    </div>
  );
}
