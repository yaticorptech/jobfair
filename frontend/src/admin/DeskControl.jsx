import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Coffee, Mic, Play, Radio, UtensilsCrossed } from 'lucide-react';
import { api, fmtTime } from '../lib.jsx';
import { Button, Card, ErrorNote, Modal, PageLoader, Toggle, cx, useToast } from '../ui.jsx';
import { PageTitle, SearchBox } from './shared.jsx';

// The live control room for the day of the fair: the fair-wide switches, a status change for every
// desk at once, and each company's desk with its own status, what it is doing and who is waiting.

const STATES = [
  { kind: null, label: 'Interviewing', short: 'Interviewing', Icon: Play, tone: 'emerald' },
  { kind: 'break', label: 'Short break', short: 'Break', Icon: Coffee, tone: 'amber' },
  { kind: 'lunch', label: 'Lunch break', short: 'Lunch', Icon: UtensilsCrossed, tone: 'orange' },
];
const TONE = {
  emerald: { chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200', on: 'bg-emerald-600 text-white', bar: 'bg-emerald-500' },
  amber: { chip: 'bg-amber-50 text-amber-900 ring-amber-200', on: 'bg-amber-500 text-white', bar: 'bg-amber-400' },
  orange: { chip: 'bg-orange-50 text-orange-900 ring-orange-200', on: 'bg-orange-600 text-white', bar: 'bg-orange-500' },
};
const stateOf = (kind) => STATES.find((s) => s.kind === (kind ?? null));

// What flipping each switch means, for the confirmation, and the alert people get (when it has one).
const SWITCH_INFO = {
  interviews_open: {
    on: { title: 'Resume interviews at every desk?', text: 'Companies can call tokens, start interviews and give results again.' },
    off: { title: 'Pause interviews at every desk?', text: 'No desk can call tokens, start interviews or give results until you turn this back on. Candidates keep their tokens.' },
    audience: 'companies and candidates',
    alert: { on: ['Interviews have resumed', 'Interviews are running again at every desk. Keep an eye on your token.'], off: ['Interviews are paused', 'The organisers have paused interviews for now. Your token is safe; we will tell you when they resume.'] },
  },
  applications_open: {
    on: { title: 'Open applications?', text: 'Candidates can apply to companies again.' },
    off: { title: 'Close applications?', text: 'Candidates cannot apply to any company. Applications already made and their tokens are not affected.' },
    audience: 'candidates',
    alert: { on: ['Applications are open', 'You can apply to companies now. Open the company list to apply.'], off: ['Applications are closed', 'New applications are closed for now. Your existing applications and tokens are not affected.'] },
  },
  registration_open: {
    on: { title: 'Open candidate registration?', text: 'New candidates can register again. The registration page opens within seconds on every phone.' },
    off: { title: 'Close candidate registration?', text: 'New candidates cannot register. Registered candidates can still log in and apply. The registration page closes within seconds on every phone.' },
  },
  company_registration_open: {
    on: { title: 'Open company registration?', text: 'New companies can register through the company registration QR code.' },
    off: { title: 'Close company registration?', text: 'The company registration QR code stops working for new companies. Registered companies can still log in.' },
  },
};

const SWITCHES = [
  ['interviews_open', 'Interviews are running', 'Off pauses every desk: no calling tokens, starting interviews or giving results.'],
  ['applications_open', 'Candidates can apply', 'Off stops new applications to companies.'],
  ['registration_open', 'Candidate registration', 'Off stops new candidates registering. Registered candidates can still log in.'],
  ['company_registration_open', 'Company registration', 'Off stops new companies registering through the company QR code.'],
];

// Three buttons, one lit: the desk's status.
function StatusSwitch({ value, onPick, disabled, name }) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-2xl bg-slate-100 p-1" role="radiogroup" aria-label={`Status of ${name}`}>
      {STATES.map((s) => {
        const on = (value ?? null) === s.kind;
        return (
          <button
            key={s.label}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={disabled}
            onClick={() => !on && onPick(s.kind)}
            className={cx(
              'inline-flex min-h-10 cursor-pointer items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold transition disabled:cursor-wait',
              on ? TONE[s.tone].on : 'text-slate-600 hover:bg-white hover:text-slate-900',
            )}
          >
            <s.Icon className="size-3.5 shrink-0" aria-hidden="true" /> {s.short}
          </button>
        );
      })}
    </div>
  );
}

function DeskCard({ d, busy, onPick }) {
  const st = stateOf(d.on_break);
  return (
    <li className="relative flex flex-col gap-3 overflow-hidden rounded-3xl bg-white p-4 shadow-xs ring-1 ring-slate-900/5">
      <span className={cx('absolute inset-y-0 left-0 w-1.5', TONE[st.tone].bar)} aria-hidden="true" />
      <div className="flex items-start gap-3 pl-1">
        <span className="grid min-w-12 shrink-0 place-items-center rounded-2xl bg-amber-100 px-2 py-1.5 text-center text-amber-950 ring-1 ring-inset ring-amber-200">
          <span className="text-[9px] font-extrabold uppercase tracking-widest text-amber-700">Desk</span>
          <span className="text-lg font-extrabold leading-none tabular-nums">{d.room_no || '–'}</span>
        </span>
        <div className="min-w-0 flex-1">
          <Link to={`/admin/companies/${d.id}/queue`} title="Open the live queue" className="block truncate font-extrabold text-slate-900 underline-offset-4 hover:text-blue-700 hover:underline">
            {d.name}
          </Link>
          <p className="truncate text-xs text-slate-500">{d.location || (d.room_no ? '' : 'No desk yet')}</p>
          <span className={cx('mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold ring-1 ring-inset', TONE[st.tone].chip)}>
            <st.Icon className="size-3" aria-hidden="true" />
            {st.label}
            {d.break_since ? ` · since ${fmtTime(d.break_since).split(', ').pop()}` : ''}
          </span>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-2 pl-1 text-center">
        <div className="rounded-xl bg-slate-50 py-1.5">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Now</dt>
          <dd className="flex items-center justify-center gap-1 font-extrabold tabular-nums text-slate-900">
            {d.now_serving_live && <Mic className="size-3.5 text-blue-600" aria-label="Interview going on" />}
            {d.now_serving || '–'}
          </dd>
        </div>
        <div className="rounded-xl bg-slate-50 py-1.5">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Waiting</dt>
          <dd className="font-extrabold tabular-nums text-slate-900">{d.waiting}</dd>
        </div>
        <div className="rounded-xl bg-slate-50 py-1.5">
          <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Applied</dt>
          <dd className="font-extrabold tabular-nums text-slate-900">{d.applicants}</dd>
        </div>
      </dl>
      <div className="pl-1">
        <StatusSwitch value={d.on_break} name={d.name} disabled={busy} onPick={(kind) => onPick(d, kind)} />
      </div>
    </li>
  );
}

export default function DeskControl() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [show, setShow] = useState('all'); // 'all' | null (interviewing) | 'break' | 'lunch'
  const [busy, setBusy] = useState(''); // a desk id, 'all', or a switch key
  const [confirm, setConfirm] = useState(undefined); // the status about to be set for every desk
  const [flipping, setFlipping] = useState(null); // { key, on, notify }: a switch waiting for confirmation

  const load = useCallback(
    () =>
      api('/admin/desks')
        .then((d) => {
          setData(d);
          setError('');
        })
        .catch((err) => setError(err.message)),
    [],
  );

  // Live: desks change status during the day, from their own dashboards too.
  useEffect(() => {
    load();
    const timer = setInterval(() => document.visibilityState === 'visible' && load(), 15000);
    return () => clearInterval(timer);
  }, [load]);

  const counts = useMemo(() => {
    const c = { null: 0, break: 0, lunch: 0 };
    for (const d of data?.desks ?? []) c[d.on_break ?? null] += 1;
    return c;
  }, [data]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.desks ?? []).filter(
      (d) => (show === 'all' || (d.on_break ?? null) === show) && (!needle || `${d.name} ${d.room_no} ${d.location}`.toLowerCase().includes(needle)),
    );
  }, [data, q, show]);

  async function pickOne(desk, kind) {
    setBusy(desk.id);
    setData((old) => ({ ...old, desks: old.desks.map((d) => (d.id === desk.id ? { ...d, on_break: kind, break_since: kind ? new Date().toISOString() : null } : d)) }));
    try {
      await api(`/admin/companies/${desk.id}/break`, { method: 'PUT', body: { kind } });
      toast(`${desk.name}: ${stateOf(kind).label.toLowerCase()}`);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy('');
      load();
    }
  }

  async function pickAll(kind) {
    setBusy('all');
    try {
      const { changed } = await api('/admin/break-all', { method: 'POST', body: { kind } });
      toast(kind ? `${stateOf(kind).label} for all ${changed} companies` : `All ${changed} companies are back to interviewing`);
      setConfirm(undefined);
      await load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy('');
    }
  }

  async function flip(key, on, notify) {
    setBusy(key);
    setData((old) => ({ ...old, controls: { ...old.controls, [key]: on } }));
    try {
      const result = await api('/admin/controls', { method: 'PUT', body: { key, on, notify } });
      setData((old) => ({ ...old, controls: result.controls }));
      setFlipping(null);
      toast(
        result.alerted
          ? `${SWITCHES.find((s) => s[0] === key)[1]}: ${on ? 'on' : 'off'} · alert sent${result.alerted.pushed ? ` to ${result.alerted.pushed} ${result.alerted.pushed === 1 ? 'phone' : 'phones'}` : ''}`
          : `${SWITCHES.find((s) => s[0] === key)[1]}: ${on ? 'on' : 'off'}`,
      );
    } catch (err) {
      toast(err.message, 'error');
      load();
    } finally {
      setBusy('');
    }
  }

  if (!data) return error ? <ErrorNote message={error} onRetry={load} /> : <PageLoader />;
  const total = data.desks.length;
  const confirmState = confirm === undefined ? null : stateOf(confirm);

  return (
    <>
      <PageTitle title="Desk control" sub={`${total} ${total === 1 ? 'company' : 'companies'} · live, updates every 15 seconds`} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <Card className="p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-extrabold text-slate-900">
            <Radio className="size-4 text-blue-600" aria-hidden="true" /> Fair switches
          </h2>
          <p className="mb-4 text-sm text-slate-500">Take effect immediately, for everyone.</p>
          <div className="grid gap-4">
            {SWITCHES.map(([key, label, hint]) => (
              <Toggle key={key} checked={data.controls[key]} onChange={(on) => busy !== key && setFlipping({ key, on, notify: Boolean(SWITCH_INFO[key].alert) })} label={label} hint={hint} />
            ))}
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="font-extrabold text-slate-900">All companies at once</h2>
          <p className="text-sm text-slate-500">Waiting candidates see the status on their phones. A desk on a break cannot call tokens.</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {STATES.map((s) => (
              <div key={s.label} className={cx('rounded-2xl px-3 py-2.5 ring-1 ring-inset', TONE[s.tone].chip)}>
                <p className="text-2xl font-extrabold tabular-nums">{counts[s.kind]}</p>
                <p className="text-xs font-bold">{s.label}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {STATES.map((s) => (
              <Button
                key={s.label}
                variant={s.kind ? 'secondary' : 'primary'}
                disabled={Boolean(busy) || counts[s.kind] === total}
                onClick={() => setConfirm(s.kind)}
              >
                <s.Icon className="size-4" aria-hidden="true" /> {s.kind ? `${s.label} for all` : 'Resume all'}
              </Button>
            ))}
          </div>
        </Card>
      </div>

      <div className="mb-4 mt-6 flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search company or desk" className="w-full sm:w-auto sm:min-w-72" />
        {[['all', 'All', total], ...STATES.map((s) => [s.kind, s.label, counts[s.kind]])].map(([key, label, n]) => (
          <button
            key={label}
            type="button"
            onClick={() => setShow(key)}
            aria-pressed={show === key}
            className={cx(
              'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-bold transition',
              show === key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50',
            )}
          >
            {label}
            <span className={cx('rounded-full px-2 py-0.5 text-xs font-extrabold', show === key ? 'bg-white/20' : 'bg-slate-100 text-slate-700')}>{n}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-3xl bg-white p-8 text-center text-slate-500 ring-1 ring-slate-900/5">
          {total === 0 ? 'No companies yet.' : 'No company matches.'}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((d) => (
            <DeskCard key={d.id} d={d} busy={busy === d.id || busy === 'all'} onPick={pickOne} />
          ))}
        </ul>
      )}

      <Modal
        open={confirm !== undefined}
        title={confirmState ? (confirmState.kind ? `${confirmState.label} for all companies?` : 'Resume interviews at every desk?') : ''}
        onClose={() => setConfirm(undefined)}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setConfirm(undefined)}>
              Cancel
            </Button>
            <Button size="lg" loading={busy === 'all'} onClick={() => pickAll(confirm)}>
              {confirmState?.kind ? `Start ${confirmState.label.toLowerCase()}` : 'Resume all'}
            </Button>
          </>
        }
      >
        <p className="text-[15px] text-slate-600">
          {confirmState?.kind
            ? `All ${total} companies go on ${confirmState.label.toLowerCase()}. Waiting candidates see it at once, and desks cannot call tokens until the break ends.`
            : `All ${total} companies go back to interviewing and can call their next tokens.`}
        </p>
      </Modal>
      {/* Flipping a fair-wide switch: what it does, and the alert people get */}
      <Modal
        open={Boolean(flipping)}
        title={flipping ? SWITCH_INFO[flipping.key][flipping.on ? 'on' : 'off'].title : ''}
        onClose={() => setFlipping(null)}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setFlipping(null)}>
              Cancel
            </Button>
            <Button size="lg" variant={flipping?.on ? 'primary' : 'danger'} loading={busy === flipping?.key} onClick={() => flip(flipping.key, flipping.on, flipping.notify)}>
              {flipping?.on ? 'Turn on' : 'Turn off'}
              {flipping?.notify ? ' and alert' : ''}
            </Button>
          </>
        }
      >
        {flipping && (
          <>
            <p className="text-[15px] text-slate-600">{SWITCH_INFO[flipping.key][flipping.on ? 'on' : 'off'].text}</p>
            {SWITCH_INFO[flipping.key].alert && (
              <div className="mt-4 rounded-2xl bg-slate-50 p-3.5 ring-1 ring-inset ring-slate-200">
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-5 shrink-0 cursor-pointer accent-blue-600"
                    checked={flipping.notify}
                    onChange={(e) => setFlipping((f) => ({ ...f, notify: e.target.checked }))}
                  />
                  <span>
                    <span className="block font-bold text-slate-900">Send an alert to {SWITCH_INFO[flipping.key].audience}</span>
                    <span className="block text-sm text-slate-500">Candidates with alerts on get it on their phone; it also shows on their dashboards{SWITCH_INFO[flipping.key].audience.includes('companies') ? ' and as a popup for companies' : ''}.</span>
                  </span>
                </label>
                {flipping.notify && (
                  <div className="mt-3 flex items-start gap-3 rounded-xl bg-white p-3 shadow-sm">
                    <img src="/icon-192.png" alt="" className="size-8 rounded-lg" />
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-slate-900">{SWITCH_INFO[flipping.key].alert[flipping.on ? 'on' : 'off'][0]}</p>
                      <p className="text-sm text-slate-600">{SWITCH_INFO[flipping.key].alert[flipping.on ? 'on' : 'off'][1]}</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
