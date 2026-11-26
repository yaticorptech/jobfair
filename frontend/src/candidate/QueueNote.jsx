import { BellRing, CircleCheck, Clock, Coffee, Hourglass, MapPin, Mic, TriangleAlert, UtensilsCrossed } from 'lucide-react';
import { cx } from '../ui.jsx';

// What is happening at a company's desk right now, for a candidate still waiting for a result:
// the token being interviewed, and whether that interview is going on or done. No guesses about
// who is next. app.queue comes from the server: { state: 'waiting' | 'called' | 'missed' }.
export default function QueueNote({ app, nowServing = 0, nowServingStarted = false, nowServingDone = false, onBreak = null, room, className }) {
  if (app?.status !== 'applied' || !app.queue) return null;
  const { state } = app.queue;
  const desk = room ? `desk ${room}` : 'the interview desk';

  // The desk itself: "Token 2 · Called to the desk", then "Interview going on" once the company
  // presses Start interview, then "Interview done" once it gives the result.
  const live = nowServing && !nowServingDone && nowServingStarted && !onBreak;
  const deskLine = onBreak === 'lunch'
    ? 'Lunch break'
    : onBreak === 'break'
      ? 'Short break'
      : !nowServing ? 'Interviews have not started yet' : nowServingDone ? 'Interview done' : live ? 'Interview going on' : 'Called to the desk';
  const DeskIcon = onBreak === 'lunch' ? UtensilsCrossed : onBreak === 'break' ? Coffee : !nowServing ? Clock : nowServingDone ? CircleCheck : live ? Mic : BellRing;

  let note = null;
  if (onBreak && state !== 'called') {
    // While the desk is on a break, nobody is called in; that is the one thing to know.
    note = {
      tone: onBreak === 'lunch' ? 'bg-orange-50 text-orange-950 ring-orange-300' : 'bg-amber-50 text-amber-950 ring-amber-300',
      Icon: DeskIcon,
      title: onBreak === 'lunch' ? 'The company is on lunch break' : 'The company is on a short break',
      text: `Your token ${app.token_no} is safe. Interviews at ${desk} continue after the break; this page updates by itself.`,
    };
  } else if (state === 'called') {
    note = { tone: 'bg-emerald-50 text-emerald-900 ring-emerald-300', Icon: BellRing, title: 'It’s your turn', text: `Go to ${desk} now and tell them your token number.` };
  } else if (state === 'waiting' && app.queue.ahead <= 1) {
    // The next two tokens wait at the desk, so the interviews run back to back.
    note = {
      tone: 'bg-blue-50 text-blue-950 ring-blue-300',
      Icon: MapPin,
      title: app.queue.ahead === 0 ? 'You are next · wait at the desk' : 'Wait at the desk',
      text: `Go to ${desk} now and wait there. You will be called with token ${app.token_no}.`,
    };
  } else if (state === 'waiting' && app.queue.ahead === 2) {
    note = {
      tone: 'bg-violet-50 text-violet-950 ring-violet-300',
      Icon: Hourglass,
      title: 'Get ready',
      text: `Two tokens before you. Head towards ${desk} so you are there in time.`,
    };
  } else if (state === 'waiting') {
    note = {
      tone: 'bg-slate-50 text-slate-800 ring-slate-200',
      Icon: Clock,
      title: `${app.queue.ahead} tokens ahead of you`,
      text: 'We will tell you here when to get ready.',
    };
  } else if (state === 'missed') {
    note = {
      tone: 'bg-amber-50 text-amber-950 ring-amber-300',
      Icon: TriangleAlert,
      title: 'Your token was passed',
      text: `If you have not had your interview yet, go to ${desk} now and show your token ${app.token_no}.`,
    };
  }

  const moved = app.rescheduled_from && state === 'waiting';

  return (
    <div className={cx('space-y-2', className)} role="status">
      {moved && (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm font-bold text-amber-950 ring-1 ring-inset ring-amber-300">
          You were not at the desk for token {app.rescheduled_from}, so the company rescheduled you. Your new token is {app.token_no}.
        </p>
      )}
      <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200">
        <div className="grid min-w-16 shrink-0 place-items-center rounded-xl bg-white px-2 py-1.5 text-center ring-1 ring-inset ring-slate-900/5">
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">Token</span>
          <span className="text-2xl font-extrabold leading-none tabular-nums text-slate-900">{nowServing || '–'}</span>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">At {desk} now</p>
          <p className={cx('flex items-center gap-1.5 font-extrabold', live ? 'text-blue-700' : 'text-slate-800')}>
            <DeskIcon className="size-4 shrink-0" aria-hidden="true" /> {deskLine}
          </p>
        </div>
      </div>
      {note && (
        <div className={cx('flex items-start gap-2.5 rounded-2xl p-3 ring-1 ring-inset', note.tone)}>
          <note.Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-extrabold">{note.title}</p>
            <p className="text-sm font-semibold">{note.text}</p>
          </div>
        </div>
      )}
    </div>
  );
}
