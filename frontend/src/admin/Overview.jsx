import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, ClipboardList, Star, Trophy, TriangleAlert, Users } from 'lucide-react';
import { api, fmtTime } from '../lib.jsx';
import { Button, Card, ErrorNote, Modal, Notice, PageLoader, Pager, rangeLabel, usePaging, useToast } from '../ui.jsx';
import { PageTitle, Table, Td } from './shared.jsx';

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
