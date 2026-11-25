import { useState } from 'react';
import { LogOut, Pencil } from 'lucide-react';
import { api, experienceText, fmtDate } from '../lib.jsx';
import { Avatar, Button, Card, useToast } from '../ui.jsx';
import { CandidateFields, candidateErrors, toForm } from './CandidateFields.jsx';

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-3">
      <dt className="shrink-0 text-sm font-semibold text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-right text-[15px] font-bold text-slate-900">{children || <span className="font-normal text-slate-400">Not given</span>}</dd>
    </div>
  );
}

function EditDetails({ me, onSaved, onCancel }) {
  const toast = useToast();
  const [v, setV] = useState(() => toForm(me));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const set = (key, value) => {
    setV((old) => ({ ...old, [key]: value }));
    setErrors((old) => (old[key] ? { ...old, [key]: undefined } : old));
  };

  async function save(e) {
    e.preventDefault();
    const found = candidateErrors(v);
    if (Object.keys(found).length) {
      setErrors(found);
      toast('Please check the highlighted fields', 'error');
      requestAnimationFrame(() => document.querySelector('[data-error]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }
    setBusy(true);
    try {
      const updated = await api('/me', { method: 'PUT', body: v });
      toast('Details saved');
      onSaved(updated);
    } catch (err) {
      setErrors(err.fields || {});
      toast(err.message, 'error');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="space-y-4">
      <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Edit my details</h1>
      <CandidateFields v={v} set={set} errors={errors} />
      <div className="flex gap-3">
        <Button variant="secondary" size="lg" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="lg" loading={busy} className="flex-1">
          Save details
        </Button>
      </div>
    </form>
  );
}

export default function Profile({ me, setMe, onLogout }) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <EditDetails
        me={me}
        onCancel={() => setEditing(false)}
        onSaved={(updated) => {
          setMe(updated);
          setEditing(false);
          window.scrollTo({ top: 0 });
        }}
      />
    );
  }

  return (
    <div className="*:mb-4 *:break-inside-avoid lg:columns-2 lg:gap-4">
      <Card className="p-5 text-center sm:p-6">
        <Avatar name={me.full_name} round className="mx-auto size-20 text-2xl" />
        <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900">{me.full_name}</h1>
        <p className="text-slate-500">
          {me.qualification}
          {me.specialization ? ` · ${me.specialization}` : ''}
        </p>
        <p className="mt-3 inline-block rounded-full bg-amber-100 px-4 py-1.5 text-sm font-extrabold text-amber-900">Registration no. {me.reg_no}</p>
        <Button variant="soft" className="mt-4 w-full" onClick={() => setEditing(true)}>
          <Pencil className="size-4" aria-hidden="true" /> Edit my details
        </Button>
      </Card>

      <Card className="px-5 py-3 sm:px-6">
        <dl className="divide-y divide-slate-100">
          <Row label="Mobile">{me.mobile}</Row>
          <Row label="Email">{me.email}</Row>
          <Row label="Gender">{me.gender}</Row>
          <Row label="Date of birth">{fmtDate(me.dob, false)}</Row>
          <Row label="City / town">{me.city}</Row>
        </dl>
      </Card>

      <Card className="px-5 py-3 sm:px-6">
        <dl className="divide-y divide-slate-100">
          <Row label="Qualification">{me.qualification}</Row>
          <Row label="Course / stream">{me.specialization}</Row>
          <Row label="College">{me.college}</Row>
          <Row label="Year of passing">{me.passing_year}</Row>
          <Row label="Percentage / CGPA">{me.percentage}</Row>
        </dl>
      </Card>

      <Card className="px-5 py-3 sm:px-6">
        <dl className="divide-y divide-slate-100">
          <Row label="Experience">
            {experienceText(me)}
            {me.experience_type === 'experienced' && (me.last_role || me.last_company) ? ` · ${[me.last_role, me.last_company].filter(Boolean).join(' at ')}` : ''}
          </Row>
          <Row label="Key skills">{me.skills}</Row>
          <Row label="Languages">{me.languages}</Row>
          <Row label="Looking for">{me.preferred_role}</Row>
        </dl>
      </Card>

      <Button variant="danger" size="lg" className="w-full" onClick={onLogout}>
        <LogOut className="size-5" aria-hidden="true" /> Logout
      </Button>
    </div>
  );
}
