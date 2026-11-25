import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, MapPin, PartyPopper } from 'lucide-react';
import { api, fmtTime } from '../lib.jsx';
import { Button, Card, Empty, Modal, RoomBadge, StatusBadge, TokenBadge, cx, useToast } from '../ui.jsx';
import QueueNote from './QueueNote.jsx';

const STATUS_NOTE = {
  applied: 'Go to the interview desk and wait for your token number to be called.',
  interviewed: 'Your interview is done. The result will show here.',
  shortlisted: 'You are shortlisted. The company will tell you the next step.',
  selected: 'Congratulations! You have been selected.',
  rejected: 'Not selected this time. Keep trying with other companies.',
};

export default function Applications({ companies, reload }) {
  const toast = useToast();
  const [withdrawing, setWithdrawing] = useState(null);
  const [busy, setBusy] = useState(false);

  const mine = companies
    .filter((c) => c.application)
    .sort((a, b) => b.application.id - a.application.id);

  async function withdraw() {
    setBusy(true);
    try {
      await api(`/applications/${withdrawing.application.id}`, { method: 'DELETE' });
      await reload();
      toast('Application withdrawn');
      setWithdrawing(null);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">My applications</h1>
        <p className="text-slate-500">Your token and the interview desk to go to.</p>
      </div>

      {mine.length === 0 ? (
        <Empty icon={ClipboardList} title="No applications yet" text="Open a company and tap Apply to get your token.">
          <Button as={Link} to="/dashboard">
            See companies
          </Button>
        </Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {mine.map((c) => {
            const app = c.application;
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <Link to={`/c/${c.id}`} className="min-w-0">
                    <h2 className="font-extrabold leading-snug text-slate-900">{c.name}</h2>
                    <p className="text-sm text-slate-500">{app.role || c.industry}</p>
                  </Link>
                  <StatusBadge status={app.status} />
                </div>

                <div className="mt-3.5 grid grid-cols-2 gap-2.5">
                  <TokenBadge token={app.token_no} label="Your token" big />
                  <RoomBadge room={c.room_no} big />
                </div>
                {c.location && (
                  <p className="mt-3 flex items-start gap-1.5 text-sm font-semibold text-slate-600">
                    <MapPin className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
                    {c.location}
                  </p>
                )}

                {app.status === 'applied' && app.queue ? (
                  <QueueNote app={app} nowServing={c.now_serving} nowServingStarted={c.now_serving_started} nowServingDone={c.now_serving_done} room={c.room_no} className="mt-3" />
                ) : (
                  <p className={cx('mt-3 flex items-start gap-2 rounded-2xl px-3.5 py-3 text-sm font-semibold', app.status === 'selected' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-50 text-slate-600')}>
                    {app.status === 'selected' && <PartyPopper className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
                    {STATUS_NOTE[app.status]}
                  </p>
                )}

                <div className="mt-2 flex min-h-10 items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">Applied {fmtTime(app.created_at)}</p>
                  {app.status === 'applied' && (
                    <button type="button" onClick={() => setWithdrawing(c)} className="min-h-10 cursor-pointer rounded-full px-3 text-sm font-bold text-rose-700 hover:bg-rose-50">
                      Withdraw
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(withdrawing)}
        title="Withdraw application?"
        onClose={() => setWithdrawing(null)}
        footer={
          <>
            <Button variant="secondary" size="lg" onClick={() => setWithdrawing(null)}>
              Keep it
            </Button>
            <Button variant="danger" size="lg" onClick={withdraw} loading={busy}>
              Withdraw
            </Button>
          </>
        }
      >
        <p className="text-slate-600">
          Your application to <span className="font-bold text-slate-900">{withdrawing?.name}</span> will be removed and you will lose token{' '}
          <span className="font-bold text-slate-900">{withdrawing?.application.token_no}</span>. You can apply again, but you will get a new token at the end of the queue.
        </p>
      </Modal>
    </div>
  );
}
