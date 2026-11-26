import { useCallback, useEffect, useState } from 'react';
import { Building2, Check, GraduationCap, Megaphone, Send, Trash2 } from 'lucide-react';
import { api, fmtTime } from '../lib.jsx';
import { Button, Card, ErrorNote, Field, Input, Modal, PageLoader, Textarea, cx, useToast } from '../ui.jsx';
import { PageTitle } from './shared.jsx';

// The organisers write to candidates, companies or both. Candidates who turned on alerts get it on
// their phone straight away; candidates and companies also see it on their dashboards for two days.

function AudienceBox({ checked, onChange, icon: Icon, title, text }) {
  return (
    <label
      className={cx(
        'flex cursor-pointer items-start gap-3 rounded-2xl p-4 ring-1 ring-inset transition has-focus-visible:ring-2 has-focus-visible:ring-blue-600',
        checked ? 'bg-blue-50 ring-2 ring-blue-600' : 'bg-white ring-slate-200 hover:bg-slate-50',
      )}
    >
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', checked ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600')}>
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-extrabold text-slate-900">{title}</span>
        <span className="block text-sm text-slate-500">{text}</span>
      </span>
      <span className={cx('grid size-6 shrink-0 place-items-center rounded-md ring-1 ring-inset', checked ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white ring-slate-300')} aria-hidden="true">
        {checked && <Check className="size-4" />}
      </span>
    </label>
  );
}

const audienceLabel = (a) => (a.to_candidates && a.to_companies ? 'Candidates and companies' : a.to_candidates ? 'Candidates' : 'Companies');

export default function Announcements() {
  const toast = useToast();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [toCandidates, setToCandidates] = useState(true);
  const [toCompanies, setToCompanies] = useState(true);
  const [errors, setErrors] = useState({});
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(
    () =>
      api('/admin/announcements')
        .then((rows) => {
          setList(rows);
          setError('');
        })
        .catch((err) => setError(err.message)),
    [],
  );
  useEffect(() => {
    load();
  }, [load]);

  function review(e) {
    e.preventDefault();
    const next = {};
    if (title.trim().length < 3) next.title = 'Write a short title';
    if (!toCandidates && !toCompanies) next.audience = 'Choose who gets it: candidates, companies or both';
    setErrors(next);
    if (!Object.keys(next).length) setConfirming(true);
  }

  async function send() {
    setSending(true);
    try {
      const row = await api('/admin/announcements', { method: 'POST', body: { title, body, to_candidates: toCandidates, to_companies: toCompanies } });
      toast(row.to_candidates ? `Announcement sent · ${row.pushed} ${row.pushed === 1 ? 'phone' : 'phones'} alerted` : 'Announcement sent to companies');
      setTitle('');
      setBody('');
      setConfirming(false);
      await load();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setSending(false);
    }
  }

  async function remove() {
    try {
      await api(`/admin/announcements/${deleting.id}`, { method: 'DELETE' });
      toast('Announcement removed from the dashboards');
      setDeleting(null);
      await load();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  if (!list) return error ? <ErrorNote message={error} onRetry={load} /> : <PageLoader />;

  return (
    <>
      <PageTitle title="Announcements" sub="Send a message to candidates, companies or both" />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] xl:items-start">
        <Card className="p-5 sm:p-6">
          <form onSubmit={review} noValidate className="grid gap-4">
            <div>
              <p className="mb-2 text-sm font-bold text-slate-800">Send to</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <AudienceBox checked={toCandidates} onChange={setToCandidates} icon={GraduationCap} title="Candidates" text="Phone alert for those with alerts on, and on their dashboard" />
                <AudienceBox checked={toCompanies} onChange={setToCompanies} icon={Building2} title="Companies" text="A popup and a banner on every company dashboard" />
              </div>
              {errors.audience && <p className="mt-2 text-sm font-bold text-rose-600">{errors.audience}</p>}
            </div>
            <Field label="Title" error={errors.title} hint="Short, like a phone notification: e.g. Lunch break from 1 to 1:30 pm">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} error={errors.title} placeholder="e.g. Interviews resume at 2 pm" />
            </Field>
            <Field label="Message" hint={`Optional · ${500 - body.length} characters left`}>
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={500} placeholder="Any details: where to go, what to bring, timings…" />
            </Field>

            {/* How it will look on a phone */}
            {title.trim() && (
              <div className="rounded-2xl bg-slate-100 p-3">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">Preview</p>
                <div className="flex items-start gap-3 rounded-2xl bg-white p-3 shadow-sm">
                  <img src="/icon-192.png" alt="" className="size-9 rounded-lg" />
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-slate-900">{title}</p>
                    {body.trim() && <p className="line-clamp-3 text-sm text-slate-600">{body}</p>}
                  </div>
                </div>
              </div>
            )}

            <Button type="submit" size="lg" className="w-full sm:w-auto sm:justify-self-end">
              <Send className="size-5" aria-hidden="true" /> Review and send
            </Button>
          </form>
        </Card>

        <section>
          <h2 className="mb-3 text-lg font-extrabold text-slate-900">Sent</h2>
          {list.length === 0 ? (
            <Card className="grid place-items-center gap-2 p-10 text-center">
              <Megaphone className="size-8 text-slate-300" aria-hidden="true" />
              <p className="text-sm text-slate-500">No announcements yet.</p>
            </Card>
          ) : (
            <ul className="space-y-2.5">
              {list.map((a) => (
                <li key={a.id} className="flex items-start gap-3 rounded-3xl bg-white p-4 shadow-xs ring-1 ring-slate-900/5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
                    <Megaphone className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-slate-900">{a.title}</p>
                    {a.body && <p className="mt-0.5 whitespace-pre-line text-sm text-slate-600">{a.body}</p>}
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold text-slate-700">{audienceLabel(a)}</span>
                      <span>{fmtTime(a.created_at)}</span>
                      {a.to_candidates && <span>{a.pushed} {a.pushed === 1 ? 'phone' : 'phones'} alerted</span>}
                    </p>
                  </div>
                  <button type="button" onClick={() => setDeleting(a)} aria-label={`Remove ${a.title}`} title="Remove from dashboards" className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600">
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Modal
        open={confirming}
        title="Send this announcement?"
        onClose={() => setConfirming(false)}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button size="lg" onClick={send} loading={sending}>
              <Send className="size-5" aria-hidden="true" /> Send now
            </Button>
          </>
        }
      >
        <p className="text-[15px] text-slate-600">
          <span className="font-bold text-slate-900">{title}</span> goes to <span className="font-bold text-slate-900">{audienceLabel({ to_candidates: toCandidates, to_companies: toCompanies }).toLowerCase()}</span>.
          {toCandidates && ' Candidates with alerts on get it on their phone straight away; this cannot be taken back.'}
        </p>
      </Modal>

      <Modal
        open={Boolean(deleting)}
        title="Remove this announcement?"
        onClose={() => setDeleting(null)}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="lg" onClick={remove}>
              Remove
            </Button>
          </>
        }
      >
        <p className="text-[15px] text-slate-600">It disappears from the candidate and company dashboards. Phone alerts already delivered stay on those phones.</p>
      </Modal>
    </>
  );
}
