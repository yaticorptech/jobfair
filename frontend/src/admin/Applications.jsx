import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { STATUS, api, download, fmtTime } from '../lib.jsx';
import { Button, ErrorNote, PageLoader, cx, useToast, Pager, rangeLabel, usePageSize, usePaging } from '../ui.jsx';
import { PageTitle, SearchBox, Table, Td, useDebounced } from './shared.jsx';

const selectCls =
  'min-h-12 min-w-0 rounded-2xl border border-slate-200 bg-white px-3.5 text-base font-bold text-slate-800 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

export default function Applications() {
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const company = params.get('company') || '';
  const status = params.get('status') || '';
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim());
  const [companies, setCompanies] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const query = new URLSearchParams();
  if (company) query.set('company', company);
  if (status) query.set('status', status);
  if (search) query.set('q', search);
  const queryString = query.toString();
  const PAGE = usePageSize(10, 25);
  const paging = usePaging(data?.total ?? 0, PAGE, `${queryString}|${PAGE}`);
  const { page } = paging;

  const load = useCallback(
    () =>
      api(`/admin/applications?${queryString}${queryString ? '&' : ''}limit=${PAGE}&offset=${(page - 1) * PAGE}`)
        .then((d) => {
          setData(d);
          setError('');
        })
        .catch((err) => setError(err.message)),
    [queryString, page, PAGE],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api('/admin/companies')
      .then((list) => setCompanies(list.filter((c) => c.name))) // empty desks have no applications
      .catch(() => {});
  }, []);

  function setFilter(key, value) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  async function changeStatus(row, value) {
    const before = row.status;
    setData((old) => ({ ...old, rows: old.rows.map((r) => (r.id === row.id ? { ...r, status: value } : r)) }));
    try {
      await api(`/admin/applications/${row.id}`, { method: 'PUT', body: { status: value } });
      toast(`${row.full_name}: ${STATUS[value].label}`);
    } catch (err) {
      setData((old) => ({ ...old, rows: old.rows.map((r) => (r.id === row.id ? { ...r, status: before } : r)) }));
      toast(err.message, 'error');
    }
  }

  async function exportList() {
    setExporting(true);
    try {
      await download(`/admin/export/applications?${queryString}`, 'job-fair-applications.xlsx');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setExporting(false);
    }
  }

  if (!data) return error ? <ErrorNote message={error} onRetry={load} /> : <PageLoader />;
  const filtered = Boolean(company || status || search);

  return (
    <>
      <PageTitle title="Applications" sub={`${data.total.toLocaleString('en-IN')} ${filtered ? 'matching' : 'in total'}, in token order`}>
        <Button variant="secondary" onClick={exportList} loading={exporting}>
          {!exporting && <Download className="size-4" aria-hidden="true" />} Download Excel{filtered ? ' (this list)' : ''}
        </Button>
      </PageTitle>

      <div className="mb-4 flex flex-wrap gap-2">
        <select value={company} onChange={(e) => setFilter('company', e.target.value)} aria-label="Company" className={cx(selectCls, 'w-full sm:w-auto sm:max-w-72')}>
          <option value="">All companies</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.applicants})
            </option>
          ))}
        </select>
        <select value={status} onChange={(e) => setFilter('status', e.target.value)} aria-label="Status" className={cx(selectCls, 'flex-1 sm:flex-none')}>
          <option value="">Any status</option>
          {Object.entries(STATUS).map(([key, s]) => (
            <option key={key} value={key}>
              {s.label}
            </option>
          ))}
        </select>
        <SearchBox value={q} onChange={setQ} placeholder="Search name, mobile or reg no" className="w-full sm:w-auto sm:min-w-56 sm:max-w-xs sm:flex-1" />
      </div>

      <Table
        head={['Token', 'Candidate', 'Company', 'Role', 'Qualification', 'Status', 'Applied']}
        empty={data.rows.length === 0 ? (filtered ? 'No application matches these filters.' : 'No applications yet.') : null}
      >
        {data.rows.map((r) => (
          <tr key={r.id}>
            <Td label="Token">
              <span className="inline-grid min-w-9 place-items-center rounded-xl bg-blue-600 px-2.5 py-1 text-sm font-extrabold text-white">{r.token_no}</span>
            </Td>
            <Td primary>
              <p className="font-bold text-slate-900">{r.full_name}</p>
              <p className="whitespace-nowrap text-xs text-slate-500">
                {r.reg_no} · {r.mobile}
              </p>
            </Td>
            <Td label="Company" className="min-w-48">
              <p className="font-semibold text-slate-800">{r.company_name}</p>
              <p className="text-xs font-bold text-amber-800">Desk {r.room_no || 'not set'}</p>
            </Td>
            <Td label="Role" className="max-w-44 text-slate-600">{r.role || '—'}</Td>
            <Td label="Qualification" phoneHide className="max-w-52">
              <p className="truncate text-slate-800">{r.qualification}</p>
              <p className="truncate text-xs text-slate-500">
                {[r.specialization, r.experience_type === 'experienced' ? `${r.experience_years} yrs exp` : 'Fresher'].filter(Boolean).join(' · ')}
              </p>
            </Td>
            <Td label="Status">
              <select
                value={r.status}
                onChange={(e) => changeStatus(r, e.target.value)}
                aria-label={`Status of ${r.full_name}`}
                className={cx('min-h-10 cursor-pointer rounded-full py-1.5 pl-3.5 pr-1 text-base font-bold outline-none ring-1 ring-inset focus:ring-2', STATUS[r.status]?.cls)}
              >
                {Object.entries(STATUS).map(([key, s]) => (
                  <option key={key} value={key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Td>
            <Td label="Applied" phoneHide className="whitespace-nowrap text-xs text-slate-500">{fmtTime(r.created_at)}</Td>
          </tr>
        ))}
      </Table>

      <Pager className="mt-5" page={paging.page} pages={paging.pages} onChange={paging.setPage} label={rangeLabel(paging.start, paging.end, data.total, 'Applications')} />
    </>
  );
}
