import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Building2, ClipboardList, Star, Trophy, TriangleAlert, Users } from 'lucide-react';
import { STATUS, api, fmtTime } from '../lib.jsx';
import { ChartCard, Combo, Donut, LineChart, Ring, VBars } from './charts.jsx';
import { Button, Card, ErrorNote, Modal, Notice, PageLoader, Pager, rangeLabel, usePaging, useToast } from '../ui.jsx';
import { PageTitle, Table, Td } from './shared.jsx';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (d) => `${+d.slice(8, 10)} ${MONTH[+d.slice(5, 7) - 1]}`;
const hourLabel = (h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;

// Everything below the number tiles: who registered, who applied, how interviews are going.
// Pies for shares of a whole, columns for counts, areas for change over time, a combo where
// two measures share a scale.
function Charts({ c, t, companies }) {
  const cand = c.candidates;
  const notApplied = cand.total - cand.applied;
  // The job fair is one day, so the time charts go hour by hour through the fair day: the fair
  // hours (8am to 3pm) at least, stretched to any hour that had activity.
  const regsHour = c.registrations_today_by_hour || [];
  const appsHour = c.applications_today_by_hour || [];
  const busy = regsHour.map((v, h) => (v || appsHour[h] ? h : -1)).filter((h) => h >= 0);
  const first = Math.min(8, ...busy);
  const last = Math.max(15, ...busy);
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const hourPoint = (h, a, b) => ({ key: h, label: hourLabel(h), long: `${hourLabel(h)} – ${hourLabel((h + 1) % 24)}`, a, b });
  const perHour = hours.map((h) => hourPoint(h, regsHour[h] || 0, appsHour[h] || 0));
  const fairDay = c.chart_day || c.today;
  const dayName = `${dayLabel(fairDay)}${fairDay === c.today ? ' (today)' : ''}`;

  // Running totals through the fair day, starting from everything that came in before it.
  let runA = c.before_chart_day?.registrations ?? 0;
  let runB = c.before_chart_day?.applications ?? 0;
  const growth = perHour.map((p) => {
    runA += p.a;
    runB += p.b;
    return { ...p, a: runA, b: runB };
  });

  const pipeline = ['applied', 'interviewed', 'shortlisted', 'selected', 'rejected'].map((k) => ({
    label: k === 'applied' ? 'Waiting for interview' : STATUS[k].label,
    value: t[k] || 0,
  }));
  const topCompanies = companies
    .filter((x) => x.applicants > 0)
    .slice(0, 8)
    .map((x) => ({ label: x.name, value: x.applicants }));

  const rate = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '0%');

  return (
    <section className="mt-6 space-y-4" aria-label="Charts">
      {/* The fair day itself: what is coming in, hour by hour, next to who the candidates are */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Fair day activity"
          sub={`${dayName} · hour by hour · registrations as columns, applications as a line`}
          action={
            <span className="hidden shrink-0 items-center gap-3 sm:flex">
              <Figure label="Registered" value={perHour.reduce((n, p) => n + p.a, 0)} />
              <Figure label="Applied" value={perHour.reduce((n, p) => n + p.b, 0)} />
            </span>
          }
        >
          <Combo points={perHour} names={['Registrations', 'Applications']} empty={`Activity on ${dayLabel(fairDay)} shows here, hour by hour, from 8am`} />
        </ChartCard>

        <ChartCard title="Candidates at a glance" sub={`${cand.total.toLocaleString('en-IN')} registered`}>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-blue-50 p-3.5">
              <p className="text-2xl font-extrabold tabular-nums text-blue-800">{cand.applied.toLocaleString('en-IN')}</p>
              <p className="text-xs font-bold text-blue-900/70">Applied to a company</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-3.5">
              <p className="text-2xl font-extrabold tabular-nums text-amber-800">{notApplied.toLocaleString('en-IN')}</p>
              <p className="text-xs font-bold text-amber-900/70">Registered, not applied</p>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-5">
            <Ring label="Have applied" value={cand.applied} total={cand.total} />
            <Ring label="Freshers" value={cand.freshers} total={cand.total} color="#e8650a" />
          </div>
        </ChartCard>
      </div>

      {/* How it is adding up, and where the interviews stand */}
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Growth through the day"
          sub={`Running totals, starting from ${(c.before_chart_day?.registrations ?? 0).toLocaleString('en-IN')} candidates and ${(c.before_chart_day?.applications ?? 0).toLocaleString('en-IN')} applications before ${dayLabel(fairDay)}`}
        >
          <LineChart area points={growth} names={['Candidates', 'Applications']} empty="Nothing yet" />
        </ChartCard>
        <ChartCard title="Interview progress" sub={`${t.applications.toLocaleString('en-IN')} applications · ${rate(t.applications - t.applied, t.applications)} interviewed`}>
          <Donut items={pipeline} empty="No applications yet" center="Applications" />
        </ChartCard>
      </div>

      <SectionLabel>Who the candidates are</SectionLabel>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ChartCard title="Gender">
          <Donut items={c.gender} empty="No candidates yet" center="Candidates" />
        </ChartCard>
        <ChartCard title="Qualification" sub="Highest qualification">
          <Donut items={c.qualification} empty="No candidates yet" center="Candidates" />
        </ChartCard>
        <ChartCard title="Where candidates are from" sub="Top towns and cities" className="md:col-span-2 xl:col-span-1">
          <Donut items={c.city} empty="No candidates yet" center="Candidates" />
        </ChartCard>
        <ChartCard title="Age group">
          <VBars items={c.age} total={cand.total} empty="No candidates yet" />
        </ChartCard>
        <ChartCard title="Year of passing">
          <VBars items={c.passing_year || []} total={cand.total} empty="No candidates yet" />
        </ChartCard>
        <ChartCard title="Work experience" className="md:col-span-2 xl:col-span-1">
          <VBars items={c.experience || []} total={cand.total} empty="No candidates yet" />
        </ChartCard>
      </div>

      <SectionLabel>Companies</SectionLabel>
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Most applied companies" sub="Top 8 by applications" className="lg:col-span-2">
          <VBars items={topCompanies} total={t.applications} empty="No applications yet" />
        </ChartCard>
        <ChartCard title="Companies" sub={`${c.companies.total.toLocaleString('en-IN')} registered`}>
          <div className="grid grid-cols-3 gap-2">
            <Ring label="Listed" value={c.companies.listed} total={c.companies.total} />
            <Ring label="Have a desk" value={c.companies.with_desk} total={c.companies.total} color="#e8650a" />
            <Ring label="Got applications" value={c.companies.with_applicants} total={c.companies.total} color="#008a17" />
          </div>
          {c.industry.length > 0 && (
            <>
              <p className="mb-3 mt-6 text-xs font-bold uppercase tracking-wider text-slate-400">By industry</p>
              <Donut items={c.industry} center="Companies" />
            </>
          )}
        </ChartCard>
      </div>
    </section>
  );
}

function SectionLabel({ children }) {
  return <h2 className="pt-4 text-xs font-extrabold uppercase tracking-widest text-slate-400">{children}</h2>;
}

// A small figure in a chart card's corner.
function Figure({ label, value }) {
  return (
    <span className="text-right">
      <span className="block text-lg font-extrabold leading-none tabular-nums text-slate-900">{value.toLocaleString('en-IN')}</span>
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
    </span>
  );
}

// A number tile: the icon and what it counts on top, the number, then one line of detail. Every tile
// has the same rows, so a row of tiles lines up whatever the numbers are.
function Tile({ icon: Icon, tone, value, label, sub, to }) {
  return (
    <Link
      to={to}
      aria-label={`${label}: ${value.toLocaleString('en-IN')}. ${sub}. Open ${label.toLowerCase()}`}
      className="group flex h-full flex-col rounded-3xl bg-white p-4 shadow-xs ring-1 ring-slate-900/5 outline-none transition duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-slate-900/10 focus-visible:ring-2 focus-visible:ring-blue-600 active:translate-y-0 sm:p-5"
    >
      <div className="flex items-center gap-2.5">
        <span className={`grid size-9 shrink-0 place-items-center rounded-xl ${tone}`}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-600">{label}</p>
        <ArrowUpRight className="size-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-slate-600 group-focus-visible:text-slate-600" aria-hidden="true" />
      </div>
      <p className="mt-4 text-[34px] font-extrabold leading-none tracking-tight tabular-nums text-slate-900">{value.toLocaleString('en-IN')}</p>
      <p className="mt-2 min-h-8 text-xs leading-snug text-slate-500">{sub}</p>
    </Link>
  );
}

export default function Overview() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const paging = usePaging(data?.companies.length ?? 0, 10, '', { scroll: false });

  const load = useCallback(
    () =>
      api('/admin/overview')
        .then((d) => {
          setData(d);
          setError('');
        })
        .catch((err) => setError(err.message)),
    [],
  );

  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 30000);
    return () => clearInterval(timer);
  }, [load]);

  async function clearDemo() {
    setClearing(true);
    try {
      await api('/admin/demo/clear', { method: 'POST' });
      toast('Sample data cleared');
      setConfirmClear(false);
      await load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setClearing(false);
    }
  }

  if (!data) return error ? <ErrorNote message={error} onRetry={load} /> : <PageLoader />;
  const t = data.totals;
  const pctOf = (n, d) => (d ? Math.round((n / d) * 100) : 0);
  const interviewed = t.applications - t.applied;

  return (
    <>
      <PageTitle title="Overview" sub="Live numbers for the fair, refreshed every 30 seconds.">
        <span className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-slate-600 ring-1 ring-inset ring-slate-200">
          <span className="relative flex size-2.5" aria-hidden="true">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
          </span>
          Live
        </span>
      </PageTitle>

      {data.demo_data && (
        <Notice icon={TriangleAlert} className="mb-5">
          <p>Sample companies and candidates are loaded so you can try the screens. Clear them before sharing the link with real candidates.</p>
          <Button variant="secondary" size="sm" className="mt-3 text-rose-700" onClick={() => setConfirmClear(true)}>
            Clear sample data
          </Button>
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 [&>*:last-child]:col-span-2 sm:[&>*:last-child]:col-span-1">
        <Tile icon={Users} tone="bg-blue-100 text-blue-700" value={t.candidates} label="Candidates" to="/admin/candidates" sub={`${t.applied_candidates.toLocaleString('en-IN')} have applied`} />
        <Tile icon={Building2} tone="bg-cyan-100 text-cyan-800" value={t.companies} label="Companies" to="/admin/companies" sub={t.empty_desks > 0 ? `${t.empty_desks.toLocaleString('en-IN')} desk QR ${t.empty_desks === 1 ? 'code' : 'codes'} not activated` : 'Every desk QR code is activated'} />
        <Tile icon={ClipboardList} tone="bg-violet-100 text-violet-800" value={t.applications} label="Applications" to="/admin/applications" sub={`${t.applied.toLocaleString('en-IN')} waiting for interview`} />
        <Tile icon={Star} tone="bg-amber-100 text-amber-800" value={t.shortlisted} label="Shortlisted" to="/admin/applications?status=shortlisted" sub={`${pctOf(t.shortlisted, interviewed)}% of ${interviewed.toLocaleString('en-IN')} interviewed`} />
        <Tile icon={Trophy} tone="bg-emerald-100 text-emerald-800" value={t.selected} label="Selected" to="/admin/applications?status=selected" sub={`${pctOf(t.selected, interviewed)}% of ${interviewed.toLocaleString('en-IN')} interviewed`} />
      </div>

      {data.charts && <Charts c={data.charts} t={t} companies={data.companies} />}

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <section className="min-w-0 xl:col-span-2">
          <h2 className="mb-3 text-lg font-extrabold text-slate-900">Applications by company</h2>
          <Table
            head={['Company', 'Desk', 'Applied', 'Waiting', 'Interviewed', 'Shortlisted', 'Selected']}
            empty={data.companies.length === 0 ? (t.empty_desks > 0 ? 'No company has registered yet.' : 'No companies yet. They appear here when they register.') : null}
          >
            {data.companies.slice(paging.start, paging.end).map((c) => (
              <tr key={c.id}>
                <Td primary className="min-w-52 font-bold text-slate-900">
                  <Link to={`/admin/applications?company=${c.id}`} className="underline-offset-4 hover:text-blue-700 hover:underline">
                    {c.name}
                  </Link>
                  {!c.active && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">Hidden</span>}
                </Td>
                <Td label="Desk" className="font-bold text-amber-800">{c.room_no || '—'}</Td>
                <Td label="Applied" className="font-bold">{c.applicants}</Td>
                <Td label="Waiting">{c.waiting}</Td>
                <Td label="Interviewed" phoneHide>{c.interviewed}</Td>
                <Td label="Shortlisted" phoneHide>{c.shortlisted}</Td>
                <Td label="Selected" className="font-bold text-emerald-700">{c.selected}</Td>
              </tr>
            ))}
          </Table>
          <Pager className="mt-4" page={paging.page} pages={paging.pages} onChange={paging.setPage} label={rangeLabel(paging.start, paging.end, data.companies.length, 'Companies')} />
        </section>

        <section className="min-w-0">
          <h2 className="mb-3 text-lg font-extrabold text-slate-900">Latest registrations</h2>
          <Card className="divide-y divide-slate-100">
            {data.recent.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">No candidate has registered yet.</p>}
            {data.recent.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{c.full_name}</p>
                  <p className="truncate text-xs text-slate-500">
                    {c.reg_no} · {c.qualification}
                  </p>
                </div>
                <p className="shrink-0 text-xs text-slate-500">{fmtTime(c.created_at)}</p>
              </div>
            ))}
          </Card>
        </section>
      </div>

      <Modal
        open={confirmClear}
        title="Clear all sample data?"
        onClose={() => setConfirmClear(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmClear(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={clearDemo} loading={clearing}>
              Yes, clear everything
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          This deletes <span className="font-bold text-slate-900">every company, candidate and application</span> currently in the system, so you can start fresh with the real list. The event details in Settings are kept.
        </p>
      </Modal>
    </>
  );
}
