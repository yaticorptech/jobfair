import { useCallback, useEffect, useRef, useState } from 'react';
import { Megaphone, X } from 'lucide-react';
import { api, fmtTime } from './lib.jsx';
import { Button, Modal } from './ui.jsx';

// Announcements from the organisers on a dashboard: a banner for each one not yet closed on this
// device (the newest three). With `popup`, a new one also opens as a dialog the moment it arrives,
// and as a browser notification when the tab is in the background (allowed by the user).
const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
};
const write = (key, ids) => {
  try {
    localStorage.setItem(key, JSON.stringify(ids.slice(-50)));
  } catch {
    /* private mode */
  }
};

// One banner. It closes by itself after a few seconds; a thin bar shows the time left, and the
// countdown waits while the pointer is over it (so it can be read to the end).
const LIFE = 12000;
function Banner({ a, onClose }) {
  const [left, setLeft] = useState(LIFE);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return undefined;
    const step = 100;
    const timer = setInterval(() => setLeft((ms) => ms - step), step);
    return () => clearInterval(timer);
  }, [paused]);
  useEffect(() => {
    if (left <= 0) onClose(a.id);
  }, [left, a.id, onClose]);

  return (
    <li
      className="relative flex items-start gap-3 overflow-hidden rounded-2xl bg-blue-50 p-3.5 text-blue-950 ring-1 ring-inset ring-blue-200"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-blue-600 text-white">
        <Megaphone className="size-4.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-extrabold">{a.title}</p>
        {a.body && <p className="mt-0.5 whitespace-pre-line text-sm text-blue-950/80">{a.body}</p>}
        <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-blue-700/70">From the organisers · {fmtTime(a.created_at)}</p>
      </div>
      <button type="button" onClick={() => onClose(a.id)} aria-label={`Close ${a.title}`} className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-blue-800 hover:bg-blue-100">
        <X className="size-4.5" />
      </button>
      <span className="absolute inset-x-0 bottom-0 h-0.5 bg-blue-100" aria-hidden="true">
        <span className="block h-full bg-blue-500/60 transition-[width] duration-100 ease-linear" style={{ width: `${Math.max(0, (left / LIFE) * 100)}%` }} />
      </span>
    </li>
  );
}

export default function AnnouncementFeed({ path, storageKey, popup = false, className, every = 30000 }) {
  const [rows, setRows] = useState([]);
  const [closed, setClosed] = useState(() => read(`${storageKey}_closed`));
  const [open, setOpen] = useState(null);
  const popped = useRef(read(`${storageKey}_popped`));

  const load = useCallback(
    () =>
      api(path)
        .then((list) => {
          setRows(list);
          if (!popup) return;
          const fresh = list.find((a) => !popped.current.includes(a.id));
          if (!fresh) return;
          popped.current = [...popped.current, ...list.map((a) => a.id)];
          write(`${storageKey}_popped`, popped.current);
          setOpen(fresh);
          if ('Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
            try {
              new Notification(fresh.title, { body: fresh.body, icon: '/icon-192.png', tag: `news-${fresh.id}` });
            } catch {
              /* only possible through a service worker in some browsers */
            }
          }
        })
        .catch(() => {}),
    [path, popup, storageKey],
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
  }, [load, every]);

  const close = useCallback(
    (id) =>
      setClosed((old) => {
        if (old.includes(id)) return old;
        const next = [...old, id];
        write(`${storageKey}_closed`, next);
        return next;
      }),
    [storageKey],
  );

  const shown = rows.filter((a) => !closed.includes(a.id)).slice(0, 3);

  return (
    <>
      {shown.length > 0 && (
        <div className={className}>
          <ul className="space-y-2">
            {shown.map((a) => (
              <Banner key={a.id} a={a} onClose={close} />
            ))}
          </ul>
        </div>
      )}
      <Modal
        open={Boolean(open)}
        title={open?.title ?? ''}
        onClose={() => setOpen(null)}
        footer={
          <Button size="lg" onClick={() => setOpen(null)}>
            OK, got it
          </Button>
        }
      >
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-blue-100 text-blue-700">
            <Megaphone className="size-5" aria-hidden="true" />
          </span>
          <div>
            {open?.body && <p className="whitespace-pre-line text-[15px] text-slate-700">{open.body}</p>}
            <p className="mt-1 text-xs font-bold uppercase tracking-wide text-slate-400">Announcement from the organisers</p>
          </div>
        </div>
      </Modal>
    </>
  );
}
