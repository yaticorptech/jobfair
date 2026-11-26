import { useCallback, useEffect, useState } from 'react';
import { CircleCheck, Clock, ClipboardCheck, Hourglass, Star, Timer, Trophy, Users } from 'lucide-react';
import { STATUS, api } from '../lib.jsx';
import { Card, ErrorNote, PageLoader, cx } from '../ui.jsx';
import { BarList, ChartCard, Combo, Donut, VBars } from '../admin/charts.jsx';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (d) => `${+d.slice(8, 10)} ${MONTH[+d.slice(5, 7) - 1]}`;
const hourLabel = (h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

// A number tile: icon and label, the number, one line of detail. Tapping it opens the list.
function Tile({ icon: Icon, tone, label, value, sub, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full cursor-pointer flex-col rounded-3xl bg-white p-4 text-left shadow-xs ring-1 ring-slate-900/5 transition hover:-translate-y-0.5 hover:shadow-md hover:ring-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 sm:p-5"
    >
      <span className="flex items-center gap-2.5">
        <span className={cx('grid size-9 shrink-0 place-items-center rounded-xl', tone)}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 truncate text-sm font-bold text-slate-600">{label}</span>
      </span>
      <span className="mt-4 text-[34px] font-extrabold leading-none tracking-tight tabular-nums text-slate-900">{value}</span>
      <span className="mt-2 min-h-4 text-xs text-slate-500">{sub}</span>
    </button>
  );
}

// The company's own dashboard: how many applied, how many are waiting, how many interviews are
// done, and charts of the day and of the candidates. Refreshes by itself.
export default function CompanyStats({ onShow }) {
  const [s, setS] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(
    () =>
      api('/recruiter/stats')
        .then((d) => {
          setS(d);
          setError('');
        })
        .catch((err) => setError(err.message)),
    [],
  );

  useEffect(() => {
    load();
    const timer = setInterval(() => document.visibilityState === 'visible' && load(), 30000);
    return () => clearInterval(timer);
  }, [load]);

  if (!s) return error ? <ErrorNote message={error} onRetry={load} /> : <PageLoader />;

  const c = s.counts;
  const done = c.total - c.applied;
  const fair = dayLabel(s.chart_day) + (s.chart_day === s.today ? ' (today)' : '');

  // The fair hours (8am to 3pm) at least, stretched to any hour that had activity.
  const busy = s.applied_by_hour.map((v, h) => (v || s.done_by_hour[h] ? h : -1)).filter((h) => h >= 0);
  const first = Math.min(8, ...busy);
  const last = Math.max(15, ...busy);
  const perHour = Array.from({ length: last - first + 1 }, (_, i) => {
    const h = first + i;
    return { key: h, label: hourLabel(h), long: `${hourLabel(h)} – ${hourLabel((h + 1) % 24)}`, a: s.applied_by_hour[h] || 0, b: s.done_by_hour[h] || 0 };
  });

  const pipeline = ['applied', 'interviewed', 'shortlisted', 'selected', 'rejected'].map((k) => ({
    label: k === 'applied' ? 'Waiting for interview' : STATUS[k].label,
    value: c[k] || 0,
  }));
  // The progress bar: each result as a share of everyone who applied.
  const segments = [
    ['selected', 'bg-emerald-500'],
    ['shortlisted', 'bg-amber-400'],
    ['interviewed', 'bg-violet-500'],
    ['rejected', 'bg-rose-400'],
  ];
  const q = s.queue;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={Users} tone="bg-blue-100 text-blue-700" label="Applied" value={c.total} sub={`${s.by_role.length} ${s.by_role.length === 1 ? 'role' : 'roles'}`} onClick={() => onShow('')} />
        <Tile icon={Hourglass} tone="bg-sky-100 text-sky-800" label="Waiting" value={c.applied} sub={q.now_serving ? `Token ${q.now_serving} at the desk` : 'No one called yet'} onClick={() => onShow('applied')} />
        <Tile icon={ClipboardCheck} tone="bg-violet-100 text-violet-800" label="Interviews done" value={done} sub={`${pct(done, c.total)}% of applicants`} onClick={() => onShow('done')} />
        <Tile icon={Trophy} tone="bg-emerald-100 text-emerald-800" label="Selected" value={c.selected} sub={`${c.shortlisted} shortlisted · ${c.rejected} not selected`} onClick={() => onShow('selected')} />
      </div>

      {/* How far the day has gone: one bar, every result in its colour */}
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-extrabold text-slate-900">Interview progress</h3>
            <p className="text-xs text-slate-500">
              {done} of {c.total} candidates interviewed · {c.applied} still waiting
            </p>
          </div>
          <p className="text-3xl font-extrabold tabular-nums text-slate-900">{pct(done, c.total)}%</p>
        </div>
        <div className="mt-4 flex h-3.5 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${pct(done, c.total)}% of candidates interviewed`}>
          {segments.map(([k, tone]) => (c[k] ? <span key={k} className={cx('h-full transition-all', tone)} style={{ width: `${(c[k] / c.total) * 100}%` }} /> : null))}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs font-bold text-slate-600">
          {segments.map(([k, tone]) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className={cx('size-2.5 rounded-full', tone)} aria-hidden="true" /> {STATUS[k].label} <span className="tabular-nums text-slate-900">{c[k]}</span>
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-slate-200" aria-hidden="true" /> Waiting <span className="tabular-nums text-slate-900">{c.applied}</span>
          </li>
        </ul>
        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-3">
          <div className="flex items-center gap-3">
            <Star className="size-5 text-amber-500" aria-hidden="true" />
            <div>
              <p className="text-lg font-extrabold leading-none tabular-nums text-slate-900">{s.avg_score ?? '–'}<span className="text-sm text-slate-400"> / 5</span></p>
              <p className="text-xs text-slate-500">Average score</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Timer className="size-5 text-blue-600" aria-hidden="true" />
            <div>
              <p className="text-lg font-extrabold leading-none tabular-nums text-slate-900">{s.avg_minutes != null ? `${Math.max(1, Math.round(s.avg_minutes))} min` : '–'}</p>
              <p className="text-xs text-slate-500">Average interview</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {q.on_break ? <Clock className="size-5 text-orange-500" aria-hidden="true" /> : <CircleCheck className="size-5 text-emerald-600" aria-hidden="true" />}
            <div>
              <p className="text-lg font-extrabold leading-none text-slate-900">{q.on_break === 'lunch' ? 'Lunch break' : q.on_break === 'break' ? 'Short break' : 'Interviewing'}</p>
              <p className="text-xs text-slate-500">Desk status</p>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard className="lg:col-span-2" title="Your day, hour by hour" sub={`${fair} · applications as columns, interviews finished as a line`}>
          <Combo points={perHour} names={['Applications', 'Interviews done']} empty={`Applications and interviews on ${dayLabel(s.chart_day)} show here, hour by hour`} />
        </ChartCard>
        <ChartCard title="Where candidates stand" sub={`${c.total} applications by stage`}>
          <Donut items={pipeline} empty="No applications yet" center="Applied" />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Applications by role" sub="The job each candidate applied for">
          <BarList items={s.by_role} total={c.total} empty="No applications yet" />
        </ChartCard>
        <ChartCard title="Interview scores" sub={s.avg_score != null ? `Average ${s.avg_score} out of 5` : 'Scores appear once you rate candidates'}>
          <VBars items={s.score_bands} total={s.score_bands.reduce((n, x) => n + x.value, 0)} empty="No rated interviews yet" />
        </ChartCard>
      </div>

      <h2 className="pt-2 text-xs font-extrabold uppercase tracking-widest text-slate-400">Your candidates</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ChartCard title="Qualification" sub="Highest qualification">
          <Donut items={s.qualification} empty="No candidates yet" center="Candidates" />
        </ChartCard>
        <ChartCard title="Work experience">
          <VBars items={s.experience} total={c.total} empty="No candidates yet" />
        </ChartCard>
        <ChartCard title="Gender" className="md:col-span-2 xl:col-span-1">
          <Donut items={s.gender} empty="No candidates yet" center="Candidates" />
        </ChartCard>
      </div>
    </div>
  );
}
