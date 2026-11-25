import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleCheck, QrCode } from 'lucide-react';
import { api } from '../lib.jsx';
import { Button, Field, Input, Modal } from '../ui.jsx';
import { FormError } from '../Login.jsx';

// The next free desk number: where the numbering of new desks starts unless the organiser changes it.
export const nextDeskNumber = (list) => Math.max(0, ...list.map((c) => (/^\d{1,4}$/.test(c.room_no) ? Number(c.room_no) : 0))) + 1;

const whole = (text) => (/^\d{1,5}$/.test(String(text).trim()) ? Number(text) : 0);

// The organiser types how many interview desks there are. Every new desk gets a QR code poster
// with its desk number. The posters go on the desks in any order; the company at a desk activates
// its poster by scanning it. onQrPage: opened from the QR codes page, where the new posters appear
// as soon as this closes.
export default function DesksModal({ suggested = 1, onQrPage = false, onClose, onDone }) {
  const [v, setV] = useState({ count: '', from: String(suggested), location: '' });
  const [errors, setErrors] = useState({});
  const [failed, setFailed] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const on = (key) => (e) => {
    setV((old) => ({ ...old, [key]: e.target.value }));
    setErrors({});
    setFailed('');
  };

  const count = whole(v.count);
  const from = whole(v.from);
  const to = from + count - 1;
  const valid = count >= 1 && count <= 300 && from >= 1 && to <= 9999;

  async function save(e) {
    e.preventDefault();
    const problems = {};
    if (count < 1) problems.count = 'Enter how many desks there are';
    else if (count > 300) problems.count = 'Make up to 300 desks at a time';
    if (from < 1 || from > 9999) problems.from = 'Enter the number of the first desk';
    else if (count >= 1 && to > 9999) problems.from = 'Desk numbers go up to 9999';
    if (Object.keys(problems).length) {
      setErrors(problems);
      return;
    }
    setBusy(true);
    try {
      const data = await api('/admin/desks', { method: 'POST', body: { from, to, location: v.location } });
      setResult(data);
      onDone();
    } catch (err) {
      setFailed(err.message);
    } finally {
      setBusy(false);
    }
  }

  const skipped = result?.skipped ?? [];
  const one = skipped.length === 1;

  return (
    <Modal
      open
      title="Generate desk QR codes"
      onClose={onClose}
      footer={
        !result ? (
          <>
            <Button variant="secondary" size="lg" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="desks-form" size="lg" loading={busy}>
              {!busy && <QrCode className="size-5" aria-hidden="true" />} Generate QR codes
            </Button>
          </>
        ) : onQrPage ? (
          <Button size="lg" onClick={onClose}>
            Show the QR codes
          </Button>
        ) : (
          <>
            <Button variant="secondary" size="lg" onClick={onClose}>
              Done
            </Button>
            <Button as={Link} to="/admin/qr" size="lg">
              <QrCode className="size-5" aria-hidden="true" /> See the QR codes
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="text-[15px] text-slate-600">
          <p className="flex items-center gap-2 text-lg font-extrabold text-slate-900">
            <CircleCheck className="size-6 shrink-0 text-emerald-600" aria-hidden="true" />
            {result.added === 0 ? 'No new desk was needed' : `QR codes made for ${result.added} ${result.added === 1 ? 'desk' : 'desks'}`}
          </p>
          {skipped.length > 0 && (
            <p className="mt-2">
              {one ? 'Desk' : 'Desks'} {skipped.slice(0, 12).join(', ')}
              {skipped.length > 12 ? ' and more' : ''} {one ? 'was' : 'were'} already in the list, so {one ? 'it keeps its' : 'they keep their'} QR codes.
            </p>
          )}
          {result.added > 0 && <p className="mt-2">Print the posters and put one on every desk, in any order. The company at a desk activates it by scanning.</p>}
        </div>
      ) : (
        <form id="desks-form" onSubmit={save} noValidate className="grid grid-cols-2 gap-4">
          <Field label="How many desks?" required error={errors.count} className="col-span-2">
            <Input type="number" min="1" max="300" inputMode="numeric" value={v.count} onChange={on('count')} error={errors.count} placeholder="e.g. 40" autoFocus className="min-h-16 text-2xl font-extrabold" />
          </Field>
          <Field label="First desk number" error={errors.from}>
            <Input type="number" min="1" inputMode="numeric" value={v.from} onChange={on('from')} error={errors.from} />
          </Field>
          <Field label="Floor / block" hint="Optional">
            <Input value={v.location} onChange={on('location')} placeholder="e.g. Main Hall" maxLength={80} />
          </Field>
          <p className="col-span-2 rounded-2xl bg-blue-50 px-4 py-3 text-[15px] font-semibold text-slate-800" aria-live="polite">
            {valid ? (
              <>
                {count === 1 ? `Desk ${from} will get a QR code poster.` : `Desks ${from} to ${to} will each get a QR code poster.`}
              </>
            ) : (
              'Every desk gets a QR code poster with its desk number. The company at that desk activates it by scanning.'
            )}
          </p>
          <div className="col-span-2">
            <FormError>{failed}</FormError>
          </div>
        </form>
      )}
    </Modal>
  );
}
