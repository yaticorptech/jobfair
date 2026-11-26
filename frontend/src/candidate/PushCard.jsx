import { useEffect, useState } from 'react';
import { BellOff, BellRing, Hourglass, MapPin, Share, SquarePlus, Trophy } from 'lucide-react';
import { Button, Modal, cx, useToast } from '../ui.jsx';
import { pushState, takeAskFlag, testPush, turnOffPush, turnOnPush } from '../push.js';

// "Get an alert when it's your turn": turns on push alerts for this phone.
// On the dashboard it is only shown while alerts are off; once on, it lives in the profile
// (`settings`), as a row to send a test alert or turn them off.
export default function PushCard({ settings = false }) {
  const toast = useToast();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    pushState().then(setState);
  }, []);

  async function on() {
    setBusy(true);
    try {
      const next = await turnOnPush();
      setState(next);
      if (next === 'on') {
        toast('Alerts are on for this phone');
        testPush().catch(() => {});
      } else if (next === 'blocked') toast('Alerts are blocked for this site in your browser settings', 'error');
    } catch (err) {
      toast(err.message || 'Could not turn on alerts on this phone', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function off() {
    setBusy(true);
    try {
      setState(await turnOffPush());
      toast('Alerts turned off for this phone');
    } finally {
      setBusy(false);
    }
  }

  if (!state || state === 'unsupported') return null;
  if (state === 'on' && !settings) return null;
  const card = renderCard();
  return settings ? (
    <div>
      <h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-widest text-slate-400">Notifications</h2>
      {card}
    </div>
  ) : (
    card
  );

  function renderCard() {

  if (state === 'on') {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-emerald-50 px-4 py-2.5 text-emerald-900 ring-1 ring-inset ring-emerald-200">
        <p className="flex items-center gap-2 text-sm font-bold">
          <BellRing className="size-4 shrink-0" aria-hidden="true" /> Alerts are on: we will tell you when to get ready and when it is your turn.
        </p>
        <span className="flex gap-1">
          <button type="button" onClick={() => testPush().then(() => toast('Test alert sent'))} className="min-h-9 cursor-pointer rounded-full px-3 text-xs font-bold hover:bg-emerald-100">
            Send a test
          </button>
          <button type="button" onClick={off} disabled={busy} className="min-h-9 cursor-pointer rounded-full px-3 text-xs font-bold text-emerald-800/80 hover:bg-emerald-100">
            Turn off
          </button>
        </span>
      </div>
    );
  }

  return (
    <section className={cx('flex flex-col gap-4 rounded-3xl bg-white p-4 shadow-xs ring-1 ring-blue-200 sm:flex-row sm:items-center sm:p-5', !settings && 'mb-4')}>
      <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white shadow-sm shadow-blue-600/30">
        <BellRing className="size-6" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-extrabold text-slate-900">Get an alert when it is your turn</p>
        {state === 'ios-install' ? (
          <p className="mt-0.5 text-sm text-slate-600">
            On iPhone: tap <Share className="inline size-4 align-text-bottom" aria-label="Share" /> Share, then <SquarePlus className="inline size-4 align-text-bottom" aria-label="" />{' '}
            <span className="font-bold">Add to Home Screen</span>. Open Blue Chip from your Home Screen and turn on alerts there.
          </p>
        ) : state === 'blocked' ? (
          <p className="mt-0.5 text-sm text-slate-600">
            Alerts are blocked for this website. Tap the lock icon next to the address, allow <span className="font-bold">Notifications</span>, then reload this page.
          </p>
        ) : (
          <p className="mt-0.5 text-sm text-slate-600">Your phone buzzes when to get ready, when to wait at the desk, when the company calls your token, and when your result is updated. No need to keep this page open.</p>
        )}
      </div>
      {state === 'off' && (
        <Button size="lg" onClick={on} loading={busy} className="w-full sm:w-auto">
          <BellRing className="size-5" aria-hidden="true" /> Turn on alerts
        </Button>
      )}
      {state === 'blocked' && <BellOff className="hidden size-6 shrink-0 text-slate-400 sm:block" aria-hidden="true" />}
    </section>
  );
  }
}

// Asked once right after logging in or registering: a sheet that explains the alerts and turns
// them on with one tap. Not shown when alerts are already on or the browser cannot show them.
export function PushPrompt() {
  const toast = useToast();
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!takeAskFlag()) return;
    pushState().then((s) => (s === 'off' || s === 'ios-install' ? setState(s) : null));
  }, []);

  async function allow() {
    setBusy(true);
    try {
      const next = await turnOnPush();
      if (next === 'on') {
        toast('Alerts are on. We will tell you when it is your turn.');
        testPush().catch(() => {});
      } else if (next === 'blocked') toast('Alerts were blocked. You can allow them later in your browser settings.', 'error');
    } catch (err) {
      toast(err.message || 'Could not turn on alerts on this phone', 'error');
    } finally {
      setBusy(false);
      setState(null);
    }
  }

  const steps = [
    [Hourglass, 'Get ready', 'when you are 3rd in line'],
    [MapPin, 'Wait at the desk', 'when you are next'],
    [BellRing, 'Your turn', 'the moment the company calls your token'],
    [Trophy, 'Your result', 'shortlisted, selected or other updates'],
  ];

  return (
    <Modal
      open={Boolean(state)}
      title="Allow notifications?"
      onClose={() => setState(null)}
      footer={
        state === 'off' ? (
          <>
            <Button variant="secondary" size="lg" onClick={() => setState(null)}>
              Not now
            </Button>
            <Button size="lg" onClick={allow} loading={busy}>
              <BellRing className="size-5" aria-hidden="true" /> Allow notifications
            </Button>
          </>
        ) : (
          <Button size="lg" onClick={() => setState(null)}>
            OK
          </Button>
        )
      }
    >
      <p className="text-[15px] text-slate-600">Know your application status without keeping this page open. Your phone buzzes for:</p>
      <ul className="mt-4 space-y-2.5">
        {steps.map(([Icon, title, text]) => (
          <li key={title} className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="text-[15px]">
              <span className="font-bold text-slate-900">{title}</span> <span className="text-slate-600">{text}</span>
            </span>
          </li>
        ))}
      </ul>
      {state === 'ios-install' && (
        <p className="mt-4 rounded-2xl bg-amber-50 p-3 text-sm text-amber-950 ring-1 ring-inset ring-amber-200">
          On iPhone, first tap <Share className="inline size-4 align-text-bottom" aria-label="Share" /> Share, then <span className="font-bold">Add to Home Screen</span>. Open Blue Chip from your Home Screen and allow notifications there.
        </p>
      )}
    </Modal>
  );
}
