import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Download, FileSpreadsheet, Grid2x2Plus, KeyRound, Pencil, Plus, QrCode, RefreshCw, Trash2, Unlink } from 'lucide-react';
import { api, download, formatCode, useInfo } from '../lib.jsx';
import { AccessCode, Button, ErrorNote, Field, Input, Modal, PageLoader, Pager, Textarea, Toggle, cx, rangeLabel, usePageSize, usePaging, useToast } from '../ui.jsx';
import { PageTitle, SearchBox, Table, Td, isLocalAddress, siteAddress } from './shared.jsx';
import DesksModal, { nextDeskNumber } from './DesksModal.jsx';
import IndustrySelect from '../IndustrySelect.jsx';

// A row without a name is a desk QR code: a poster with a desk number that a company activates
// by scanning it. Until then it is free.
const isDesk = (c) => c.name === '';
const labelOf = (c) => c.name || (c.room_no ? `desk ${c.room_no}` : 'this desk');

const EMPTY = {
  name: '',
  industry: '',
  room_no: '',
  location: '',
  roles: '',
  eligibility: '',
  salary: '',
  vacancies: '',
  job_location: '',
  website: '',
  about: '',
  active: true,
};

function CompanyForm({ company, onClose, onSaved }) {
  const toast = useToast();
  const [v, setV] = useState(() =>
    company ? { ...EMPTY, ...company, roles: company.roles.join('\n'), vacancies: company.vacancies ? String(company.vacancies) : '' } : EMPTY,
  );
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const on = (key) => (e) => setV((old) => ({ ...old, [key]: e.target.value }));
  const desk = Boolean(company) && isDesk(company); // a desk QR code: only its number and floor can change

  async function save(e) {
    e.preventDefault();
    if (desk && !v.room_no.trim()) {
      setErrors({ room_no: 'Enter the desk number' });
      return;
    }
    if (!desk && v.name.trim().length < 2) {
      setErrors({ name: 'Enter the company name' });
      return;
    }
    setBusy(true);
    try {
      const saved = await api(company ? `/admin/companies/${company.id}` : '/admin/companies', { method: company ? 'PUT' : 'POST', body: v });
      toast(company ? 'Saved' : `${saved.name} added. Give it this access code.`);
      onSaved(company ? null : saved);
    } catch (err) {
      setErrors(err.fields || {});
      toast(err.message, 'error');
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      wide
      title={company ? (desk ? 'Edit desk QR code' : 'Edit company') : 'Add company'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="company-form" loading={busy}>
            {company ? 'Save changes' : 'Add company'}
          </Button>
        </>
      }
    >
      <form id="company-form" onSubmit={save} noValidate className="grid gap-4 sm:grid-cols-2">
        {desk ? (
          <p className="text-[15px] text-slate-600 sm:col-span-2">
            The number is printed on the poster, so print the poster again after changing it.
            {company.holder ? ` ${company.holder.name}, which has activated this desk, gets the new number too.` : ''}
          </p>
        ) : (
          <Field label="Company name" required error={errors.name} className="sm:col-span-2">
            <Input value={v.name} onChange={on('name')} error={errors.name} maxLength={120} autoFocus />
          </Field>
        )}
        {desk ? (
          <>
            <Field label="Interview desk number" required error={errors.room_no} hint="Shown big on the poster and on the candidate’s screen">
              <Input value={v.room_no} onChange={on('room_no')} error={errors.room_no} placeholder="e.g. 104" maxLength={20} autoFocus />
            </Field>
            <Field label="Floor / block" hint="Helps candidates find the desk">
              <Input value={v.location} onChange={on('location')} placeholder="e.g. First Floor, PU College" maxLength={80} />
            </Field>
          </>
        ) : (
          <>
        <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600 sm:col-span-2">
          {company?.desk_id
            ? `Desk ${company.room_no}${company.location ? `, ${company.location}` : ''}: linked by the company when it scanned the QR code at its desk.`
            : 'No desk yet. After saving, give the company its access code. At its desk it opens its dashboard and scans the QR code poster there, which links that desk to the company.'}
        </p>
        <Field label="Industry">
          <IndustrySelect value={v.industry} onChange={(industry) => setV((old) => ({ ...old, industry }))} />
        </Field>
        <Field label="Number of vacancies" hint="Once the company enters open positions for its roles, their total is shown instead.">
          <Input type="number" min="0" inputMode="numeric" value={v.vacancies} onChange={on('vacancies')} />
        </Field>
        <Field label="Roles they are hiring for" hint="One role per line. The company adds the job description, open positions and CTC of each role from its own dashboard." className="sm:col-span-2">
          <Textarea value={v.roles} onChange={on('roles')} rows={3} placeholder={'Sales Executive\nAccountant'} />
        </Field>
        <Field label="Eligibility" className="sm:col-span-2">
          <Input value={v.eligibility} onChange={on('eligibility')} placeholder="e.g. Any degree, 2024–2026 pass-outs" maxLength={300} />
        </Field>
        <Field label="Salary">
          <Input value={v.salary} onChange={on('salary')} placeholder="e.g. ₹15,000 – ₹20,000 per month" maxLength={80} />
        </Field>
        <Field label="Job location">
          <Input value={v.job_location} onChange={on('job_location')} placeholder="e.g. Udupi, Mangaluru" maxLength={120} />
        </Field>
        <Field label="Website" error={errors.website} className="sm:col-span-2">
          <Input value={v.website} onChange={on('website')} error={errors.website} placeholder="www.example.com" maxLength={200} inputMode="url" />
        </Field>
        <Field label="About the company" className="sm:col-span-2">
          <Textarea value={v.about} onChange={on('about')} rows={3} maxLength={1500} />
        </Field>
        <div className="sm:col-span-2">
          <Toggle checked={Boolean(v.active)} onChange={(active) => setV((old) => ({ ...old, active }))} label="Show this company to candidates" hint="Turn off to hide it without deleting its applications." />
        </div>
          </>
        )}
      </form>
    </Modal>
  );
}

function ImportModal({ onClose, onDone }) {
  const toast = useToast();
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  async function upload() {
    if (!file) {
      setError('Choose an Excel or CSV file first');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    setBusy(true);
    setError('');
    try {
      const data = await api('/admin/companies/import', { method: 'POST', form });
      setResult(data);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      wide
      title="Upload companies from Excel"
      onClose={onClose}
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={upload} loading={busy}>
              Upload
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div>
          <p className="font-bold text-slate-900">Upload finished</p>
          <ul className="mt-2 space-y-1 text-sm text-slate-700">
            <li>
              <span className="font-bold text-emerald-700">{result.added}</span> new companies added
            </li>
            <li>
              <span className="font-bold text-blue-700">{result.updated}</span> existing companies updated
            </li>
            {result.skipped.length > 0 && (
              <li>
                <span className="font-bold text-rose-700">{result.skipped.length}</span> rows skipped:{' '}
                {result.skipped.slice(0, 8).map((s) => `row ${s.row} (${s.reason})`).join(', ')}
              </li>
            )}
          </ul>
        </div>
      ) : (
        <div className="space-y-4 text-sm text-slate-600">
          <p>
            Upload an Excel (.xlsx) or CSV file with one company per row. The first row must have the column names. Only <span className="font-bold text-slate-900">Company Name</span> is required.
          </p>
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-xs leading-relaxed">
            Columns: Company Name, Industry, Roles (separated by commas), Eligibility, Salary, Vacancies, Job Location, Website, About. Desk numbers are not uploaded: each company links its desk by scanning the QR code there.
          </p>
          <p>
            A company that is already in the list (same name) is <span className="font-bold text-slate-900">updated</span>, not duplicated, so the list can be uploaded again with changes.
          </p>
          <Button variant="secondary" size="sm" className="max-w-full whitespace-normal py-2 text-left" onClick={() => download('/admin/companies/template', 'companies-template.xlsx').catch((err) => toast(err.message, 'error'))}>
            <Download className="size-4" aria-hidden="true" /> Download the Excel template
          </Button>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setError('');
            }}
            className="block w-full cursor-pointer rounded-xl border border-dashed border-slate-300 bg-slate-50 text-sm file:mr-3 file:cursor-pointer file:rounded-l-xl file:border-0 file:bg-blue-600 file:px-4 file:py-3 file:font-bold file:text-white"
          />
          {error && (
            <p role="alert" className="rounded-xl bg-rose-50 px-3.5 py-2.5 font-semibold text-rose-700">
              {error}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}

// The access code a company uses to open its own dashboard, with a ready message to send to it.
function LoginModal({ company, onClose, onChanged }) {
  const toast = useToast();
  const { info } = useInfo();
  const [code, setCode] = useState(company.access_code);
  const [desk, setDesk] = useState(company.desk_id ? company.room_no : ''); // the desk whose QR code this company has activated
  const [confirming, setConfirming] = useState(false); // false | 'code' | 'free'
  const [busy, setBusy] = useState(false);

  const site = siteAddress(info);
  const message = [
    `${info.fair_name}: company dashboard for ${labelOf(company)}`,
    `Open ${site}/company`,
    `Access code: ${formatCode(code)}`,
    'You will see the candidates who applied to your company, in token order.',
  ].join('\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      toast('Copied. Paste it in WhatsApp, SMS or email.');
    } catch {
      toast('Could not copy automatically. Select the text and copy it.', 'error');
    }
  }

  async function renew() {
    setBusy(true);
    try {
      const data = await api(`/admin/companies/${company.id}/access-code`, { method: 'POST' });
      setCode(data.access_code);
      setConfirming(false);
      onChanged();
      toast('New access code created');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  async function freeDesk() {
    setBusy(true);
    try {
      await api(`/admin/companies/${company.id}/desk/free`, { method: 'POST' });
      setDesk('');
      setConfirming(false);
      onChanged();
      toast('That desk QR code is free again');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open title="Company login" onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
      <div className={cx('flex items-start gap-3 rounded-2xl px-4 py-3 text-sm', desk ? 'bg-emerald-50 text-emerald-950' : 'bg-slate-100 text-slate-700')}>
        <QrCode className="mt-0.5 size-5 shrink-0 opacity-70" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-bold">{desk ? `Desk QR code: desk ${desk} activated` : 'Desk QR code: not activated yet'}</p>
          <p>
            {desk
              ? 'Candidates who scan the poster at that desk see this company.'
              : 'The company activates a desk by scanning the QR code on the poster there, from its dashboard (Desk QR tab).'}
          </p>
          {desk &&
            (confirming === 'free' ? (
              <div className="mt-2">
                <p className="font-semibold text-rose-800">The company will have no desk until it scans a desk QR code again. Use this when it scanned the poster of the wrong desk.</p>
                <div className="mt-2 flex gap-2">
                  <Button variant="danger" size="sm" onClick={freeDesk} loading={busy}>
                    Yes, free desk {desk}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming('free')} className="mt-1 inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-left font-bold text-emerald-900 underline-offset-4 hover:underline">
                <Unlink className="size-4" aria-hidden="true" /> Take this desk away from the company
              </button>
            ))}
        </div>
      </div>

      <p className="mt-4 text-sm text-slate-600">
        To use another phone or a laptop, <span className="font-bold text-slate-900">{labelOf(company)}</span> opens its dashboard with this access code. It sees only the candidates who applied to it.
      </p>
      <AccessCode code={code} shown={formatCode(code)} />

      <p className="mb-1.5 mt-4 text-sm font-semibold text-slate-700">Message to send to the company</p>
      <textarea
        readOnly
        value={message}
        rows={4}
        onFocus={(e) => e.target.select()}
        className="block w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-700 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
      />
      {isLocalAddress(site) && (
        <p className="mt-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-900">
          The address in this message only works on this computer or this Wi-Fi network. Once the site is live, enter its address in Settings › Website address before sending this to companies.
        </p>
      )}
      <Button variant="secondary" size="sm" className="mt-2" onClick={copy}>
        <Copy className="size-4" aria-hidden="true" /> Copy message
      </Button>

      <div className="mt-5 border-t border-slate-100 pt-4">
        {confirming === 'code' ? (
          <div className="rounded-xl bg-rose-50 px-4 py-3">
            <p className="text-sm font-semibold text-rose-800">The old code stops working at once and anyone using it is logged out. You must send the new code to the company.</p>
            <div className="mt-3 flex gap-2">
              <Button variant="danger" size="sm" onClick={renew} loading={busy}>
                Create new code
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming('code')} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-left text-sm font-semibold text-slate-500 hover:text-slate-800">
            <RefreshCw className="size-4" aria-hidden="true" /> Code shared with the wrong person? Create a new one
          </button>
        )}
      </div>
    </Modal>
  );
}

export default function Companies() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // company | 'new' | null
  const [importing, setImporting] = useState(false);
  const [addingDesks, setAddingDesks] = useState(false);
  const [show, setShow] = useState(''); // '' | 'named' | 'free'
  const [deleting, setDeleting] = useState(null);
  const [login, setLogin] = useState(null); // company whose access code is shown
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      api('/admin/companies')
        .then((data) => {
          setList(data);
          setError('');
        })
        .catch((err) => setError(err.message)),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (list || []).filter(
      (c) =>
        // A desk QR code that a company has activated is that company's row; it is not listed twice.
        !(isDesk(c) && c.holder) &&
        (!show || (show === 'free') === isDesk(c)) &&
        (!needle || [c.name, c.industry, c.room_no, c.location, ...c.roles].join(' ').toLowerCase().includes(needle)),
    );
  }, [list, q, show]);
  const pageSize = usePageSize(10, 20);
  const paging = usePaging(shown.length, pageSize, `${q.trim()}|${show}|${pageSize}`);

  async function remove() {
    setBusy(true);
    try {
      await api(`/admin/companies/${deleting.id}`, { method: 'DELETE' });
      toast(deleting.name ? 'Company deleted' : 'Desk QR code deleted');
      setDeleting(null);
      await load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  if (!list) return error ? <ErrorNote message={error} onRetry={load} /> : <PageLoader />;
  const named = list.filter((c) => !isDesk(c)).length;
  const free = list.filter((c) => isDesk(c) && !c.holder).length; // desk QR codes no company has activated yet
  const noRoom = list.filter((c) => !isDesk(c) && c.active && !c.room_no).length;

  return (
    <>
      <PageTitle
        title="Companies"
        sub={[`${named} ${named === 1 ? 'company' : 'companies'}`, noRoom && `${noRoom} without a desk yet`, free && `${free} free desk QR ${free === 1 ? 'code' : 'codes'}`].filter(Boolean).join(' · ')}
      >
        {list.length > 0 && (
          <Button
            variant="secondary"
            title="An Excel sheet with every company's access code"
            onClick={() => download('/admin/export/company-logins', 'job-fair-company-logins.xlsx').catch((err) => toast(err.message, 'error'))}
          >
            <KeyRound className="size-4" aria-hidden="true" /> Download logins
          </Button>
        )}
        <Button variant="secondary" onClick={() => setImporting(true)}>
          <FileSpreadsheet className="size-4" aria-hidden="true" /> Upload Excel
        </Button>
        <Button variant="secondary" title="Enter how many desks there are. Each gets a QR code poster, which the company at that desk activates by scanning." onClick={() => setAddingDesks(true)}>
          <Grid2x2Plus className="size-4" aria-hidden="true" /> Add desks
        </Button>
        <Button onClick={() => setEditing('new')}>
          <Plus className="size-4" aria-hidden="true" /> Add company
        </Button>
      </PageTitle>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchBox value={q} onChange={setQ} placeholder="Search company, role or desk" className="w-full sm:w-auto sm:min-w-80" />
        {free > 0 &&
          [
            ['', 'All', named + free],
            ['named', 'Companies', named],
            ['free', 'Free desk QR codes', free],
          ].map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => setShow(key)}
              aria-pressed={show === key}
              className={cx(
                'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-sm font-bold transition',
                show === key ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50',
              )}
            >
              {label}
              <span className={cx('rounded-full px-2 py-0.5 text-xs font-extrabold', show === key ? 'bg-white/20' : 'bg-slate-100 text-slate-700')}>{count}</span>
            </button>
          ))}
      </div>

      <Table
        head={['Company', 'Desk', 'Floor / block', 'Roles', 'Vacancies', 'Applied', { label: '', className: 'w-52' }]}
        empty={
          list.length === 0
            ? 'Nothing here yet. Companies appear here when they register through the company QR code. You can also add a company yourself, or upload the list from Excel.'
            : shown.length === 0
              ? 'Nothing matches.'
              : null
        }
      >
        {shown.slice(paging.start, paging.end).map((c) => (
          <tr key={c.id} className={c.active ? '' : 'bg-slate-50 text-slate-400'}>
            <Td primary>
              {c.name ? (
                <Link to={`/admin/companies/${c.id}/queue`} title="Open the live queue" className="font-bold text-slate-900 underline-offset-4 hover:text-blue-700 hover:underline">
                  {c.name}
                </Link>
              ) : (
                <p className="font-bold text-slate-500">Free desk QR code</p>
              )}
              <p className="text-xs text-slate-500">
                {c.name ? c.industry || '—' : 'No company has activated it yet'}
                {!c.active && <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600">Hidden</span>}
              </p>
            </Td>
            <Td label="Desk">
              {c.room_no ? (
                <span className="inline-block rounded-xl bg-amber-100 px-3 py-1 text-base font-extrabold text-amber-950">{c.room_no}</span>
              ) : (
                <span className="rounded-lg bg-rose-50 px-2 py-1 text-xs font-bold text-rose-700">No desk yet</span>
              )}
            </Td>
            <Td label="Floor / block" className="max-w-44 text-slate-600">{c.location || '—'}</Td>
            <Td label="Roles" className="max-w-64 text-slate-600">{c.roles.length ? c.roles.join(', ') : '—'}</Td>
            <Td label="Vacancies">{c.vacancies || '—'}</Td>
            <Td label="Applied" className="font-bold text-slate-900">{c.applicants}</Td>
            <Td actions>
              <div className="flex justify-end gap-1">
                {(isDesk(c) || c.desk_id || c.room_no) && (
                  <Link to={`/admin/qr?company=${c.desk_id || c.id}`} aria-label={`Desk QR code of ${labelOf(c)}`} title="Desk QR code" className="grid size-11 place-items-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200">
                    <QrCode className="size-4" />
                  </Link>
                )}
                {!isDesk(c) && (
                  <button type="button" onClick={() => setLogin(c)} aria-label={`Company login of ${labelOf(c)}`} title="Company login (desk and access code)" className="grid size-11 cursor-pointer place-items-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200">
                    <KeyRound className="size-4" />
                  </button>
                )}
                <button type="button" onClick={() => setEditing(c)} aria-label={`Edit ${labelOf(c)}`} title="Edit" className="grid size-11 cursor-pointer place-items-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200">
                  <Pencil className="size-4" />
                </button>
                <button type="button" onClick={() => setDeleting(c)} aria-label={`Delete ${labelOf(c)}`} title="Delete" className="grid size-11 cursor-pointer place-items-center rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100">
                  <Trash2 className="size-4" />
                </button>
              </div>
            </Td>
          </tr>
        ))}
      </Table>
      <Pager className="mt-5" page={paging.page} pages={paging.pages} onChange={paging.setPage} label={rangeLabel(paging.start, paging.end, shown.length, 'Showing')} />

      {editing && (
        <CompanyForm
          company={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(added) => {
            setEditing(null);
            load();
            if (added) setLogin(added); // show the new company's access code straight away
          }}
        />
      )}
      {importing && <ImportModal onClose={() => setImporting(false)} onDone={load} />}
      {addingDesks && <DesksModal suggested={nextDeskNumber(list)} onClose={() => setAddingDesks(false)} onDone={load} />}
      {login && <LoginModal company={login} onClose={() => setLogin(null)} onChanged={load} />}

      <Modal
        open={Boolean(deleting)}
        title={deleting && !deleting.name ? 'Delete this desk QR code?' : 'Delete this company?'}
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={remove} loading={busy}>
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600">
          <span className="font-bold text-slate-900">{deleting && (deleting.name || `The QR code of desk ${deleting.room_no}`)}</span> will be removed from the list
          {deleting?.applicants > 0 && (
            <>
              , along with its <span className="font-bold text-rose-700">{deleting.applicants} applications</span>
            </>
          )}
          . This cannot be undone{deleting && !deleting.name ? ', and the poster printed for this desk stops working.' : '. To only hide it from candidates, edit the company and turn off “Show this company”.'}
        </p>
      </Modal>
    </>
  );
}
