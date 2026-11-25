import { useEffect, useState } from 'react';
import { api, useInfo } from '../lib.jsx';
import { Button, Card, ErrorNote, Field, Input, PageLoader, Textarea, Toggle, useToast } from '../ui.jsx';
import { PageTitle } from './shared.jsx';

export default function Settings() {
  const toast = useToast();
  const { refresh } = useInfo();
  const [v, setV] = useState(null);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  const load = () =>
    api('/admin/settings')
      .then((data) => {
        setV({ ...data, max_applications: String(data.max_applications) });
        setError('');
      })
      .catch((err) => setError(err.message));

  useEffect(() => {
    load();
  }, []);

  if (!v) return error ? <ErrorNote message={error} onRetry={load} /> : <PageLoader />;

  const on = (key) => (e) => setV((old) => ({ ...old, [key]: e.target.value }));

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const data = await api('/admin/settings', { method: 'PUT', body: v });
      setV({ ...data, max_applications: String(data.max_applications) });
      await refresh();
      toast('Settings saved');
    } catch (err) {
      setErrors(err.fields || {});
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="max-w-3xl">
      <PageTitle title="Settings" sub="These details are shown to candidates on the first page and on their dashboard." />

      <div className="space-y-4">
        <Card className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          <h2 className="font-bold text-slate-900 sm:col-span-2">Event details</h2>
          <Field label="Job fair name" required error={errors.fair_name} className="sm:col-span-2">
            <Input value={v.fair_name} onChange={on('fair_name')} error={errors.fair_name} maxLength={80} />
          </Field>
          <Field label="Date" error={errors.fair_date}>
            <Input type="date" value={v.fair_date} onChange={on('fair_date')} error={errors.fair_date} />
          </Field>
          <Field label="Time">
            <Input value={v.fair_time} onChange={on('fair_time')} placeholder="e.g. 8:30 AM to 2:30 PM" maxLength={60} />
          </Field>
          <Field label="Venue" className="sm:col-span-2">
            <Input value={v.venue} onChange={on('venue')} maxLength={200} />
          </Field>
          <Field label="Organised by" className="sm:col-span-2">
            <Input value={v.organiser} onChange={on('organiser')} maxLength={160} />
          </Field>
          <Field label="Contact numbers" hint="Separate with commas. Candidates can tap a number to call." className="sm:col-span-2">
            <Input value={v.contacts} onChange={on('contacts')} maxLength={200} />
          </Field>
        </Card>

        <Card className="grid gap-4 p-5 sm:p-6">
          <h2 className="font-bold text-slate-900">Text on the candidate pages</h2>
          <Field label="Highlights" hint="One per line. Shown as yellow tags on the first page.">
            <Textarea value={v.highlights} onChange={on('highlights')} rows={4} maxLength={300} />
          </Field>
          <Field label="Who can participate?">
            <Textarea value={v.eligibility} onChange={on('eligibility')} rows={3} maxLength={500} />
          </Field>
          <Field label="Important notice" hint="Shown on the first page and at the top of every candidate's dashboard. Use it for announcements on the day.">
            <Textarea value={v.notice} onChange={on('notice')} rows={3} maxLength={500} />
          </Field>
        </Card>

        <Card className="grid gap-5 p-5 sm:p-6">
          <h2 className="font-bold text-slate-900">Controls</h2>
          <Toggle
            checked={v.registration_open}
            onChange={(registration_open) => setV((old) => ({ ...old, registration_open }))}
            label="Registration is open"
            hint="Turn off to stop new candidates from registering. Registered candidates can still log in."
          />
          <Toggle
            checked={v.applications_open}
            onChange={(applications_open) => setV((old) => ({ ...old, applications_open }))}
            label="Candidates can apply to companies"
            hint="Turn off when the fair is over, or keep it off until the company list is final."
          />
          <Field label="Maximum companies one candidate can apply to" error={errors.max_applications} hint="0 means no limit." className="max-w-xs">
            <Input type="number" min="0" max="500" inputMode="numeric" value={v.max_applications} onChange={on('max_applications')} error={errors.max_applications} />
          </Field>
        </Card>

        <Card className="grid gap-4 p-5 sm:p-6">
          <h2 className="font-bold text-slate-900">Desk QR codes</h2>
          <Field
            label="Website address"
            error={errors.site_url}
            hint="The address people type to open this site, for example https://jobfair.example.com. It is put inside the desk QR codes, so set it before printing them. If left empty, the address you are using right now is used."
          >
            <Input value={v.site_url} onChange={on('site_url')} error={errors.site_url} placeholder="https://" maxLength={200} inputMode="url" autoCapitalize="none" />
          </Field>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" size="lg" loading={busy}>
            Save settings
          </Button>
        </div>

        <p className="rounded-xl bg-slate-200/70 px-4 py-3 text-xs leading-relaxed text-slate-600">
          The organiser username and password are set in the <span className="font-mono font-bold">.env</span> file on the server (ADMIN_USER and ADMIN_PASS). Restart the server after changing them.
        </p>
      </div>
    </form>
  );
}
