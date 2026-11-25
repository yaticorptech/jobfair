import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, Check, ChevronRight, CircleCheck, Megaphone, ScanQrCode, Search } from 'lucide-react';
import { api } from '../lib.jsx';
import { Avatar, Button, Empty, Modal, Notice, RoomBadge, TokenBadge, cx, useToast } from '../ui.jsx';

const PAGE = 30;

export function Fact({ icon: Icon, children }) {
  return (
    <li className="flex items-start gap-2.5 text-[15px] text-slate-700">
      <Icon className="mt-0.5 size-5 shrink-0 text-slate-400" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </li>
  );
}

// One company in the list. Tapping it opens the company's own page, where the candidate applies.
function CompanyRow({ c }) {
  const app = c.application;
  const line = c.roles.length ? c.roles.join(', ') : c.industry;
  return (
    // min-w-0 lets a long list of jobs be cut short instead of pushing the row off the screen.
    <li className="min-w-0">
      <Link
        to={`/c/${c.id}`}
        className="flex items-center gap-3 rounded-3xl bg-white p-3.5 shadow-xs ring-1 ring-slate-900/5 transition hover:ring-blue-300 active:scale-[0.99]"
      >
        <Avatar name={c.name} />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 font-extrabold leading-snug text-slate-900">{c.name}</span>
          {line && <span className="block truncate text-sm text-slate-500">{line}</span>}
          {app && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">
              <Check className="size-3.5" aria-hidden="true" /> Applied · Token {app.token_no}
            </span>
          )}
        </span>
        <RoomBadge room={c.room_no} />
        <ChevronRight className="size-5 shrink-0 text-slate-300" aria-hidden="true" />
      </Link>
    </li>
  );
}

export function ApplyModal({ company, onClose, onDone }) {
  const toast = useToast();
  const [role, setRole] = useState(company.roles.length === 1 ? company.roles[0] : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  async function confirm() {
    if (company.roles.length > 1 && !role) {
      setError('Choose the role you want to apply for');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const application = await api(`/companies/${company.id}/apply`, { method: 'POST', body: { role } });
      setResult(application);
      onDone();
    } catch (err) {
      setError(err.message);
      if (err.status === 409) onDone();
      else toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <Modal
        open
        title="Application sent"
        onClose={onClose}
        footer={
          <Button size="lg" onClick={onClose}>
            Done
          </Button>
        }
      >
        <div className="py-2 text-center">
          <CircleCheck className="mx-auto size-16 text-emerald-500" aria-hidden="true" />
          <p className="mt-3 text-xl font-extrabold text-slate-900">You have applied to {company.name}</p>
          {result.role && <p className="text-slate-500">{result.role}</p>}
          <div className="mt-5 flex items-stretch justify-center gap-3">
            <TokenBadge token={result.token_no} label="Your token" big className="min-w-28" />
            <RoomBadge room={company.room_no} big className="min-w-28" />
          </div>
          <p className="mt-4 text-[15px] text-slate-600">
            {company.room_no ? `Go to interview desk ${company.room_no}` : 'The interview desk will be shown here once it is announced'}
            {company.location ? ` (${company.location})` : ''} and tell them your token number.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      title={`Apply to ${company.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button size="lg" onClick={confirm} loading={busy}>
            Confirm application
          </Button>
        </>
      }
    >
      {company.roles.length > 1 ? (
        <fieldset>
          <legend className="mb-2.5 font-bold text-slate-800">Which role are you applying for?</legend>
          <div className="space-y-2">
            {company.roles.map((r) => {
              // The role's CTC and open positions, when the company has entered them.
              const job = company.jobs?.find((j) => j.title === r);
              const detail = job && [job.ctc && `CTC ${job.ctc}`, job.openings > 0 && `${job.openings} open`].filter(Boolean).join(' · ');
              return (
                <label
                  key={r}
                  className={cx(
                    'flex min-h-13 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-[15px] font-bold transition',
                    role === r ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-700 hover:bg-slate-50',
                  )}
                >
                  <input type="radio" name="role" checked={role === r} onChange={() => setRole(r)} className="size-5 shrink-0 accent-blue-600" />
                  <span className="min-w-0">
                    <span className="block">{r}</span>
                    {detail && <span className="block text-xs font-semibold text-slate-500">{detail}</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : (
        company.roles.length === 1 && (
          <p className="text-slate-600">
            Role: <span className="font-bold text-slate-900">{company.roles[0]}</span>
          </p>
        )
      )}

      <p className="mt-4 text-sm text-slate-500">Your registered details will be shared with this company. You will get a token number for the interview queue.</p>
      {error && (
        <p role="alert" className="mt-3 rounded-2xl bg-rose-50 px-4 py-3 text-[15px] font-semibold text-rose-700">
          {error}
        </p>
      )}
    </Modal>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'min-h-10 shrink-0 cursor-pointer rounded-full px-4 text-sm font-bold transition',
        active ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50',
      )}
    >
      {children}
    </button>
  );
}

export default function Companies({ me, companies, info }) {
  const [q, setQ] = useState('');
  const [industry, setIndustry] = useState('All');
  const [status, setStatus] = useState(''); // '' | 'applied' | 'not': whether the candidate has applied
  const [limit, setLimit] = useState(PAGE);

  const active = useMemo(() => companies.filter((c) => c.active), [companies]);
  const industries = useMemo(() => [...new Set(active.map((c) => c.industry).filter(Boolean))].sort(), [active]);
  const appliedCount = companies.filter((c) => c.application).length;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return active.filter((c) => {
      if (industry !== 'All' && c.industry !== industry) return false;
      if (status === 'applied' && !c.application) return false;
      if (status === 'not' && c.application) return false;
      if (!needle) return true;
      return [c.name, c.industry, c.room_no, c.eligibility, c.job_location, ...c.roles, ...c.jobs.flatMap((job) => [job.eligibility, job.location])].join(' ').toLowerCase().includes(needle);
    });
  }, [active, q, industry, status]);

  const reset = () => setLimit(PAGE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-500">Hello,</p>
          <h1 className="truncate text-2xl font-extrabold tracking-tight text-slate-900">{me.full_name}</h1>
        </div>
        <div className="shrink-0 rounded-2xl bg-white px-3.5 py-2 text-center shadow-xs ring-1 ring-slate-900/5">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Reg. no.</p>
          <p className="text-lg font-extrabold leading-tight text-slate-900">{me.reg_no}</p>
        </div>
      </div>

      <Link to="/dashboard/scan" className="flex items-center gap-4 rounded-3xl bg-blue-600 p-4 text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-700 active:scale-[0.99]">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-white/15">
          <ScanQrCode className="size-8" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-extrabold leading-tight">Scan a desk QR code</span>
          <span className="block text-sm text-blue-100">See that company&rsquo;s jobs and vacancies</span>
        </span>
        <ChevronRight className="size-6 shrink-0 text-blue-200" aria-hidden="true" />
      </Link>

      {info.notice && (
        <Notice icon={Megaphone}>
          <p className="whitespace-pre-line">{info.notice}</p>
        </Notice>
      )}

      <section aria-label="Companies" className="pt-1">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900">Companies</h2>
          <p className="text-sm font-semibold text-slate-500">
            {filtered.length} of {active.length}
          </p>
        </div>

        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              reset();
            }}
            placeholder="Search company, job or desk"
            aria-label="Search companies"
            className="block min-h-13 w-full rounded-2xl border border-slate-200 bg-white py-3 pl-12 pr-4 text-base outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
          />
        </div>

        {(industries.length > 1 || appliedCount > 0) && (
          <div className="no-scrollbar -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
            <Chip
              active={industry === 'All' && !status}
              onClick={() => {
                setIndustry('All');
                setStatus('');
                reset();
              }}
            >
              All
            </Chip>
            {appliedCount > 0 && (
              <>
                <Chip
                  active={status === 'applied'}
                  onClick={() => {
                    setStatus((on) => (on === 'applied' ? '' : 'applied'));
                    reset();
                  }}
                >
                  Applied ({appliedCount})
                </Chip>
                <Chip
                  active={status === 'not'}
                  onClick={() => {
                    setStatus((on) => (on === 'not' ? '' : 'not'));
                    reset();
                  }}
                >
                  Not applied yet
                </Chip>
              </>
            )}
            {industries.length > 1 &&
              industries.map((name) => (
                <Chip
                  key={name}
                  active={industry === name}
                  onClick={() => {
                    setIndustry(industry === name ? 'All' : name);
                    reset();
                  }}
                >
                  {name}
                </Chip>
              ))}
          </div>
        )}

        {!info.applications_open && (
          <Notice tone="slate" className="mt-3">
            Applications are closed right now
          </Notice>
        )}

        <div className="mt-3">
          {active.length === 0 ? (
            <Empty icon={Building2} title="Companies will appear here soon" text="The organisers are still adding the company list. Please check again in a while." />
          ) : filtered.length === 0 ? (
            <Empty icon={Search} title="No company matches" text="Try a different word or clear the filters.">
              <Button
                variant="secondary"
                onClick={() => {
                  setQ('');
                  setIndustry('All');
                  setStatus('');
                }}
              >
                Clear filters
              </Button>
            </Empty>
          ) : (
            <>
              <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                {filtered.slice(0, limit).map((c) => (
                  <CompanyRow key={c.id} c={c} />
                ))}
              </ul>
              {filtered.length > limit && (
                <div className="mt-4 text-center">
                  <Button variant="secondary" onClick={() => setLimit((n) => n + PAGE)}>
                    Show more ({filtered.length - limit} more)
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
