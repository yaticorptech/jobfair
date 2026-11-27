import { useCallback, useEffect, useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { api, download, experienceText, fmtDate, fmtTime } from '../lib.jsx';
import { Button, ErrorNote, Modal, PageLoader, Spinner, StatusBadge, useToast, Pager, rangeLabel, usePageSize, usePaging } from '../ui.jsx';
import { PageTitle, SearchBox, Table, Td, useDebounced } from './shared.jsx';

function Info({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="break-words text-sm font-semibold text-slate-900">{children || '—'}</dd>
    </div>
  );
}

export function CandidateModal({ id, onClose, onChanged }) {
  const toast = useToast();
  const [c, setC] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('view'); // view | delete
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/admin/candidates/${id}`)
      .then(setC)
      .catch((err) => setError(err.message));
  }, [id]);

  async function remove() {
    setBusy(true);
    try {
      await api(`/admin/candidates/${id}`, { method: 'DELETE' });
      toast('Candidate deleted');
      onChanged();
      onClose();
    } catch (err) {
      toast(err.message, 'error');
      setBusy(false);
    }
  }

  return (
    <Modal open wide title={c ? `${c.full_name} · ${c.reg_no}` : 'Candidate'} onClose={onClose}>
      {error ? (
        <ErrorNote message={error} />
      ) : !c ? (
        <div className="grid place-items-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
            <Info label="Mobile">
              <a href={`tel:${c.mobile}`} className="text-blue-700 underline-offset-4 hover:underline">
                {c.mobile}
              </a>
            </Info>
            <Info label="Email">{c.email}</Info>
            <Info label="Gender">{c.gender}</Info>
            <Info label="Date of birth">{fmtDate(c.dob, false)}</Info>
            <Info label="City / town">{c.city}</Info>
            <Info label="Pincode">{c.pincode}</Info>
            <Info label="Registered">{fmtTime(c.created_at)}</Info>
            <Info label="Qualification">{c.qualification}</Info>
            <Info label="Course / stream">{c.specialization}</Info>
            <Info label="College">{c.college}</Info>
            <Info label="Year of passing">{c.passing_year}</Info>
            <Info label="Percentage / CGPA">{c.percentage}</Info>
            <Info label="Experience">{experienceText(c)}</Info>
            {c.experience_type === 'experienced' && (
              <>
                <Info label="Last company">{c.last_company}</Info>
                <Info label="Last role">{c.last_role}</Info>
              </>
            )}
            <Info label="Skills">{c.skills}</Info>
            <Info label="Languages">{c.languages}</Info>
            <Info label="Looking for">{c.preferred_role}</Info>
            <Info label="Knows AI">{c.ai_known === 'yes' ? 'Yes' : c.ai_known === 'no' ? 'No' : ''}</Info>
            <Info label="AI Course">{c.ai_known === 'yes' ? 'Not needed' : c.ai_course ? 'Interested' : c.ai_known === 'no' ? 'Not interested' : ''}</Info>
          </dl>

          <div>
            <h3 className="mb-2 text-sm font-bold text-slate-900">Applications ({c.applications.length})</h3>
            {c.applications.length === 0 ? (
              <p className="text-sm text-slate-500">Has not applied to any company yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {c.applications.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900">{a.company_name}</p>
                      <p className="text-xs text-slate-500">
                        {[a.role, `Desk ${a.room_no || 'not set'}`, `Token ${a.token_no}`].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <StatusBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {mode === 'view' && (
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
              <Button variant="danger" size="sm" onClick={() => setMode('delete')}>
                <Trash2 className="size-4" aria-hidden="true" /> Delete
              </Button>
            </div>
          )}

          {mode === 'delete' && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm font-semibold text-rose-900">
                Delete {c.full_name} and their {c.applications.length} application{c.applications.length === 1 ? '' : 's'}? This cannot be undone.
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant="danger" size="sm" onClick={remove} loading={busy}>
                  Yes, delete
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setMode('view')}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

export default function Candidates() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const search = useDebounced(q.trim());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);
  const [exporting, setExporting] = useState(false);
  const PAGE = usePageSize(10, 25);
  const paging = usePaging(data?.total ?? 0, PAGE, `${search}|${PAGE}`);
  const { page } = paging;

  const load = useCallback(
    () =>
      api(`/admin/candidates?q=${encodeURIComponent(search)}&limit=${PAGE}&offset=${(page - 1) * PAGE}`)
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
      await download('/admin/export/candidates', 'job-fair-candidates.xlsx');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setExporting(false);
    }
  }

  if (!data) return error ? <ErrorNote message={error} onRetry={load} /> : <PageLoader />;

  return (
    <>
      <PageTitle title="Candidates" sub={`${data.total.toLocaleString('en-IN')} ${search ? 'found' : 'registered'}`}>
        <Button variant="secondary" onClick={exportAll} loading={exporting}>
          {!exporting && <Download className="size-4" aria-hidden="true" />} Download Excel
        </Button>
      </PageTitle>

      <SearchBox value={q} onChange={setQ} placeholder="Search name, mobile, reg no or skill" className="mb-4 max-w-lg" />

      <Table
        head={['Reg no', 'Name', 'Mobile', 'Qualification', 'Experience', 'Applied', 'Registered']}
        empty={data.rows.length === 0 ? (search ? 'No candidate matches your search.' : 'No candidate has registered yet.') : null}
      >
        {data.rows.map((c) => (
          <tr key={c.id} onClick={() => setOpenId(c.id)} className="cursor-pointer hover:bg-blue-50/60">
            <Td label="Reg no" className="whitespace-nowrap font-bold text-blue-700">{c.reg_no}</Td>
            <Td primary>
              <button type="button" className="cursor-pointer text-left font-bold text-slate-900 underline-offset-4 hover:underline">
                {c.full_name}
              </button>
              <p className="text-xs text-slate-500">{c.city}</p>
            </Td>
            <Td label="Mobile" className="whitespace-nowrap">{c.mobile}</Td>
            <Td label="Qualification" className="max-w-56">
              <p className="truncate text-slate-800">{c.qualification}</p>
              <p className="truncate text-xs text-slate-500">{c.specialization}</p>
            </Td>
            <Td label="Experience" className="whitespace-nowrap">{c.experience_type === 'experienced' ? `${c.experience_years} yrs` : 'Fresher'}</Td>
            <Td label="Companies applied" className="font-bold">{c.applications}</Td>
            <Td label="Registered" className="whitespace-nowrap text-xs text-slate-500">{fmtTime(c.created_at)}</Td>
          </tr>
        ))}
      </Table>

      <Pager className="mt-5" page={paging.page} pages={paging.pages} onChange={paging.setPage} label={rangeLabel(paging.start, paging.end, data.total, 'Candidates')} />

      {openId && <CandidateModal id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
    </>
  );
}
