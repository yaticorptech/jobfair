import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ClipboardList, Star, Trophy, TriangleAlert, Users } from 'lucide-react';
import { STATUS, api, fmtTime } from '../lib.jsx';
import { ChartCard, ClusteredColumns, Combo, Donut, LineChart, Ring, Segmented, VBars } from './charts.jsx';
import { Button, Card, ErrorNote, Modal, Notice, PageLoader, Pager, rangeLabel, usePaging, useToast } from '../ui.jsx';
import { PageTitle, Table, Td } from './shared.jsx';

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = (d) => `${+d.slice(8, 10)} ${MONTH[+d.slice(5, 7) - 1]}`;
const hourLabel = (h) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;

// Everything below the number tiles: who registered, who applied, how interviews are going.
// Pies for shares of a whole, columns for counts, areas for change over time, a combo where
// two measures share a scale.
function Charts({ c, t, companies }) {
  const [range, setRange] = useState('days');
  const [mixRange, setMixRange] = useState('days');
  const cand = c.candidates;
  const notApplied = cand.total - cand.applied;
  const hourPoint = (h, a, b) => ({ key: h, label: hourLabel(h), long: `${hourLabel(h)} – ${hourLabel((h + 1) % 24)}`, a, b });
  const dayPoint = (d, a, b) => ({ key: d.day, label: dayLabel(d.day), long: `${dayLabel(d.day)}${d.day === c.today ? ' (today)' : ''}`, a, b });
  const appsHour = c.applications_today_by_hour || [];

  const combo = range === 'days' ? c.registrations_by_day.map((d) => dayPoint(d, d.value, d.applications || 0)) : c.registrations_today_by_hour.map((v, h) => hourPoint(h, v, appsHour[h] || 0));
  const clustered = mixRange === 'days' ? c.registrations_by_day.map((d) => dayPoint(d, d.value, d.applications || 0)) : c.registrations_today_by_hour.map((v, h) => hourPoint(h, v, appsHour[h] || 0));

  // Running totals: how the numbers have grown, day by day. The 14-day window may start after the
  // first registrations, so the totals start from what came before it.
  let runA = 0;
  let runB = 0;
  const growth = c.registrations_by_day.map((d) => {
    runA += d.value;
    runB += d.applications || 0;
    return { key: d.day, label: dayLabel(d.day), long: dayLabel(d.day), a: runA, b: runB };
  });
  const before = { a: Math.max(0, cand.total - runA), b: Math.max(0, t.applications - runB) };
  for (const g of growth) Object.assign(g, { a: g.a + before.a, b: g.b + before.b });

  const pipeline = ['applied', 'interviewed', 'shortlisted', 'selected', 'rejected'].map((k) => ({
    label: k === 'applied' ? 'Waiting for interview' : STATUS[k].label,
    value: t[k] || 0,
  }));
  const topCompanies = companies
    .filter((x) => x.applicants > 0)
    .slice(0, 8)
    .map((x) => ({ label: x.name, value: x.applicants }));
  const days = (value, set) => (
    <Segmented
      value={value}
      onChange={set}
      options={[
        { value: 'days', label: 'By day' },
        { value: 'hours', label: 'Today' },
      ]}
    />
  );

  return (
    <section className="mt-6" aria-label="Charts">
      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Candidates at a glance" sub={`${cand.total.toLocaleString('en-IN')} registered`}>
          <div className="mb-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-blue-50 p-3">
              <p className="text-2xl font-extrabold tabular-nums text-blue-800">{cand.applied.toLocaleString('en-IN')}</p>
              <p className="text-xs font-bold text-blue-900/70">Applied to a company</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-3">
              <p className="text-2xl font-extrabold tabular-nums text-amber-800">{notApplied.toLocaleString('en-IN')}</p>
              <p className="text-xs font-bold text-amber-900/70">Registered, not applied</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-5">
            <Ring label="Have applied" value={cand.applied} total={cand.total} />
            <Ring label="Freshers" value={cand.freshers} total={cand.total} color="#e8650a" />
            <Ring label="Uploaded a resume" value={cand.with_resume} total={cand.total} color="#6a4ce2" />
            <Ring label="Want the AI Course" value={cand.ai_course} total={cand.total} color="#008a17" />
          </div>
        </ChartCard>

        <ChartCard
          className="lg:col-span-2"
          title="Registrations and applications"
          sub={range === 'days' ? 'Per day: registrations as columns, applications as a line' : `Per hour, ${dayLabel(c.today)}`}
          action={days(range, setRange)}
        >
          <Combo points={combo} names={['Registrations', 'Applications']} empty={range === 'days' ? 'Nothing yet' : 'Nothing today yet'} />
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Side by side" sub={mixRange === 'days' ? 'Registrations and applications per day' : `Per hour, ${dayLabel(c.today)}`} action={days(mixRange, setMixRange)}>
          <ClusteredColumns points={clustered} names={['Registrations', 'Applications']} empty="Nothing yet" />
        </ChartCard>
        <ChartCard title="Growth" sub="Running total of candidates and applications">
          <LineChart area points={growth} names={['Candidates', 'Applications']} empty="Nothing yet" />
        </ChartCard>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ChartCard title="Interview progress" sub={`${t.applications.toLocaleString('en-IN')} applications by stage`}>
          <Donut items={pipeline} empty="No applications yet" center="Applications" />
        </ChartCard>
        <ChartCard title="Gender">
          <Donut items={c.gender} empty="No candidates yet" center="Candidates" />
        </ChartCard>
        <ChartCard title="Qualification" sub="Highest qualification">
          <Donut items={c.qualification} empty="No candidates yet" center="Candidates" />
        </ChartCard>

        <ChartCard title="Where candidates are from" sub="Top towns and cities">
          <Donut items={c.city} empty="No candidates yet" center="Candidates" />
        </ChartCard>
        <ChartCard title="Age group">
          <VBars items={c.age} total={cand.total} empty="No candidates yet" />
        </ChartCard>
        <ChartCard title="Year of passing">
          <VBars items={c.passing_year || []} total={cand.total} empty="No candidates yet" />
        </ChartCard>

        <ChartCard title="Work experience">
          <VBars items={c.experience || []} total={cand.total} empty="No candidates yet" />
        </ChartCard>
        <ChartCard title="Companies applied to, per candidate" sub="How widely candidates are applying">
          <VBars items={c.applications_per_candidate} total={cand.total} empty="No candidates yet" />
        </ChartCard>
        <ChartCard title="Languages known" sub="A candidate can know several">
          <VBars items={c.languages.filter((x) => !x.other)} total={cand.total} empty="No languages given yet" />
        </ChartCard>

        <ChartCard title="Most applied companies" sub="Top 8 by applications" className="md:col-span-2">
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
              <p className="mt-5 mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">By industry</p>
              <Donut items={c.industry} center="Companies" />
            </>
          )}
        </ChartCard>
      </div>
    </section>
  );
}

function Tile({ icon: Icon, tone, value, label, sub }) {
  return (
    // On a phone the icon sits above the number, so the label and the line under it are never cut short.
    <Card className="flex flex-col items-start gap-3 p-4 sm:flex-row sm:items-center">
      <span className={`grid size-11 shrink-0 place-items-center rounded-2xl sm:size-12 ${tone}`}>
        <Icon className="size-6" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-3xl font-extrabold leading-none text-slate-900">{value.toLocaleString('en-IN')}</p>
        <p className="mt-1 text-sm font-bold leading-snug text-slate-600">{label}</p>
        {sub && <p className="text-xs leading-snug text-slate-500">{sub}</p>}
      </div>
    </Card>
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

  return (
    <>
      <PageTitle title="Overview" sub="Live numbers, refreshed every 30 seconds." />

      {data.demo_data && (
        <Notice icon={TriangleAlert} className="mb-5">
          <p>Sample companies and candidates are loaded so you can try the screens. Clear them before sharing the link with real candidates.</p>
          <Button variant="secondary" size="sm" className="mt-3 text-rose-700" onClick={() => setConfirmClear(true)}>
            Clear sample data
          </Button>
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Tile icon={Users} tone="bg-blue-100 text-blue-700" value={t.candidates} label="Candidates" sub={`${t.applied_candidates.toLocaleString('en-IN')} have applied`} />
        <Tile icon={Building2} tone="bg-cyan-100 text-cyan-800" value={t.companies} label="Companies" sub={t.empty_desks > 0 ? `${t.empty_desks.toLocaleString('en-IN')} desk QR ${t.empty_desks === 1 ? 'code' : 'codes'} not activated` : undefined} />
        <Tile icon={ClipboardList} tone="bg-violet-100 text-violet-800" value={t.applications} label="Applications" sub={`${t.applied.toLocaleString('en-IN')} waiting for interview`} />
        <Tile icon={Star} tone="bg-amber-100 text-amber-800" value={t.shortlisted} label="Shortlisted" />
        <Tile icon={Trophy} tone="bg-emerald-100 text-emerald-800" value={t.selected} label="Selected" />
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
