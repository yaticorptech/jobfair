import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ClipboardList, Coffee, Mic, UtensilsCrossed } from 'lucide-react';
import { fmtTime } from '../lib.jsx';
import { Button, Card, cx } from '../ui.jsx';
import QueueBoard from '../company/QueueBoard.jsx';

// The organisers watch one company's queue live, as the company sees it: who is at the desk, who
// waits, who was missed, and how far the interviews have got. Refreshes every 3 seconds.
const EVERY = 3000;

function Tile({ label, value, tone = 'text-slate-900' }) {
  return (
    <Card className="p-4">
      <p className={cx('text-3xl font-extrabold leading-none tabular-nums', tone)}>{value}</p>
      <p className="mt-1.5 text-xs font-bold text-slate-500">{label}</p>
    </Card>
  );
}

export default function CompanyQueue() {
  const { id } = useParams();
  const [board, setBoard] = useState(null);
  const [at, setAt] = useState(null); // when the board was last updated
  const [, tick] = useState(0);

  // "Updated 2 s ago" keeps counting between refreshes.
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  const tokens = board?.tokens ?? [];
  const count = (state) => tokens.filter((t) => t.state === state).length;
  const waiting = count('waiting') + count('ready') + count('desk');
  const done = count('done');
  const selected = tokens.filter((t) => t.result === 'selected').length;
  const atDesk = tokens.find((t) => t.token_no === board?.now_serving);
  const ago = at ? Math.max(0, Math.round((Date.now() - at) / 1000)) : null;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <Link to="/admin/companies" className="mb-1 inline-flex min-h-9 items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-900">
            <ArrowLeft className="size-4" aria-hidden="true" /> Companies
          </Link>
          <h1 className="flex flex-wrap items-center gap-3 text-[28px] font-extrabold leading-tight tracking-tight text-slate-900">
            {board?.name || 'Company'}
            {board?.room_no && <span className="rounded-xl bg-amber-100 px-3 py-0.5 text-lg font-extrabold text-amber-950 ring-1 ring-inset ring-amber-200">Desk {board.room_no}</span>}
          </h1>
          <p className="text-slate-500">
            Live queue{board?.location ? ` · ${board.location}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cx(
              'inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-bold ring-1 ring-inset',
              board?.on_break === 'lunch' ? 'bg-orange-50 text-orange-800 ring-orange-200' : board?.on_break ? 'bg-amber-50 text-amber-800 ring-amber-200' : 'bg-emerald-50 text-emerald-800 ring-emerald-200',
            )}
          >
            {board?.on_break === 'lunch' ? <UtensilsCrossed className="size-4" aria-hidden="true" /> : board?.on_break ? <Coffee className="size-4" aria-hidden="true" /> : <Mic className="size-4" aria-hidden="true" />}
            {board?.on_break === 'lunch' ? 'Lunch break' : board?.on_break ? 'Short break' : 'Interviewing'}
            {board?.break_since ? ` · since ${fmtTime(board.break_since).split(', ').pop()}` : ''}
          </span>
          <span className="inline-flex min-h-10 items-center gap-2 rounded-full bg-white px-4 text-sm font-bold text-slate-600 ring-1 ring-inset ring-slate-200">
            <span className="relative flex size-2.5" aria-hidden="true">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:hidden" />
              <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
            </span>
            Live{ago != null ? ` · updated ${ago < 2 ? 'just now' : `${ago} s ago`}` : ''}
          </span>
          <Button as={Link} to={`/admin/applications?company=${id}`} variant="secondary">
            <ClipboardList className="size-4" aria-hidden="true" /> Applications
          </Button>
        </div>
      </div>

      {board && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          <Tile label="At the desk" value={atDesk ? `#${atDesk.token_no}` : '–'} tone="text-emerald-700" />
          <Tile label="Waiting" value={waiting} tone="text-blue-700" />
          <Tile label="Missed" value={count('missed')} tone="text-amber-700" />
          <Tile label="Interviews done" value={done} tone="text-violet-700" />
          <Tile label="Selected" value={selected} tone="text-emerald-700" />
        </div>
      )}

      <QueueBoard
        path={`/admin/companies/${id}/board`}
        every={EVERY}
        onData={(b) => {
          setBoard(b);
          setAt(Date.now());
        }}
      />
    </>
  );
}
