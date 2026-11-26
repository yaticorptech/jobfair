import { useCallback, useEffect, useState } from 'react';
import { BadgeCheck, Download } from 'lucide-react';
import { api, download, fmtTime } from '../lib.jsx';
import { Button, ErrorNote, PageLoader, useToast, Pager, rangeLabel, usePageSize, usePaging } from '../ui.jsx';
import { PageTitle, SearchBox, Table, Td, useDebounced } from './shared.jsx';

// Candidates who said Yes to the Government Certified AI Course on the last step of registration.
export default function AiCourse() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const PAGE = usePageSize(10, 25);
  const paging = usePaging(data?.total ?? 0, PAGE, `${search}|${PAGE}`);
  const { page } = paging;

  const load = useCallback(
    () =>
      api(`/admin/ai-course?q=${encodeURIComponent(search)}&limit=${PAGE}&offset=${(page - 1) * PAGE}`)
        .then((d) => {
          setData(d);
          setError('');
        })
        .catch((err) => setError(err.message)),
    [search, page, PAGE],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function exportAll() {
    setExporting(true);
    try {
      await download('/admin/export/ai-course', 'ai-course-interested.xlsx');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setExporting(false);
    }
  }

  if (!data) return error ? <ErrorNote message={error} onRetry={load} /> : <PageLoader />;

  return (
    <>
      <PageTitle title="AI Course" sub={`${data.total.toLocaleString('en-IN')} ${search ? 'found' : 'interested in the Government Certified AI Course'}`}>
        <Button variant="secondary" onClick={exportAll} loading={exporting} disabled={!search && data.total === 0}>
          {!exporting && <Download className="size-4" aria-hidden="true" />} Download Excel
        </Button>
      </PageTitle>

      <SearchBox value={q} onChange={setQ} placeholder="Search name, mobile, reg no, city or pincode" className="mb-4 max-w-lg" />

      <Table
        head={['Reg no', 'Name', 'Mobile', 'Email', 'Qualification', 'Experience', 'Signed up']}
        empty={
          data.rows.length === 0
            ? search
              ? 'No one matches your search.'
              : 'No candidate has signed up for the AI Course yet. They are asked on the last step of registration.'
            : null
        }
      >
        {data.rows.map((c) => (
          <tr key={c.candidate_id}>
            <Td label="Reg no" className="whitespace-nowrap font-bold text-blue-700">
              <span className="inline-flex items-center gap-1.5">
                <BadgeCheck className="size-4 text-emerald-600" aria-hidden="true" />
                {c.reg_no}
              </span>
            </Td>
            <Td primary>
              <p className="font-bold text-slate-900">{c.full_name}</p>
              <p className="text-xs text-slate-500">{[c.city, c.pincode].filter(Boolean).join(' · ')}</p>
            </Td>
            <Td label="Mobile" className="whitespace-nowrap">
              <a href={`tel:${c.mobile}`} className="text-blue-700 underline-offset-4 hover:underline">
                {c.mobile}
              </a>
            </Td>
            <Td label="Email" className="max-w-56">
              <a href={`mailto:${c.email}`} className="block truncate text-slate-700 underline-offset-4 hover:underline">
                {c.email}
              </a>
            </Td>
            <Td label="Qualification" className="max-w-56">
              <p className="truncate text-slate-800">{c.qualification}</p>
              <p className="truncate text-xs text-slate-500">{c.specialization}</p>
            </Td>
            <Td label="Experience" className="whitespace-nowrap">{c.experience_type === 'experienced' ? `${c.experience_years} yrs` : 'Fresher'}</Td>
            <Td label="Signed up" className="whitespace-nowrap text-xs text-slate-500">{fmtTime(c.created_at)}</Td>
          </tr>
        ))}
      </Table>

      <Pager className="mt-5" page={paging.page} pages={paging.pages} onChange={paging.setPage} label={rangeLabel(paging.start, paging.end, data.total, 'People')} />
    </>
  );
}
