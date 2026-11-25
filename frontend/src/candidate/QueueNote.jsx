import { BellRing, CircleCheck, Clock, Mic, TriangleAlert } from 'lucide-react';
import { cx } from '../ui.jsx';

// What is happening at a company's desk right now, for a candidate still waiting for a result:
// the token being interviewed, and whether that interview is going on or done. No guesses about
// who is next. app.queue comes from the server: { state: 'waiting' | 'called' | 'missed' }.
export default function QueueNote({ app, nowServing = 0, nowServingStarted = false, nowServingDone = false, room, className }) {
  if (app?.status !== 'applied' || !app.queue) return null;
  const { state } = app.queue;
  const desk = room ? `desk ${room}` : 'the interview desk';

  // The desk itself: "Token 2 · Called to the desk", then "Interview going on" once the company
  // presses Start interview, then "Interview done" once it gives the result.
  const live = nowServing && !nowServingDone && nowServingStarted;
  const deskLine = !nowServing ? 'Interviews have not started yet' : nowServingDone ? 'Interview done' : live ? 'Interview going on' : 'Called to the desk';
  const DeskIcon = !nowServing ? Clock : nowServingDone ? CircleCheck : live ? Mic : BellRing;

  let note = null;
  if (state === 'called') {
    note = { tone: 'bg-emerald-50 text-emerald-900 ring-emerald-300', Icon: BellRing, title: 'It’s your turn', text: `Go to ${desk} now and tell them your token number.` };
  } else if (state === 'missed') {
    note = {
      tone: 'bg-amber-50 text-amber-950 ring-amber-300',
      Icon: TriangleAlert,
      title: 'Your token was passed',
      text: `If you have not had your interview yet, go to ${desk} now and show your token ${app.token_no}.`,
    };
  }

  return (
    <div className={cx('space-y-2', className)} role="status">
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
