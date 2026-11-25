import { useCallback, useState } from 'react';
import { CircleCheck } from 'lucide-react';
import { api } from '../lib.jsx';
import { Button, Field, Input, Modal } from '../ui.jsx';
import { FormError } from '../Login.jsx';
import { QrReader } from '../candidate/Scanner.jsx';

// The desk QR posters are put at the desks in any order. Here the company scans the one at its own
// desk, or types the desk number printed on it, and that desk becomes its own: candidates who scan
// that poster see this company from then on. If the floor is not known yet, the company is asked
// for it straight after. onDone is given the company with its new desk.
export default function ActivateDesk({ company, onClose, onDone }) {
  const [deskNo, setDeskNo] = useState('');
  const [floor, setFloor] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mine, setMine] = useState(null); // the company once the desk is its own and the floor is still missing

  // The reason when the server says no, nothing when the desk is now this company's.
  const send = useCallback(
    async (body) => {
      try {
        const data = await api('/recruiter/desk', { method: 'POST', body });
        if (data.company.location) onDone(data.company);
        else setMine(data.company);
        return '';
      } catch (err) {
        return err.message;
      }
    },
    [onDone],
  );

  const scanned = useCallback((text) => send({ qr: text }), [send]);

  async function typed(e) {
    e.preventDefault();
    if (!deskNo.trim()) {
      setError('Enter the desk number printed on the poster');
      return;
    }
    setBusy(true);
    const problem = await send({ desk_no: deskNo, location: floor });
    setBusy(false);
    if (problem) setError(problem);
  }

  async function saveFloor(e) {
    e.preventDefault();
    if (!floor.trim()) {
      onDone(mine);
      return;
    }
    setBusy(true);
    try {
      const data = await api('/recruiter/company', { method: 'PUT', body: { location: floor } });
      onDone(data.company);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (mine) {
    return (
      <Modal open title={`Desk ${mine.room_no} is yours`} onClose={() => onDone(mine)}>
        <p className="flex items-start gap-2 text-[15px] text-slate-600">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden="true" />
          Candidates who scan the QR code at this desk now see your company.
        </p>
        <form onSubmit={saveFloor} noValidate className="mt-5 space-y-4">
          <Field label="Which floor is your desk on?" hint="It helps candidates find you. e.g. 1, or Ground floor, PU College">
            <Input value={floor} onChange={(e) => setFloor(e.target.value)} maxLength={80} placeholder="e.g. 1" autoFocus />
          </Field>
          <FormError>{error}</FormError>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="secondary" size="lg" onClick={() => onDone(mine)}>
              Skip
            </Button>
            <Button type="submit" size="lg" loading={busy}>
              Save floor
            </Button>
          </div>
        </form>
      </Modal>
    );
  }

  return (
    <Modal open wide title={company.desk_id ? 'Scan the QR code at your new desk' : 'Activate your desk'} onClose={onClose}>
      <p className="mb-4 text-[15px] text-slate-600">
        Point the camera at the QR code on the poster at your interview desk. That desk becomes yours, and candidates who scan the poster will see your company.
      </p>
      <div className="mx-auto max-w-sm">
        <QrReader onText={scanned} />
      </div>

      <form onSubmit={typed} noValidate className="mt-5 border-t border-slate-100 pt-4">
        <p className="mb-3 font-bold text-slate-900">Or type it</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Interview desk number" hint="The big number on the poster">
            <Input
              value={deskNo}
              onChange={(e) => {
                setDeskNo(e.target.value);
                setError('');
              }}
              inputMode="numeric"
              maxLength={20}
              placeholder="e.g. 12"
            />
          </Field>
          <Field label="Floor number" hint="e.g. 1, or Ground floor">
            <Input value={floor} onChange={(e) => setFloor(e.target.value)} maxLength={80} placeholder="e.g. 1" />
          </Field>
        </div>
        <div className="mt-3 space-y-3">
          <FormError>{error}</FormError>
          <Button type="submit" size="lg" loading={busy} className="w-full">
            Activate this desk
          </Button>
        </div>
      </form>
    </Modal>
  );
}
