import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, BellRing, CircleCheck, Coffee, Hourglass, MapPin, Mic, RotateCcw, Users, UtensilsCrossed } from 'lucide-react';
import { STATUS, api } from '../lib.jsx';
import { cx } from '../ui.jsx';

// The desk's queue drawn as a flow, left to right: in line → get ready → wait at the desk →
// at the desk → done. Missed tokens have their own lane underneath, with their buttons.
// `version` changes whenever the dashboard changes the queue, so the board follows at once.

const STAGE = {
  waiting: { label: 'In line', hint: 'Waiting for their turn', Icon: Users, tone: 'slate' },
  ready: { label: 'Get ready', hint: 'Heading to your desk', Icon: Hourglass, tone: 'violet' },
  desk: { label: 'Wait at desk', hint: 'Seated, next to be called', Icon: MapPin, tone: 'blue' },
  now: { label: 'At the desk', hint: 'Being interviewed', Icon: Mic, tone: 'emerald' },
  done: { label: 'Done', hint: 'Interview finished', Icon: CircleCheck, tone: 'slate' },
};
const TONE = {
  slate: { head: 'text-slate-600', icon: 'bg-slate-100 text-slate-600', chip: 'bg-white ring-slate-200', num: 'bg-slate-100 text-slate-700' },
  violet: { head: 'text-violet-700', icon: 'bg-violet-100 text-violet-700', chip: 'bg-violet-50/60 ring-violet-200', num: 'bg-violet-600 text-white' },
  blue: { head: 'text-blue-700', icon: 'bg-blue-100 text-blue-700', chip: 'bg-blue-50/60 ring-blue-200', num: 'bg-blue-600 text-white' },
  emerald: { head: 'text-emerald-700', icon: 'bg-emerald-100 text-emerald-700', chip: 'bg-emerald-50 ring-emerald-300', num: 'bg-emerald-600 text-white' },
};

const RESULT_TONE = {
  interviewed: 'bg-violet-50 text-violet-700',
  shortlisted: 'bg-amber-50 text-amber-800',
  selected: 'bg-emerald-50 text-emerald-700',
  rejected: 'bg-rose-50 text-rose-700',
};

function Stage({ kind, count, children, className }) {
  const s = STAGE[kind];
  const t = TONE[s.tone];
  return (
    <div className={cx('flex min-w-0 flex-col rounded-2xl bg-slate-50/70 p-3 ring-1 ring-inset ring-slate-200/70', className)}>
      <div className="mb-2.5 flex items-center gap-2">
        <span className={cx('grid size-7 shrink-0 place-items-center rounded-lg', t.icon)}>
          <s.Icon className="size-4" aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className={cx('block text-sm font-extrabold leading-tight', t.head)}>
            {s.label} <span className="tabular-nums text-slate-400">· {count}</span>
          </span>
          <span className="block truncate text-[11px] text-slate-500">{s.hint}</span>
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}

function Chip({ t, tone, eta, big = false }) {
  const c = TONE[tone];
  return (
    <div className={cx('flex items-center gap-2.5 rounded-xl p-2 ring-1 ring-inset', c.chip, big && 'p-3')}>
      <span className={cx('grid shrink-0 place-items-center rounded-lg font-extrabold tabular-nums', c.num, big ? 'size-12 text-xl' : 'size-9 text-sm')}>{t.token_no}</span>
      <span className="min-w-0 flex-1">
        <span className={cx('block truncate font-bold text-slate-900', big ? 'text-base' : 'text-sm')}>{t.name || `Token ${t.token_no}`}</span>
        <span className="flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
          {eta != null && <span>~{eta} min</span>}
          {t.rescheduled_from && (
            <span className="inline-flex items-center gap-0.5 text-fuchsia-700">
              <RotateCcw className="size-3" aria-hidden="true" /> was {t.rescheduled_from}
            </span>
          )}
        </span>
      </span>
    </div>
  );
}

function Empty({ children }) {
  return <div className="grid min-h-14 flex-1 place-items-center rounded-xl border border-dashed border-slate-300 px-2 text-center text-xs font-semibold text-slate-400">{children}</div>;
}

// The arrow between two stages: across on a laptop, down on a phone.
function Flow() {
  return (
    <div className="flex items-center justify-center text-slate-300" aria-hidden="true">
      <ArrowRight className="hidden size-5 xl:block" />
      <ArrowDown className="size-5 xl:hidden" />
    </div>
  );
}

// `path`: where the board comes from (the company's own, or the organisers' view of a company).
// `every`: how often it refreshes, in ms. Without onCall the missed lane has no buttons (read only).
// `onData`: told each new board, for a page that shows more around it.
export default function QueueBoard({ version, busy, onCall, onReschedule, path = '/recruiter/queue/board', every = 15000, onData }) {
  const [board, setBoard] = useState(null);

  const load = useCallback(
    () =>
      api(path)
        .then((b) => {
          setBoard(b);
          onData?.(b);
        })
        .catch(() => {}),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path],
  );
  useEffect(() => {
    load();
    const timer = setInterval(() => document.visibilityState === 'visible' && load(), every);
    const onShow = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onShow);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [load, version, every]);

  if (!board) return null;
  const by = (state) => board.tokens.filter((t) => t.state === state);
  const waiting = by('waiting');
  const ready = by('ready');
  const desk = by('desk');
  const missed = by('missed');
  const done = board.tokens.filter((t) => t.state === 'done').sort((a, b) => b.token_no - a.token_no);
  const atDesk = board.tokens.find((t) => t.token_no === board.now_serving);
  const avg = board.avg_minutes ? Math.max(1, board.avg_minutes) : null;
  // A rough wait: the interviews ahead of this token, at the desk's average length.
  const eta = (t) => (avg && t.place ? Math.round(t.place * avg) : null);
  const shownWaiting = waiting.slice(0, 6);

  return (
    <section aria-label="Queue board" className="rounded-3xl bg-white p-4 shadow-xs ring-1 ring-slate-900/5 sm:p-5">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900">Queue board</h2>
          <p className="text-sm text-slate-500">How candidates move through your desk, live. Tokens flow from left to right.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-bold">
          {board.on_break && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-orange-50 px-3 py-1 text-orange-800 ring-1 ring-inset ring-orange-200">
              {board.on_break === 'lunch' ? <UtensilsCrossed className="size-3.5" aria-hidden="true" /> : <Coffee className="size-3.5" aria-hidden="true" />}
              {board.on_break === 'lunch' ? 'Lunch break' : 'Short break'}: queue paused
            </span>
          )}
          <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">{avg ? `~${Math.round(avg)} min per interview` : 'Wait times appear after the first interviews'}</span>
        </div>
      </div>

      <div className="grid gap-2 xl:grid-cols-[minmax(0,1.25fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1.2fr)_auto_minmax(0,1fr)]">
        <Stage kind="waiting" count={waiting.length}>
          {shownWaiting.length ? shownWaiting.map((t) => <Chip key={t.id} t={t} tone="slate" eta={eta(t)} />) : <Empty>No one else in line</Empty>}
          {waiting.length > shownWaiting.length && <p className="text-center text-xs font-bold text-slate-500">+{waiting.length - shownWaiting.length} more in line</p>}
        </Stage>
        <Flow />
        <Stage kind="ready" count={ready.length}>
          {ready.length ? ready.map((t) => <Chip key={t.id} t={t} tone="violet" eta={eta(t)} />) : <Empty>Free</Empty>}
        </Stage>
        <Flow />
        <Stage kind="desk" count={desk.length}>
          {desk.length ? desk.map((t) => <Chip key={t.id} t={t} tone="blue" eta={eta(t)} />) : <Empty>Free</Empty>}
          {desk.length === 1 && <Empty>Free</Empty>}
        </Stage>
        <Flow />
        <Stage kind="now" count={atDesk ? 1 : 0} className="bg-emerald-50/40 ring-emerald-200">
          {atDesk ? (
            <>
              <Chip t={atDesk} tone="emerald" big />
              <p className="flex items-center gap-1.5 text-xs font-bold text-emerald-800">
                {atDesk.state === 'done' ? (
                  <>
                    <CircleCheck className="size-3.5" aria-hidden="true" /> Interview finished · call the next token
                  </>
                ) : board.now_live ? (
                  <>
                    <span className="relative flex size-2" aria-hidden="true">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:hidden" />
                      <span className="relative inline-flex size-2 rounded-full bg-emerald-600" />
                    </span>
                    Interview going on
                  </>
                ) : (
                  <>
                    <BellRing className="size-3.5" aria-hidden="true" /> Called in, on the way
                  </>
                )}
              </p>
            </>
          ) : (
            <Empty>No one called yet</Empty>
          )}
        </Stage>
        <Flow />
        <Stage kind="done" count={done.length}>
          {done.length ? (
            done.slice(0, 5).map((t) => (
              <div key={t.id} className="flex items-center gap-2 rounded-xl bg-white p-2 ring-1 ring-inset ring-slate-200">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-sm font-extrabold tabular-nums text-slate-500">{t.token_no}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-600">{t.name}</span>
                <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-extrabold', RESULT_TONE[t.result])}>{STATUS[t.result]?.label}</span>
              </div>
            ))
          ) : (
            <Empty>None yet</Empty>
          )}
          {done.length > 5 && <p className="text-center text-xs font-bold text-slate-500">+{done.length - 5} more</p>}
        </Stage>
      </div>

      {/* Missed: their turn went by without a result. Called in again, or moved to the end of the line. */}
      <div className="mt-3 rounded-2xl bg-amber-50/70 p-3 ring-1 ring-inset ring-amber-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-sm font-extrabold text-amber-900">
            <span className="grid size-7 place-items-center rounded-lg bg-amber-100 text-amber-700">
              <RotateCcw className="size-4" aria-hidden="true" />
            </span>
            Missed · {missed.length}
            <span className="font-semibold text-amber-800/80">
              {onCall ? 'Not at the desk when called. Call them in, or reschedule to the end of the line.' : 'Not at the desk when called. The company can call them in or reschedule them.'}
            </span>
          </p>
        </div>
        {missed.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {missed.map((m) => (
              <span key={m.id} className="inline-flex items-center rounded-xl bg-white ring-1 ring-inset ring-amber-300">
                <span className="flex items-center gap-2 py-1.5 pl-2 pr-3">
                  <span className="grid size-8 place-items-center rounded-lg bg-amber-100 text-sm font-extrabold tabular-nums text-amber-900">{m.token_no}</span>
                  <span className="max-w-36 truncate text-sm font-bold text-slate-800">{m.name}</span>
                </span>
                {onCall && (
                <>
                <button
                  type="button"
                  onClick={() => onCall(m)}
                  disabled={Boolean(busy)}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-1 border-l border-amber-200 px-3 text-sm font-bold text-amber-900 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <BellRing className="size-4" aria-hidden="true" /> Call in
                </button>
                <button
                  type="button"
                  onClick={() => onReschedule(m)}
                  disabled={Boolean(busy)}
                  className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-r-xl border-l border-amber-200 px-3 text-sm font-bold text-amber-900 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <RotateCcw className="size-4" aria-hidden="true" /> Reschedule
                </button>
                </>
                )}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-1 pl-9 text-xs font-semibold text-amber-800/70">No missed tokens.</p>
        )}
      </div>
    </section>
  );
}
