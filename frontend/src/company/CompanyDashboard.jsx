import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BellRing, CircleCheck, ClipboardCheck, Download, LogOut, Mail, Megaphone, Phone, Play, RefreshCw, ScanQrCode, Users, X } from 'lucide-react';
import { STATUS, api, download, experienceText, fmtDate, fmtTime, formatCode, setToken, useInfo } from '../lib.jsx';
import { Avatar, Brand, Button, Credit, Empty, ErrorNote, Modal, PageLoader, Pager, RoomBadge, TokenBadge, cx, rangeLabel, usePageSize, usePaging, useToast } from '../ui.jsx';
import { SearchBox, useDebounced } from '../admin/shared.jsx';
import CompanyProfile from './CompanyProfile.jsx';
import DeskQr from './DeskQr.jsx';
import ActivateDesk from './ActivateDesk.jsx';
import { scoreText } from './Interview.jsx';


// "applied" means the candidate has a token and is waiting to be interviewed.
const LIST_PLACE = 'jobfair_company_list';
function readListPlace() {
  const fallback = { status: '', q: '', page: 1, total: 0 };
  try {
    return { ...fallback, ...JSON.parse(sessionStorage.getItem(LIST_PLACE) || '{}') };
  } catch {
    return fallback;
  }
}

const FILTERS = [
  { key: '', label: 'All', count: 'total' },
  { key: 'applied', label: 'Waiting', count: 'applied' },
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
  return row.called_at || row.token_no < queue.now_serving ? 'missed' : '';
}
const TAG = {
  now: ['At the desk now', 'bg-blue-600 text-white ring-blue-600'],
  missed: ['Missed', 'bg-amber-100 text-amber-900 ring-amber-300'],
};

function QueueTag({ tag }) {
  if (!tag) return null;
  return <span className={cx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-extrabold ring-1 ring-inset', TAG[tag][1])}>{TAG[tag][0]}</span>;
}

// The desk's queue: the token being served, one big button for the next one, and the tokens that
// were missed (not there when their turn came), which are called in one by one when they come.
function QueuePanel({ queue, busy, onNext, onCall }) {
  return (
    <section aria-label="Interview queue" className="rounded-3xl bg-white p-4 shadow-xs ring-1 ring-slate-900/5 sm:p-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="grid size-20 shrink-0 place-items-center rounded-2xl bg-slate-900 text-white">
            <span className="text-center leading-none">
              <span className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Now</span>
              <span className="mt-1 block text-3xl font-extrabold tabular-nums">{queue.now_serving || '–'}</span>
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-widest text-slate-400">Now serving</p>
            <p className="truncate text-lg font-extrabold text-slate-900">
              {queue.now_serving ? `Token ${queue.now_serving}${queue.now_serving_name ? ` · ${queue.now_serving_name}` : ''}` : 'No one called yet'}
            </p>
            <p className="text-sm text-slate-500">
              {queue.waiting} waiting{queue.next_token ? ` · next is token ${queue.next_token}` : ''}
            </p>
          </div>
        </div>
        <Button size="lg" onClick={onNext} loading={busy === 'next'} disabled={!queue.next_token || Boolean(busy)} className="w-full sm:w-auto">
          {busy !== 'next' && <Megaphone className="size-5" aria-hidden="true" />}
          {queue.next_token ? `Call next · token ${queue.next_token}` : 'No one waiting'}
        </Button>
      </div>
      {queue.missed.length > 0 && (
        <div className="mt-4 rounded-2xl bg-amber-50 p-3.5 ring-1 ring-inset ring-amber-200">
          <p className="text-sm font-bold text-amber-950">
            Missed: their turn went by without a result (not here when called, or the interview was not saved). Tap a token to call them in again, or open the candidate and set the result.
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {queue.missed.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onCall(m)}
                disabled={Boolean(busy)}
                aria-label={`Call in token ${m.token_no}`}
                className="inline-flex min-h-11 min-w-14 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-white px-4 text-base font-extrabold tabular-nums text-amber-950 ring-1 ring-inset ring-amber-300 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <BellRing className="size-4" aria-hidden="true" /> {m.token_no}
              </button>
            ))}
          </div>
        </div>
      )}
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

const TABS = [
  ['candidates', 'Candidates'],
  ['profile', 'Company and jobs'],
  ['qr', 'Desk QR'],
];

export default function CompanyDashboard() {
  const { info } = useInfo();
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
  const [tab, setTab] = useState(null); // 'candidates' | 'profile' | 'qr'; set when the company details arrive
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
        // A company that has just registered, or has not listed any job yet, starts on the screen
        // where it adds them. This is decided once, so adding the first job does not move the company to another screen.
        setTab((chosen) => chosen ?? (welcome || me.company.jobs.length === 0 ? 'profile' : 'candidates'));
      })
      .catch((err) => setError(err.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  // New candidates keep arriving during the fair, so the list refreshes by itself.
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === 'visible') load().catch(() => {});
    };
    const timer = setInterval(tick, 30000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

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
  const view = tab ?? 'candidates';
  // Until it scans the QR code at its desk, the company has no desk. (A company that the organisers
  // placed at a desk themselves has a desk number without scanning.)
  const needsDesk = !company.desk_id && !company.room_no;

  function deskActivated(updated) {
    setCompany(updated);
    setActivating(false);
    toast(`Desk ${updated.room_no} is yours now. Candidates who scan its QR code see your company.`);
  }

  return (
    <div className="min-h-dvh bg-slate-50 pb-12 print:min-h-0 print:bg-white print:pb-0">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/95 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4 lg:max-w-5xl">
          <Brand name={info.fair_name} to="/company" />
          <button type="button" onClick={logout} className="inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-full px-3 text-sm font-bold text-slate-600 hover:bg-slate-100">
            <LogOut className="size-4" aria-hidden="true" /> Logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-4 lg:max-w-5xl print:m-0 print:max-w-none print:space-y-0 print:p-0">
        {welcome && (
          <div className="flex items-start gap-3 rounded-3xl bg-emerald-50 p-4 text-emerald-950 ring-1 ring-inset ring-emerald-200 print:hidden">
            <CircleCheck className="mt-0.5 size-6 shrink-0 text-emerald-600" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="font-extrabold">Your company is registered</p>
              <p className="mt-0.5 text-[15px]">Two things to do now: add your job openings and company details below, and scan the QR code at your desk to activate it.</p>
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

        <section className="flex items-center justify-between gap-4 rounded-3xl bg-blue-600 p-5 text-white shadow-lg shadow-blue-600/25 print:hidden">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-widest text-blue-200">Company dashboard</p>
            <h1 className="mt-1 text-2xl font-extrabold leading-tight tracking-tight">{company.name || 'Your company'}</h1>
            <p className="mt-1 text-sm text-blue-100">
              {counts.total} {counts.total === 1 ? 'candidate has' : 'candidates have'} applied · {counts.applied} waiting
            </p>
          </div>
          <RoomBadge room={company.room_no} empty="Not activated" />
        </section>

        {needsDesk && (
          <section className="rounded-3xl bg-amber-50 p-5 text-amber-950 ring-1 ring-inset ring-amber-300 print:hidden">
            <p className="text-lg font-extrabold">Activate your desk</p>
            <p className="mt-0.5 text-[15px]">Scan the QR code on the poster at your interview desk. Candidates who scan that poster will then see your company.</p>
            <Button variant="accent" size="lg" className="mt-3 w-full sm:w-auto" onClick={() => setActivating(true)}>
              <ScanQrCode className="size-5" aria-hidden="true" /> Scan the QR code at my desk
            </Button>
          </section>
        )}

        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-200/70 p-1 print:hidden" role="tablist" aria-label="Company dashboard sections">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => setTab(key)}
              className={cx('min-h-12 cursor-pointer rounded-xl px-1.5 text-sm font-bold leading-tight transition', view === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'profile' ? (
          <CompanyProfile company={company} onSaved={setCompany} />
        ) : view === 'qr' ? (
          <DeskQr company={company} accessCode={accessCode} onActivate={() => setActivating(true)} />
        ) : (
          <>
        {counts.total > 0 && <QueuePanel queue={queue} busy={calling} onNext={callNext} onCall={callIn} />}
        <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => {
                setStatus(f.key);
              }}
              aria-pressed={status === f.key}
              className={cx(
                'inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-bold transition',
                status === f.key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50',
              )}
            >
              {f.label}
              <span className={cx('rounded-full px-2 py-0.5 text-xs font-extrabold', status === f.key ? 'bg-white/20' : 'bg-slate-100 text-slate-700')}>
                {counts[f.count]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SearchBox
            value={q}
            onChange={(value) => {
              setQ(value);
            }}
            placeholder="Search token number, name or mobile"
            className="w-full sm:w-auto sm:flex-1"
          />
          <Button variant="secondary" onClick={refresh} loading={refreshing} className="flex-1 sm:flex-none">
            {!refreshing && <RefreshCw className="size-4" aria-hidden="true" />} Refresh
          </Button>
          <Button variant="secondary" onClick={exportAll} loading={exporting} disabled={counts.total === 0} className="flex-1 sm:flex-none">
            {!exporting && <Download className="size-4" aria-hidden="true" />} Download Excel
          </Button>
        </div>

        {rows.length === 0 ? (
          filtered ? (
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
        )}
        <Credit className="pt-6" />
      </main>

      {activating && <ActivateDesk company={company} onClose={() => setActivating(false)} onDone={deskActivated} />}
      {open && <CandidateModal row={open} queue={queue} busy={calling} onClose={() => setOpenId(null)} onChange={changeStatus} onInterview={openInterview} />}

    </div>
  );
}
