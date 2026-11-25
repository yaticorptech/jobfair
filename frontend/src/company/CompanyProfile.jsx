import { useState } from 'react';
import { BriefcaseBusiness, Megaphone, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib.jsx';
import { Button, Card, Field, Input, Modal, Notice, Textarea, useToast } from '../ui.jsx';
import { FormError } from '../Login.jsx';
import IndustrySelect from '../IndustrySelect.jsx';

const positions = (n) => `${n.toLocaleString('en-IN')} open position${n === 1 ? '' : 's'}`;

// One job opening, added or changed in a sheet of its own. Who can apply and the job location
// are required. For a new opening they start with what the company gave last time ("defaults"),
// because they are often the same for all its jobs.
function JobSheet({ job, defaults, onClose, onSave }) {
  const [v, setV] = useState(() => ({
    title: job?.title ?? '',
    openings: job?.openings ? String(job.openings) : '',
    ctc: job?.ctc ?? '',
    eligibility: (job ? job.eligibility : defaults.eligibility) || '',
    location: (job ? job.location : defaults.location) || '',
    description: job?.description ?? '',
  }));
  const [errors, setErrors] = useState({});
  const [failed, setFailed] = useState('');
  const [busy, setBusy] = useState(false);
  const on = (key) => (e) => {
    setV((old) => ({ ...old, [key]: e.target.value }));
    setErrors({});
    setFailed('');
  };

  async function submit(e) {
    e.preventDefault();
    const found = {};
    if (v.title.trim().length < 2) found.title = 'Enter the job role';
    if (!v.eligibility.trim()) found.eligibility = 'Enter who can apply for this job';
    if (!v.location.trim()) found.location = 'Enter the job location';
    if (Object.keys(found).length) {
      setErrors(found);
      requestAnimationFrame(() => document.querySelector('#job-form [data-error]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    setErrors({});
    setFailed('');
    setBusy(true);
    const problem = await onSave({ ...(job ? { id: job.id } : {}), ...v });
    if (problem) {
      setFailed(problem);
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      wide
      title={job ? 'Edit job opening' : 'Add a job opening'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="job-form" size="lg" loading={busy}>
            {job ? 'Save changes' : 'Add job opening'}
          </Button>
        </>
      }
    >
      <form id="job-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="Job role" required error={errors.title} className="sm:col-span-2">
          <Input value={v.title} onChange={on('title')} error={errors.title} placeholder="e.g. Sales Executive" maxLength={80} autoFocus />
        </Field>
        <Field label="Open positions" hint="How many people you will hire for this role">
          <Input type="number" min="0" inputMode="numeric" value={v.openings} onChange={on('openings')} placeholder="e.g. 5" />
        </Field>
        <Field label="CTC" hint="Salary offered for this role">
          <Input value={v.ctc} onChange={on('ctc')} placeholder="e.g. ₹2.4 – 3.2 LPA" maxLength={80} />
        </Field>
        <Field label="Who can apply" required error={errors.eligibility} hint="Qualification or experience needed for this job" className="sm:col-span-2">
          <Input value={v.eligibility} onChange={on('eligibility')} error={errors.eligibility} placeholder="e.g. Any degree, 2024–2026 pass-outs" maxLength={300} />
        </Field>
        <Field label="Job location" required error={errors.location} hint="Where the person will work" className="sm:col-span-2">
          <Input value={v.location} onChange={on('location')} error={errors.location} placeholder="e.g. Udupi, Mangaluru" maxLength={120} />
        </Field>
        <Field label="Job description" hint="The work, the skills needed, shift and other details" className="sm:col-span-2">
          <Textarea value={v.description} onChange={on('description')} rows={5} maxLength={1500} />
        </Field>
        <div className="sm:col-span-2">
          <FormError>{failed}</FormError>
        </div>
      </form>
    </Modal>
  );
}

function DetailsSheet({ company, onClose, onSave }) {
  const [v, setV] = useState(() => ({
    about: company.about,
    industry: company.industry,
    room_no: company.room_no,
    location: company.location,
    website: company.website,
  }));
  const [failed, setFailed] = useState('');
  const [busy, setBusy] = useState(false);
  const on = (key) => (e) => setV((old) => ({ ...old, [key]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setFailed('');
    setBusy(true);
    const problem = await onSave(v);
    if (problem) {
      setFailed(problem);
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      wide
      title="Company details"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form="details-form" size="lg" loading={busy}>
            Save details
          </Button>
        </>
      }
    >
      <form id="details-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="About the company" hint="What your company does, in a few lines" className="sm:col-span-2">
          <Textarea value={v.about} onChange={on('about')} rows={4} maxLength={1500} autoFocus />
        </Field>
        <Field label="Industry">
          <IndustrySelect value={v.industry} onChange={(industry) => setV((old) => ({ ...old, industry }))} />
        </Field>
        <Field label="Interview desk number" hint="The big number on the poster at your desk">
          <Input value={v.room_no} onChange={on('room_no')} inputMode="numeric" maxLength={20} placeholder="e.g. 12" />
        </Field>
        <Field label="Floor number" hint="e.g. 1, or Ground floor, PU College">
          <Input value={v.location} onChange={on('location')} maxLength={80} placeholder="e.g. 1" />
        </Field>
        <Field label="Website" className="sm:col-span-2">
          <Input value={v.website} onChange={on('website')} placeholder="www.example.com" maxLength={200} inputMode="url" autoCapitalize="none" />
        </Field>
        <div className="sm:col-span-2">
          <FormError>{failed}</FormError>
        </div>
      </form>
    </Modal>
  );
}

function Row({ label, children }) {
  return (
    <div className="py-3">
      <dt className="text-sm font-semibold text-slate-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line break-words text-[15px] font-semibold text-slate-900">{children || <span className="font-normal text-slate-400">Not added yet</span>}</dd>
    </div>
  );
}

// What the company tells candidates about itself: its job openings (role, open positions, CTC,
// description) and a few company details. Every save goes to the server straight away.
export default function CompanyProfile({ company, onSaved }) {
  const toast = useToast();
  const [editingJob, setEditingJob] = useState(null); // a job, 'new' or null
  const [editingDetails, setEditingDetails] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const { jobs } = company;
  const total = jobs.reduce((sum, job) => sum + job.openings, 0);
  // What a new job opening starts with: the company's latest answers, or what the organisers entered for it.
  const latest = (field) => [...jobs].reverse().find((job) => job[field])?.[field] || '';
  const jobDefaults = { eligibility: latest('eligibility') || company.eligibility, location: latest('location') || company.job_location };

  // Returns nothing when saved, or the reason it could not be saved.
  async function save(changes, message) {
    try {
      const data = await api('/recruiter/company', { method: 'PUT', body: changes });
      onSaved(data.company);
      toast(message);
      return '';
    } catch (err) {
      return err.message;
    }
  }

  async function saveJob(job) {
    const next = job.id ? jobs.map((old) => (old.id === job.id ? job : old)) : [...jobs, job];
    const problem = await save({ jobs: next }, job.id ? 'Job opening updated' : 'Job opening added');
    if (!problem) setEditingJob(null);
    return problem;
  }

  async function saveDetails(details) {
    const problem = await save(details, 'Company details saved');
    if (!problem) setEditingDetails(false);
    return problem;
  }

  async function remove() {
    setBusy(true);
    const problem = await save({ jobs: jobs.filter((job) => job.id !== removing.id) }, 'Job opening removed');
    setBusy(false);
    if (problem) toast(problem, 'error');
    else setRemoving(null);
  }

  return (
    // One column on phones; job openings and company details side by side on a laptop.
    <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
      {jobs.length === 0 && (
        <Notice icon={Megaphone} tone="blue" className="lg:col-span-2">
          Add your job openings so candidates can see what you are hiring for before they apply.
        </Notice>
      )}

      <Card className="p-5 sm:p-6">
        <h2 className="text-lg font-extrabold text-slate-900">Job openings</h2>
        <p className="text-sm text-slate-500">
          {jobs.length === 0 ? 'None added yet' : `${jobs.length} ${jobs.length === 1 ? 'role' : 'roles'}${total > 0 ? ` · ${positions(total)}` : ''}`}
        </p>

        {jobs.length > 0 && (
          <ul className="mt-4 space-y-2.5">
            {jobs.map((job) => {
              const missing = [!job.eligibility && 'who can apply', !job.location && 'job location', !job.openings && 'open positions', !job.ctc && 'CTC', !job.description && 'job description'].filter(Boolean);
              return (
                <li key={job.id} className="rounded-2xl bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-extrabold leading-snug text-slate-900">{job.title}</p>
                      <p className="mt-1.5 flex flex-wrap gap-1.5 text-xs font-bold">
                        {job.openings > 0 && <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-700">{positions(job.openings)}</span>}
                        {job.ctc && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">CTC {job.ctc}</span>}
                        <span className="rounded-full bg-white px-2.5 py-1 text-slate-600 ring-1 ring-inset ring-slate-200">{job.applicants} applied</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      <button type="button" onClick={() => setEditingJob(job)} aria-label={`Edit ${job.title}`} title="Edit" className="grid size-11 cursor-pointer place-items-center rounded-full bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-100">
                        <Pencil className="size-4.5" />
                      </button>
                      <button type="button" onClick={() => setRemoving(job)} aria-label={`Remove ${job.title}`} title="Remove" className="grid size-11 cursor-pointer place-items-center rounded-full bg-rose-50 text-rose-600 hover:bg-rose-100">
                        <Trash2 className="size-4.5" />
                      </button>
                    </div>
                  </div>
                  {(job.eligibility || job.location) && (
                    <p className="mt-2 text-sm text-slate-600">
                      {[job.eligibility && `Who can apply: ${job.eligibility}`, job.location && `Location: ${job.location}`].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {job.description && <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">{job.description}</p>}
                  {missing.length > 0 && (
                    <button type="button" onClick={() => setEditingJob(job)} className="mt-1.5 min-h-11 cursor-pointer text-left text-sm font-bold text-blue-700 underline-offset-4 hover:underline">
                      Add {missing.join(', ')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <Button size="lg" className="mt-4 w-full" onClick={() => setEditingJob('new')}>
          <Plus className="size-5" aria-hidden="true" /> Add a job opening
        </Button>
      </Card>

      <Card className="p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
            <BriefcaseBusiness className="size-5 text-blue-600" aria-hidden="true" /> Company details
          </h2>
          <Button variant="soft" size="sm" onClick={() => setEditingDetails(true)}>
            <Pencil className="size-4" aria-hidden="true" /> Edit
          </Button>
        </div>
        <dl className="mt-2 divide-y divide-slate-100">
          <Row label="About the company">{company.about}</Row>
          <Row label="Industry">{company.industry}</Row>
          <Row label="Interview desk number">{company.room_no}</Row>
          <Row label="Floor number">{company.location}</Row>
          <Row label="Website">{company.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</Row>
        </dl>
        <p className="mt-3 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-500">
          Your company name cannot be changed here: ask the organisers at the help desk.
        </p>
      </Card>

      {editingJob && <JobSheet job={editingJob === 'new' ? null : editingJob} defaults={jobDefaults} onClose={() => setEditingJob(null)} onSave={saveJob} />}
      {editingDetails && <DetailsSheet company={company} onClose={() => setEditingDetails(false)} onSave={saveDetails} />}

      <Modal
        open={Boolean(removing)}
        title="Remove this job opening?"
        onClose={() => setRemoving(null)}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button variant="danger" size="lg" onClick={remove} loading={busy}>
              Remove
            </Button>
          </>
        }
      >
        <p className="text-slate-600">
          Candidates will no longer see <span className="font-bold text-slate-900">{removing?.title}</span> or be able to apply for it.
          {removing?.applicants > 0 && (
            <>
              {' '}
              The <span className="font-bold text-slate-900">{removing.applicants}</span> {removing.applicants === 1 ? 'candidate who has' : 'candidates who have'} already applied for it {removing.applicants === 1 ? 'stays' : 'stay'} in your list.
            </>
          )}
        </p>
      </Modal>
    </div>
  );
}
