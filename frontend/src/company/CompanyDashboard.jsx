import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Bell, BellRing, Briefcase, LayoutDashboard, CircleCheck, Coffee, ListOrdered, QrCode, RotateCcw, Settings as SettingsIcon, UtensilsCrossed, ClipboardCheck, Download, LogOut, Mail, Megaphone, Phone, Play, RefreshCw, ScanQrCode, Users, X } from 'lucide-react';
import { STATUS, api, download, experienceText, fmtDate, fmtTime, formatCode, setToken, useInfo } from '../lib.jsx';
import { AccessCode, Avatar, Brand, Button, Credit, Empty, ErrorNote, Modal, PageLoader, Pager, RoomBadge, TokenBadge, cx, rangeLabel, usePageSize, usePaging, useToast } from '../ui.jsx';
import { SearchBox, useDebounced } from '../admin/shared.jsx';
import CompanyProfile from './CompanyProfile.jsx';
import CompanyStats from './CompanyStats.jsx';
import QueueBoard from './QueueBoard.jsx';
import AnnouncementFeed from '../AnnouncementFeed.jsx';
import NotificationList, { NotificationBell, useUnread } from '../Notifications.jsx';
import DeskQr from './DeskQr.jsx';
import ActivateDesk from './ActivateDesk.jsx';
import { scoreText } from './Interview.jsx';


// "applied" means the candidate has a token and is waiting to be interviewed.
const LIST_PLACE = 'jobfair_company_list';
function readListPlace() {
  const fallback = { status: 'applied', q: '', page: 1, total: 0 };
  try {
    return { ...fallback, ...JSON.parse(sessionStorage.getItem(LIST_PLACE) || '{}') };
  } catch {
    return fallback;
  }
}

// Pending first (still to be interviewed), then completed (have a result), then everyone.
const FILTERS = [
  { key: 'applied', label: 'Pending', count: 'applied' },
  { key: 'done', label: 'Completed', count: 'done' },
  { key: '', label: 'All', count: 'total' },
  { key: 'interviewed', label: 'Interview done', count: 'interviewed' },
  { key: 'shortlisted', label: 'Shortlisted', count: 'shortlisted' },
  { key: 'selected', label: 'Selected', count: 'selected' },
  { key: 'rejected', label: 'Not selected', count: 'rejected' },
];

const statusLabel = (key) => (key === 'applied' ? 'Waiting' : STATUS[key].label);

// Where a candidate without a result is in the queue: 'now' (at the desk), 'missed' (their turn went
// by: a later token was called, or they were called and the desk moved on without a result) or ''
// (still waiting their turn). The same rule as on the server.
function queueTag(row, queue) {
  if (row.status !== 'applied' || !queue) return '';
  if (row.called_at && row.token_no === queue.now_serving) return 'now';
  if (row.called_at || row.token_no < queue.now_serving) return 'missed';
  if (queue.at_desk?.includes(row.token_no)) return 'desk';
  return queue.get_ready === row.token_no ? 'ready' : '';
}
const TAG = {
  now: ['At the desk now', 'bg-blue-600 text-white ring-blue-600'],
  missed: ['Missed', 'bg-amber-100 text-amber-900 ring-amber-300'],
  desk: ['Wait at desk', 'bg-blue-50 text-blue-800 ring-blue-200'],
  ready: ['Get ready', 'bg-violet-50 text-violet-800 ring-violet-200'],
};

// A candidate who was not at the desk when their turn came and was given a new token.
function RescheduledTag({ row }) {
  if (!row.rescheduled_from) return null;
  return (
    <span
      title={`Was token ${row.rescheduled_from}, now token ${row.token_no}`}
      className="inline-flex items-center gap-1 rounded-full bg-fuchsia-50 px-2.5 py-0.5 text-xs font-extrabold text-fuchsia-800 ring-1 ring-inset ring-fuchsia-200"
    >
      <RotateCcw className="size-3" aria-hidden="true" /> Rescheduled · was token {row.rescheduled_from}
    </span>
  );
}

function QueueTag({ tag }) {
  if (!tag) return null;
  return <span className={cx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-extrabold ring-1 ring-inset', TAG[tag][1])}>{TAG[tag][0]}</span>;
}

// The desk's queue: the token being served, one big button for the next one, and the tokens that
// were missed (not there when their turn came), which are called in one by one when they come.
function QueuePanel({ queue, busy, onNext, onCall, onReschedule, hideMissed = false }) {
  return (
    <section aria-label="Interview queue" className="rounded-3xl bg-white p-4 shadow-xs ring-1 ring-slate-900/5 sm:p-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="grid size-20 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-800 ring-1 ring-inset ring-blue-200">
            <span className="text-center leading-none">
              <span className="block text-[10px] font-extrabold uppercase tracking-widest text-blue-500">Now</span>
              <span className="mt-1 block text-3xl font-extrabold tabular-nums">{queue.now_serving || '–'}</span>
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Now serving</p>
            <p className="truncate text-lg font-extrabold text-slate-900">
              {queue.now_serving ? `Token ${queue.now_serving}${queue.now_serving_name ? ` · ${queue.now_serving_name}` : ''}` : 'No one called yet'}
            </p>
            <p className="text-sm text-slate-500">{queue.waiting} waiting</p>
          </div>
        </div>
        <Button size="lg" onClick={onNext} loading={busy === 'next'} disabled={!queue.next_token || Boolean(busy)} className="w-full sm:w-auto">
          {busy !== 'next' && <Megaphone className="size-5" aria-hidden="true" />}
          {queue.next_token ? `Call next · token ${queue.next_token}` : 'No one waiting'}
        </Button>
      </div>
      {queue.now_serving_id && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-50 px-3.5 py-2.5 ring-1 ring-inset ring-slate-200">
          <p className="text-sm font-semibold text-slate-600">Token {queue.now_serving} not here? Move them to the end of the queue with a new token.</p>
          <Button size="sm" variant="secondary" onClick={() => onReschedule({ id: queue.now_serving_id, token_no: queue.now_serving })} loading={busy === `r${queue.now_serving_id}`} disabled={Boolean(busy)}>
            <RotateCcw className="size-4" aria-hidden="true" /> Reschedule
          </Button>
        </div>
      )}
      {(queue.at_desk?.length > 0 || queue.get_ready) && (
        <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-slate-100 pt-3.5 text-sm font-bold">
          {queue.at_desk?.length > 0 && (
            <p className="flex items-center gap-2 text-blue-800">
              Wait at desk
              {queue.at_desk.map((t) => (
                <span key={t} className="grid min-w-9 place-items-center rounded-full bg-blue-50 px-2.5 py-1 font-extrabold tabular-nums ring-1 ring-inset ring-blue-200">{t}</span>
              ))}
            </p>
          )}
          {queue.get_ready && (
            <p className="flex items-center gap-2 text-violet-800">
              Get ready
              <span className="grid min-w-9 place-items-center rounded-full bg-violet-50 px-2.5 py-1 font-extrabold tabular-nums ring-1 ring-inset ring-violet-200">{queue.get_ready}</span>
            </p>
          )}
        </div>
      )}
      {!hideMissed && queue.missed.length > 0 && (
        <div className="mt-4 rounded-2xl bg-amber-50 p-3.5 ring-1 ring-inset ring-amber-200">
          <p className="text-sm font-bold text-amber-950">
            Missed: their turn went by without a result. Call them in if they are here now, or reschedule to give them a new token at the end of the queue.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {queue.missed.map((m) => (
              <span key={m.id} className="inline-flex items-center rounded-full bg-white ring-1 ring-inset ring-amber-300">
              <button
                type="button"
                onClick={() => onCall(m)}
                disabled={Boolean(busy)}
                aria-label={`Call in token ${m.token_no}`}
                className="inline-flex min-h-11 min-w-14 cursor-pointer items-center justify-center gap-1.5 rounded-l-full px-4 text-base font-extrabold tabular-nums text-amber-950 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <BellRing className="size-4" aria-hidden="true" /> {m.token_no}
              </button>
              <button
                type="button"
                onClick={() => onReschedule(m)}
                disabled={Boolean(busy)}
                aria-label={`Reschedule token ${m.token_no}`}
                title="Reschedule: new token at the end of the queue"
                className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-r-full border-l border-amber-200 px-3 text-sm font-bold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RotateCcw className="size-4" aria-hidden="true" /> Reschedule
              </button>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

// The desk's break switch: interviewing, a short break, or lunch. Waiting candidates see it on their
// screen, and calling them in waits until the break ends.
const BREAK_LABEL = { break: 'Short break', lunch: 'Lunch break' };

const STATUS_OPTIONS = [
  {
    kind: null,
    label: 'Interviewing',
    Icon: Play,
    desc: 'Desk is open. You call tokens and run interviews.',
    seen: 'Candidates see the token at your desk and when to come.',
    on: 'bg-emerald-50 ring-emerald-500 text-emerald-950',
    chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    icon: 'bg-emerald-600 text-white',
  },
  {
    kind: 'break',
    label: 'Short break',
    Icon: Coffee,
    desc: 'A few minutes away. Calling tokens waits.',
    seen: 'Candidates see “The company is on a short break” and that their token is safe.',
    on: 'bg-amber-50 ring-amber-500 text-amber-950',
    chip: 'bg-amber-50 text-amber-800 ring-amber-200',
    icon: 'bg-amber-500 text-white',
  },
  {
    kind: 'lunch',
    label: 'Lunch break',
    Icon: UtensilsCrossed,
    desc: 'Away for lunch. Calling tokens waits.',
    seen: 'Candidates see “The company is on lunch break” and that their token is safe.',
    on: 'bg-orange-50 ring-orange-500 text-orange-950',
    chip: 'bg-orange-50 text-orange-800 ring-orange-200',
    icon: 'bg-orange-600 text-white',
  },
];

// The desk's status: three large choices, the current one lit, with what candidates see.
function DeskStatusCard({ queue, busy, onChange }) {
  const current = queue.on_break ?? null;
  const active = STATUS_OPTIONS.find((o) => o.kind === current);
  return (
    <section aria-labelledby="desk-status" className="rounded-3xl bg-white p-5 shadow-xs ring-1 ring-slate-900/5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="desk-status" className="text-lg font-extrabold text-slate-900">Desk status</h2>
          <p className="text-sm text-slate-500">Switch when you step away. Waiting candidates are told on their phones.</p>
        </div>
        <span className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold ring-1 ring-inset', active.chip)}>
          <span className={cx('size-2 rounded-full', current ? 'bg-current' : 'bg-emerald-500')} aria-hidden="true" />
          {active.label}
          {current && queue.break_since ? ` · since ${fmtTime(queue.break_since).split(', ').pop()}` : ''}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3" role="radiogroup" aria-label="Set desk status">
        {STATUS_OPTIONS.map((o) => {
          const on = o.kind === current;
          return (
            <button
              key={o.label}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={busy}
              onClick={() => !on && onChange(o.kind)}
              className={cx(
                'group relative flex cursor-pointer flex-col items-start gap-3 rounded-2xl p-4 text-left ring-1 ring-inset transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-wait',
                on ? cx(o.on, 'ring-2') : 'bg-white text-slate-900 ring-slate-200 hover:bg-slate-50 hover:ring-slate-300',
              )}
            >
              <span className={cx('grid size-10 place-items-center rounded-xl transition', on ? o.icon : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200')}>
                <o.Icon className="size-5" aria-hidden="true" />
              </span>
              <span>
                <span className="block font-extrabold">{o.label}</span>
                <span className={cx('mt-0.5 block text-sm leading-snug', on ? 'opacity-80' : 'text-slate-500')}>{o.desc}</span>
              </span>
              {on && <CircleCheck className="absolute right-3.5 top-3.5 size-5" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <p className="mt-4 flex items-start gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <Users className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden="true" />
        <span>
          <span className="font-bold text-slate-800">What candidates see: </span>
          {active.seen}
        </span>
      </p>
    </section>
  );
}

// The interview button on each candidate: start it (which calls the candidate in), carry on, or look back at it.
function InterviewButton({ row, busy, onClick, className }) {
  const done = row.status !== 'applied';
  const label = done ? 'View interview' : row.interview ? 'Continue interview' : 'Start interview';
  const Icon = done ? ClipboardCheck : Play;
  return (
    <Button size="sm" variant={done ? 'secondary' : 'primary'} onClick={() => onClick(row)} loading={busy === row.id} className={cx('shrink-0 whitespace-nowrap', className)}>
      {busy !== row.id && <Icon className="size-4" aria-hidden="true" />} {label}
    </Button>
  );
}

function ResultTag({ row }) {
  return (
    <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset', STATUS[row.status]?.cls)}>
      {statusLabel(row.status)}
      {row.interview?.score != null && <span className="tabular-nums">· {scoreText(row.interview.score)}</span>}
    </span>
  );
}

function Info({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="break-words text-sm font-semibold text-slate-900">{children || '—'}</dd>
    </div>
  );
}

function CandidateModal({ row, queue, onClose, onChange, onInterview, busy }) {
  const tag = queueTag(row, queue);
  return (
    <Modal
      open
      wide
      title={`Token ${row.token_no}`}
      onClose={onClose}
      footer={
        <Button size="lg" onClick={onClose}>
          Close
        </Button>
      }
    >
      <div className="flex items-center gap-3">
        <Avatar name={row.full_name} round className="size-14 text-lg" />
        <div className="min-w-0">
          <p className="text-lg font-extrabold leading-tight text-slate-900">{row.full_name}</p>
          <p className="text-sm text-slate-500">
            {row.reg_no}
            {row.role ? ` · Applied for ${row.role}` : ''}
          </p>
          <QueueTag tag={tag} />
          <RescheduledTag row={row} />
        </div>
      </div>

      <InterviewButton row={row} busy={busy} onClick={onInterview} className="mt-4 min-h-12 w-full text-base" />

      <div className="mt-4 flex flex-wrap gap-2">
        <Button as="a" href={`tel:${row.mobile}`} variant="soft">
          <Phone className="size-4" aria-hidden="true" /> Call {row.mobile}
        </Button>
        <Button as="a" href={`mailto:${row.email}`} variant="secondary" className="min-w-0">
          <Mail className="size-4 shrink-0" aria-hidden="true" /> <span className="truncate">{row.email}</span>
        </Button>
      </div>

      <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <Info label="Qualification">{[row.qualification, row.specialization].filter(Boolean).join(' · ')}</Info>
        <Info label="College / institute">{row.college}</Info>
        <Info label="Year of passing">{row.passing_year}</Info>
        <Info label="Percentage / CGPA">{row.percentage}</Info>
        <Info label="Experience">
          {experienceText(row)}
          {row.experience_type === 'experienced' && (row.last_role || row.last_company) ? ` · ${[row.last_role, row.last_company].filter(Boolean).join(' at ')}` : ''}
        </Info>
        <Info label="Key skills">{row.skills}</Info>
        <Info label="Languages">{row.languages}</Info>
        <Info label="Looking for">{row.preferred_role}</Info>
        <Info label="Gender">{row.gender}</Info>
        <Info label="Date of birth">{fmtDate(row.dob, false)}</Info>
        <Info label="City / town">{row.city}</Info>
        <Info label="Applied at">{fmtTime(row.created_at)}</Info>
      </dl>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <p className="mb-2.5 font-bold text-slate-800">Result</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.keys(STATUS).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onChange(row, key)}
              aria-pressed={row.status === key}
              className={cx(
                'min-h-12 cursor-pointer rounded-2xl px-3 text-sm font-bold ring-1 ring-inset transition',
                row.status === key ? cx(STATUS[key].cls, 'ring-2') : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
              )}
            >
              {statusLabel(key)}
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// The sections of the dashboard, each its own page: a side bar on laptops, a bottom bar on phones.
const NAV = [
  { to: '/company', end: true, label: 'Dashboard', short: 'Home', icon: LayoutDashboard },
  { to: '/company/queue', label: 'Live queue', short: 'Queue', icon: ListOrdered },
  { to: '/company/candidates', label: 'Candidates', icon: Users },
  { to: '/company/jobs', label: 'Company and jobs', short: 'Jobs', icon: Briefcase },
  { to: '/company/desk', label: 'Desk QR', icon: QrCode },
  { to: '/company/settings', label: 'Settings', icon: SettingsIcon },
];

// The side bar's notifications link, with the number of new ones.
function SidebarNotifications() {
  const unread = useUnread('/recruiter/notifications');
  return (
    <NavLink
      to="/company/notifications"
      className={({ isActive }) =>
        cx('mb-1 flex min-h-11 items-center gap-3 rounded-2xl px-3.5 text-sm font-bold transition', isActive ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100')
      }
    >
      <Bell className="size-4.5" aria-hidden="true" />
      <span className="flex-1">Notifications</span>
      {unread > 0 && <span className="rounded-full bg-rose-600 px-2 py-0.5 text-xs font-extrabold text-white">{unread}</span>}
    </NavLink>
  );
}

function PageHead({ title, sub, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-slate-900">{title}</h1>
        {sub && <p className="text-slate-500">{sub}</p>}
      </div>
      {children && <div className="flex w-full flex-wrap gap-2 *:flex-1 sm:w-auto sm:*:flex-none">{children}</div>}
    </div>
  );
}

// A small number tile on the queue page.
function Stat({ label, value, tone = 'text-slate-900', onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-2xl bg-white p-4 text-left shadow-xs ring-1 ring-slate-900/5 transition hover:ring-blue-300"
    >
      <p className={cx('text-2xl font-extrabold tabular-nums', tone)}>{value}</p>
      <p className="text-xs font-bold text-slate-500">{label}</p>
    </button>
  );
}

export default function CompanyDashboard() {
  const { info, refresh: refreshInfo } = useInfo();
  const navigate = useNavigate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const welcome = params.get('welcome') === '1'; // has just registered through the company registration QR code
  const [company, setCompany] = useState(null);
  const [accessCode, setAccessCode] = useState('');
  const [data, setData] = useState(null); // { total, counts, rows }
  const [error, setError] = useState('');
  // The page, filter and search are kept for this browser tab, so coming back from an interview
  // opens the list where the company left it.
  const [saved] = useState(readListPlace);
  const [status, setStatus] = useState(saved.status);
  const [q, setQ] = useState(saved.q);
  const search = useDebounced(q.trim());
  const [total, setTotal] = useState(saved.total);
  const PAGE = usePageSize(10, 20);
  const paging = usePaging(total, PAGE, `${status}|${search}|${PAGE}`, { initial: saved.page });
  const { page } = paging;
  useEffect(() => {
    try {
      sessionStorage.setItem(LIST_PLACE, JSON.stringify({ status, q, page, total }));
    } catch {
      /* private mode: the list simply opens on page 1 */
    }
  }, [status, q, page, total]);
  const [openId, setOpenId] = useState(null);
  const { pathname } = useLocation();
  const section = pathname.replace(/\/+$/, '').split('/')[2] || 'dashboard'; // dashboard | queue | candidates | jobs | desk | settings
  const [orgAlert, setOrgAlert] = useState(null); // a break the organisers started or ended
  const [notifyAllowed, setNotifyAllowed] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'));
  const [atDesk, setAtDesk] = useState(false); // has a desk: scanned its desk QR code once, after registering
  const [activating, setActivating] = useState(false); // the sheet where the QR code at the desk is scanned
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [calling, setCalling] = useState(''); // 'next' or the id of the application being called in
  // Only the answer to the newest request is shown, so a slow old one cannot overwrite it.
  const latest = useRef(0);

  const load = useCallback(() => {
    const ticket = ++latest.current;
    const params = new URLSearchParams({ limit: String(PAGE), offset: String((page - 1) * PAGE) });
    if (status) params.set('status', status);
    if (search) params.set('q', search);
    return api(`/recruiter/applications?${params}`).then((result) => {
      if (ticket === latest.current) {
        setData(result);
        setTotal(result.total);
        setError('');
      }
    });
  }, [status, search, page, PAGE]);

  useEffect(() => {
    api('/recruiter/me')
      .then((me) => {
        setCompany(me.company);
        setAccessCode(me.access_code || '');
        // A company with a desk (scanned once, or placed by the organisers) never scans again.
        const hasDesk = Boolean(me.at_desk || me.company.desk_id || me.company.room_no);
        setAtDesk(hasDesk);
        if (!hasDesk) {
          setData((old) => old ?? { rows: [], total: 0, counts: me.counts, queue: me.queue });
          setActivating(true); // the one thing to do first: open the scanner straight away
        }
        // A company that has just registered, or has not listed any job yet, starts on the screen
        // where it adds them. This is decided once, so adding the first job does not move the company to another screen.
        if (hasDesk && (welcome || me.company.jobs.length === 0) && section === 'dashboard') navigate('/company/jobs', { replace: true });
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (atDesk) load().catch((err) => setError(err.message));
  }, [load, atDesk]);

  // New candidates keep arriving during the fair, so the list refreshes by itself.
  useEffect(() => {
    if (!atDesk) return undefined;
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      load().catch(() => {});
      refreshInfo(); // picks up the organisers pausing or restarting interviews
    };
    const timer = setInterval(tick, 15000); // often enough to pick up the organisers' break changes
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load, atDesk, refreshInfo]);

  function logout() {
    setToken('recruiter', null);
    navigate('/company/login', { replace: true });
  }

  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setRefreshing(false);
    }
  }

  async function changeStatus(row, next) {
    if (row.status === next) return;
    const setRowStatus = (value) =>
      setData((old) => old && { ...old, rows: old.rows.map((r) => (r.id === row.id ? { ...r, status: value } : r)) });
    setRowStatus(next);
    try {
      const result = await api(`/recruiter/applications/${row.id}`, { method: 'PUT', body: { status: next } });
      setData((old) => old && { ...old, counts: result.counts, queue: result.queue });
      toast(`${row.full_name}: ${statusLabel(next)}`);
    } catch (err) {
      setRowStatus(row.status);
      toast(err.message, 'error');
    }
  }

  async function callNext() {
    setCalling('next');
    try {
      const result = await api('/recruiter/queue/next', { method: 'POST' });
      toast(`Token ${result.called.token_no}: ${result.called.full_name}, please come in`);
      await load();
    } catch (err) {
      toast(err.message, 'error');
      load().catch(() => {});
    } finally {
      setCalling('');
    }
  }

  async function setBreak(kind) {
    setCalling('break');
    try {
      const result = await api('/recruiter/break', { method: 'POST', body: { kind } });
      setData((old) => old && { ...old, queue: result.queue });
      toast(kind ? `${BREAK_LABEL[kind]} started. Candidates can see it.` : 'Break over. Interviews are back on.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setCalling('');
    }
  }

  async function reschedule(row) {
    setCalling(`r${row.id}`);
    try {
      const result = await api(`/recruiter/applications/${row.id}/reschedule`, { method: 'POST' });
      toast(`Token ${result.old_token} rescheduled · new token ${result.token_no}`);
      await load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setCalling('');
    }
  }

  async function callIn(row) {
    setCalling(row.id);
    try {
      await api(`/recruiter/applications/${row.id}/call`, { method: 'POST' });
      toast(`Token ${row.token_no} called in`);
      await load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setCalling('');
    }
  }

  // The organisers started or ended a break for this desk (or every desk): tell the company once,
  // on screen and, when allowed, as a browser notification. Remembered per change on this device.
  const breakChange = data?.queue?.break_changed_at;
  const breakBy = data?.queue?.break_by;
  useEffect(() => {
    if (!breakChange || !String(breakBy).startsWith('admin') || !company) return;
    const key = `jobfair_break_seen_${company.id}`;
    let seen = '';
    try {
      seen = localStorage.getItem(key) || '';
    } catch {
      /* private mode: shown once per visit */
    }
    if (seen >= breakChange) return;
    // Only recent changes: an old one is already over and done with.
    if (Date.now() - Date.parse(`${breakChange.replace(' ', 'T')}Z`) > 3 * 3600 * 1000) return;
    try {
      localStorage.setItem(key, breakChange);
    } catch {
      /* ignore */
    }
    const kind = data.queue.on_break;
    const everyone = breakBy === 'admin-all';
    const alert = {
      kind,
      title: kind ? `The organisers started a ${kind === 'lunch' ? 'lunch break' : 'short break'}` : 'The organisers ended the break',
      text: kind
        ? `${everyone ? 'Every desk is' : 'Your desk is'} now on ${kind === 'lunch' ? 'lunch break' : 'a short break'}. Waiting candidates see it on their phones, and calling tokens is paused until the break ends.`
        : `${everyone ? 'All desks are' : 'Your desk is'} back to interviewing. You can call the next token now.`,
    };
    setOrgAlert(alert);
    if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
      try {
        new Notification(alert.title, { body: alert.text, icon: '/icon-192.png', tag: `break-${breakChange}` });
      } catch {
        /* some browsers only allow notifications from a service worker */
      }
    }
  }, [breakChange, breakBy, company, data?.queue?.on_break]);

  const patchRow = (id, changes) =>
    setData((old) => old && { ...old, rows: old.rows.map((r) => (r.id === id ? { ...r, ...changes } : r)) });

  // Starting an interview calls the candidate in, so their token shows as "now" on every phone,
  // and opens the interview page.
  async function openInterview(row) {
    setOpenId(null);
    if (row.status === 'applied') {
      setCalling(row.id);
      try {
        await api(`/recruiter/applications/${row.id}/start`, { method: 'POST' });
      } catch (err) {
        toast(err.message, 'error');
        setCalling('');
        return;
      }
    }
    navigate(`/company/interview/${row.id}`);
  }

  async function exportAll() {
    setExporting(true);
    try {
      await download('/recruiter/export', 'candidates.xlsx');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setExporting(false);
    }
  }

  if (!company || !data) return error ? <ErrorNote message={error} onRetry={() => window.location.reload()} /> : <PageLoader />;

  const { counts, rows, queue } = data;
  const open = rows.find((r) => r.id === openId);
  const filtered = Boolean(status || search);
  // Until it scans the QR code at its desk (once, after registering), the company has no desk and
  // nothing else opens. A company that the organisers placed at a desk has one without scanning.
  const needsDesk = !atDesk;
  const onBreak = queue.on_break;

  function deskActivated(updated) {
    setCompany(updated);
    setActivating(false);
    setAtDesk(true);
    navigate(updated.jobs.length === 0 ? '/company/jobs' : '/company', { replace: true }); // next: add the job openings
    toast(`You are at desk ${updated.room_no}. Candidates who scan its QR code see your company.`);
  }

  const showList = (key) => {
    setStatus(key);
    navigate('/company/candidates');
  };

  const deskChip = (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-extrabold ring-1 ring-inset',
        onBreak === 'lunch' ? 'bg-orange-50 text-orange-800 ring-orange-200' : onBreak === 'break' ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-emerald-50 text-emerald-800 ring-emerald-200',
      )}
    >
      {onBreak === 'lunch' ? <UtensilsCrossed className="size-3.5" aria-hidden="true" /> : onBreak === 'break' ? <Coffee className="size-3.5" aria-hidden="true" /> : <span className="size-2 rounded-full bg-emerald-500" aria-hidden="true" />}
      {onBreak ? BREAK_LABEL[onBreak] : 'Interviewing'}
    </span>
  );

  const pausedNote = info.interviews_open === false && (
    <section role="status" className="rounded-3xl bg-rose-50 p-4 text-rose-950 ring-1 ring-inset ring-rose-300 print:hidden">
      <p className="font-extrabold">Interviews are paused by the organisers</p>
      <p className="mt-0.5 text-[15px]">You can see your candidates, but calling tokens, starting interviews and giving results are stopped until the organisers start them again.</p>
    </section>
  );

  const breakNote = onBreak && (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl bg-amber-50 p-4 text-amber-950 ring-1 ring-inset ring-amber-300 print:hidden">
      <p className="text-[15px] font-bold">
        Your desk is on {onBreak === 'lunch' ? 'lunch break' : 'a short break'}. Waiting candidates can see it. End it to call the next token.
      </p>
      <Button size="sm" onClick={() => setBreak(null)} loading={calling === 'break'}>
        <Play className="size-4" aria-hidden="true" /> Resume interviews
      </Button>
    </div>
  );

  let screen;
  if (section === 'notifications') {
    screen = <NotificationList path="/recruiter/notifications" seenPath="/recruiter/notifications/seen" empty="Announcements from the organisers and breaks they start or end appear here." />;
  } else if (section === 'dashboard') {
    screen = (
      <>
        <PageHead title="Dashboard" sub={`${company.name} · desk ${company.room_no || '—'} · live, refreshed every 30 seconds`}>
          <Button variant="secondary" onClick={() => navigate('/company/queue')}>
            <ListOrdered className="size-4" aria-hidden="true" /> Open live queue
          </Button>
        </PageHead>
        <CompanyStats onShow={showList} />
      </>
    );
  } else if (section === 'jobs') {
    screen = (
      <>
        <PageHead title="Company and jobs" sub="What candidates see about your company and the jobs they can apply for" />
        <CompanyProfile company={company} onSaved={setCompany} />
      </>
    );
  } else if (section === 'desk') {
    screen = (
      <>
        <PageHead title="Desk QR" sub={`The poster at desk ${company.room_no || '—'}: candidates scan it to see your jobs and apply`} />
        <DeskQr company={company} accessCode={accessCode} onActivate={() => setActivating(true)} />
      </>
    );
  } else if (section === 'settings') {
    screen = (
      <>
        <PageHead title="Settings" sub="Your desk during the fair, and access for your team" />
        <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
          <div className="space-y-4 lg:col-span-2">
            <DeskStatusCard queue={queue} busy={calling === 'break'} onChange={setBreak} />

            <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl bg-white p-5 shadow-xs ring-1 ring-slate-900/5 sm:p-6">
              <div className="flex min-w-0 items-start gap-3.5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
                  <LogOut className="size-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <h2 className="font-extrabold text-slate-900">Log out of this device</h2>
                  <p className="text-sm text-slate-500">Your desk, candidates and interviews stay with your company. Log back in with the access code.</p>
                </div>
              </div>
              <Button variant="secondary" onClick={logout} className="w-full sm:w-auto">
                Log out
              </Button>
            </section>
          </div>

          <aside className="space-y-4">
            {/* The company's own desk, at a glance */}
            <section className="overflow-hidden rounded-3xl bg-white shadow-xs ring-1 ring-slate-900/5">
              <div className="flex items-center gap-4 border-b border-slate-100 bg-linear-to-br from-amber-50 to-white p-5">
                <span className="grid min-w-14 place-items-center rounded-2xl bg-amber-100 px-2 py-2 text-center text-amber-950 ring-1 ring-inset ring-amber-200">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest">Desk</span>
                  <span className="text-2xl font-extrabold leading-none tabular-nums">{company.room_no || '–'}</span>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-lg font-extrabold text-slate-900">{company.name}</span>
                  <span className="block truncate text-sm text-slate-500">{company.location || 'Floor not set'}</span>
                </span>
              </div>
              <dl className="grid grid-cols-3 divide-x divide-slate-100 text-center">
                {[
                  ['Applied', counts.total],
                  ['Waiting', counts.applied],
                  ['Jobs', company.jobs.length],
                ].map(([label, value]) => (
                  <div key={label} className="py-3.5">
                    <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
                    <dd className="text-lg font-extrabold tabular-nums text-slate-900">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="rounded-3xl bg-white p-5 shadow-xs ring-1 ring-slate-900/5">
              <h2 className="font-extrabold text-slate-900">Team access</h2>
              <p className="text-sm text-slate-500">
                Colleagues open <span className="font-bold text-slate-700">/company</span> on their phone or laptop and enter this code. Keep it within your company.
              </p>
              {accessCode && <AccessCode code={accessCode} shown={formatCode(accessCode)} />}
            </section>
          </aside>
        </div>
      </>
    );
  } else if (section === 'candidates') {
    screen = (
      <>
        <PageHead title="Candidates" sub={`${counts.total} applied · in token order`}>
          <Button variant="secondary" onClick={refresh} loading={refreshing}>
            {!refreshing && <RefreshCw className="size-4" aria-hidden="true" />} Refresh
          </Button>
          <Button variant="secondary" onClick={exportAll} loading={exporting} disabled={counts.total === 0}>
            {!exporting && <Download className="size-4" aria-hidden="true" />} Download Excel
          </Button>
        </PageHead>
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatus(f.key)}
              aria-pressed={status === f.key}
              className={cx(
                'inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-bold transition',
                status === f.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50',
              )}
            >
              {f.label}
              <span className={cx('rounded-full px-2 py-0.5 text-xs font-extrabold', status === f.key ? 'bg-white/20' : 'bg-slate-100 text-slate-700')}>
                {f.count === 'done' ? counts.total - counts.applied : counts[f.count]}
              </span>
            </button>
          ))}
        </div>
        <SearchBox value={q} onChange={setQ} placeholder="Search token number, name or mobile" className="w-full" />

        {rows.length === 0 ? (
          status === 'applied' && !search && counts.total > 0 ? (
            <Empty icon={CircleCheck} title="No one is pending" text="Every candidate who applied has been interviewed. New applications appear here by themselves." />
          ) : filtered ? (
            <Empty icon={Users} title="No candidate matches" text="Try another filter or search word." />
          ) : (
            <Empty icon={Users} title="No candidate has applied yet" text="Candidates who apply to your company will appear here in token order. This page refreshes by itself." />
          )
        ) : (
          <ul className="space-y-2.5">
            {rows.map((r) => (
              // Tapping a candidate opens their details, with big buttons to set the result.
              <li key={r.id} className={cx('flex flex-wrap items-center gap-3 rounded-3xl bg-white p-3.5 shadow-xs ring-1', queueTag(r, queue) === 'now' ? 'ring-2 ring-blue-600' : 'ring-slate-900/5')}>
                <button type="button" onClick={() => setOpenId(r.id)} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3.5 text-left">
                  <TokenBadge token={r.token_no} className="min-w-16" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-extrabold text-slate-900">{r.full_name}</span>
                    <span className="block truncate text-sm text-slate-600">
                      {[r.qualification, r.specialization].filter(Boolean).join(' · ')} · {experienceText(r)}
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {r.reg_no}
                      {r.role ? ` · ${r.role}` : ''}
                    </span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <QueueTag tag={queueTag(r, queue)} />
                      <RescheduledTag row={r} />
                      <ResultTag row={r} />
                    </span>
                  </span>
                </button>
                <a href={`tel:${r.mobile}`} aria-label={`Call ${r.full_name}`} className="grid size-11 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-700 hover:bg-blue-100 md:hidden">
                  <Phone className="size-5" aria-hidden="true" />
                </a>
                <a href={`tel:${r.mobile}`} className="hidden items-center gap-1.5 whitespace-nowrap text-sm font-bold text-slate-700 hover:text-blue-700 md:inline-flex">
                  <Phone className="size-4 text-slate-400" aria-hidden="true" /> {r.mobile}
                </a>
                {/* On a phone the button gets its own row under the candidate, so the name keeps its room */}
                <InterviewButton row={r} busy={calling} onClick={openInterview} className="min-h-11 w-full sm:w-auto" />
              </li>
            ))}
          </ul>
        )}
        <Pager className="mt-5" page={paging.page} pages={paging.pages} onChange={paging.setPage} label={rangeLabel(paging.start, paging.end, total, 'Candidates')} />
      </>
    );
  } else {
    screen = (
      <>
        <PageHead title="Live queue" sub={`Desk ${company.room_no || '—'}${company.location ? ` · ${company.location}` : ''}`}>
          <Button variant="secondary" onClick={refresh} loading={refreshing}>
            {!refreshing && <RefreshCw className="size-4" aria-hidden="true" />} Refresh
          </Button>
        </PageHead>
        {breakNote}
        <QueuePanel queue={queue} busy={calling} onNext={callNext} onCall={callIn} onReschedule={reschedule} hideMissed />
        <QueueBoard version={JSON.stringify([queue, counts])} busy={calling} onCall={callIn} onReschedule={reschedule} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Applied" value={counts.total} onClick={() => showList('')} />
          <Stat label="Waiting" value={counts.applied} tone="text-blue-700" onClick={() => showList('applied')} />
          <Stat label="Interview done" value={counts.interviewed} tone="text-violet-700" onClick={() => showList('interviewed')} />
          <Stat label="Selected" value={counts.selected} tone="text-emerald-700" onClick={() => showList('selected')} />
        </div>
      </>
    );
  }

  return (
    <div className="min-h-dvh bg-slate-50 lg:pl-64 print:min-h-0 print:bg-white print:pl-0!">
      {/* Side bar on laptops */}
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200/70 bg-white lg:flex print:hidden!">
        <div className="px-5 py-5">
          <Brand name={info.fair_name} to="/company" />
          <p className="mt-1 pl-[46px] text-xs font-bold text-slate-400">Company dashboard</p>
        </div>
        <div className="mx-3 mb-3 flex items-center gap-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
          <span className="grid min-w-11 place-items-center rounded-xl bg-amber-100 px-1.5 py-1 text-center text-amber-950 ring-1 ring-inset ring-amber-200">
            <span className="text-[9px] font-extrabold uppercase tracking-widest">Desk</span>
            <span className="text-lg font-extrabold leading-none tabular-nums">{company.room_no || '–'}</span>
          </span>
          <span className="min-w-0">
            <span className="block truncate font-extrabold text-slate-900">{company.name || 'Your company'}</span>
            <span className="block text-xs text-slate-500">
              {counts.total} applied · {counts.applied} waiting
            </span>
          </span>
        </div>
        {!needsDesk && (
          <div className="mb-2 px-5">{deskChip}</div>
        )}
        <nav className="flex-1 space-y-1 px-3" aria-label="Dashboard sections">
          {!needsDesk &&
            NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cx('flex min-h-12 items-center gap-3 rounded-2xl px-3.5 text-[15px] font-bold transition', isActive ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/30' : 'text-slate-600 hover:bg-slate-100')
                }
              >
                <item.icon className="size-5" aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
        </nav>
        <div className="border-t border-slate-100 p-3">
          {!needsDesk && <SidebarNotifications />}
          <button type="button" onClick={logout} className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-2xl px-3.5 text-sm font-bold text-slate-600 hover:bg-slate-100">
            <LogOut className="size-4.5" aria-hidden="true" /> Logout
          </button>
        </div>
      </aside>

      {/* Top bar on phones and tablets */}
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/95 backdrop-blur lg:hidden print:hidden">
        <div className="flex h-14 items-center justify-between gap-3 px-4">
          <Brand name={info.fair_name} to="/company" />
          <span className="flex shrink-0 items-center gap-2">
            {!needsDesk && <NotificationBell to="/company/notifications" path="/recruiter/notifications" />}
            {!needsDesk && deskChip}
            <RoomBadge room={company.room_no} empty="No desk" />
          </span>
        </div>
      </header>

      <main className="w-full space-y-4 px-4 pb-28 pt-5 lg:px-8 lg:pb-10 2xl:px-12 print:m-0 print:max-w-none print:space-y-0 print:p-0">
        {welcome && (
          <div className="flex items-start gap-3 rounded-3xl bg-emerald-50 p-4 text-emerald-950 ring-1 ring-inset ring-emerald-200 print:hidden">
            <CircleCheck className="mt-0.5 size-6 shrink-0 text-emerald-600" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-extrabold">Your company is registered</p>
              <p className="mt-0.5 text-[15px]">First scan the QR code at your interview desk to activate it. Then add your job openings and company details.</p>
              {accessCode && (
                <p className="mt-2 text-[15px]">
                  Your access code is <span className="whitespace-nowrap font-mono text-base font-bold">{formatCode(accessCode)}</span>. Note it down: you need it to open this dashboard on another phone.
                </p>
              )}
            </div>
            <button type="button" onClick={() => setParams({}, { replace: true })} aria-label="Close this message" className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-emerald-800 hover:bg-emerald-100">
              <X className="size-5" />
            </button>
          </div>
        )}

        {!needsDesk && company && <AnnouncementFeed path="/recruiter/announcements" storageKey={`jobfair_news_company_${company.id}`} popup />}
        {pausedNote}

        {needsDesk ? (
          <section className="rounded-3xl bg-amber-50 p-5 text-amber-950 ring-1 ring-inset ring-amber-300 print:hidden">
            <p className="text-lg font-extrabold">Activate your desk</p>
            <p className="mt-0.5 text-[15px]">
              Scan the QR code on the poster at your interview desk. You do this once: the desk is then linked to your company, and your dashboard opens.
            </p>
            <Button variant="accent" size="lg" className="mt-3 w-full sm:w-auto" onClick={() => setActivating(true)}>
              <ScanQrCode className="size-5" aria-hidden="true" /> Scan the QR code at my desk
            </Button>
          </section>
        ) : (
          screen
        )}
        <Credit className="pt-6" />
      </main>

      {/* Bottom bar on phones and tablets: every section is one tap away */}
      {!needsDesk && (
        <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/70 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden" aria-label="Dashboard sections">
          <div className="mx-auto grid max-w-xl grid-cols-6">
            {NAV.map((item) => (
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
          </div>
        </nav>
      )}

      <Modal
        open={Boolean(orgAlert)}
        title={orgAlert?.title ?? ''}
        onClose={() => setOrgAlert(null)}
        footer={
          <Button size="lg" onClick={() => setOrgAlert(null)}>
            OK, got it
          </Button>
        }
      >
        <div className="flex items-start gap-3">
          <span className={cx('grid size-11 shrink-0 place-items-center rounded-2xl', orgAlert?.kind === 'lunch' ? 'bg-orange-100 text-orange-700' : orgAlert?.kind ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700')}>
            {orgAlert?.kind === 'lunch' ? <UtensilsCrossed className="size-5" aria-hidden="true" /> : orgAlert?.kind ? <Coffee className="size-5" aria-hidden="true" /> : <Play className="size-5" aria-hidden="true" />}
          </span>
          <div>
            <p className="text-[15px] text-slate-700">{orgAlert?.text}</p>
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">From the organisers</p>
          </div>
        </div>
        {notifyAllowed === 'default' && (
          <button
            type="button"
            onClick={() => Notification.requestPermission().then(setNotifyAllowed)}
            className="mt-4 inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full bg-slate-100 px-4 text-sm font-bold text-slate-700 hover:bg-slate-200"
          >
            <BellRing className="size-4" aria-hidden="true" /> Also alert me when this tab is in the background
          </button>
        )}
      </Modal>

      {activating && <ActivateDesk company={company} onClose={() => setActivating(false)} onDone={deskActivated} />}
      {open && <CandidateModal row={open} queue={queue} busy={calling} onClose={() => setOpenId(null)} onChange={changeStatus} onInterview={openInterview} />}
    </div>
  );
}
