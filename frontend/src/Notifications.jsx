import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellRing, CircleCheck, Coffee, Hourglass, MapPin, Megaphone, Play, RotateCcw, Trophy } from 'lucide-react';
import { api, fmtTime } from './lib.jsx';
import { ErrorNote, PageLoader, cx } from './ui.jsx';

// Notification history, shared by candidates (/me/notifications) and companies
// (/recruiter/notifications): a bell with the number of new ones, and the page that lists them.

const KINDS = {
  turn: { Icon: BellRing, tone: 'bg-emerald-100 text-emerald-700' },
  desk: { Icon: MapPin, tone: 'bg-blue-100 text-blue-700' },
  ready: { Icon: Hourglass, tone: 'bg-violet-100 text-violet-700' },
  moved: { Icon: RotateCcw, tone: 'bg-fuchsia-100 text-fuchsia-700' },
  status: { Icon: Trophy, tone: 'bg-amber-100 text-amber-700' },
  announcement: { Icon: Megaphone, tone: 'bg-blue-600 text-white' },
  break: { Icon: Coffee, tone: 'bg-orange-100 text-orange-700' },
  resume: { Icon: Play, tone: 'bg-emerald-100 text-emerald-700' },
  info: { Icon: Bell, tone: 'bg-slate-100 text-slate-600' },
};

// The number of new notifications, checked every 30 seconds.
export function useUnread(path, every = 30000) {
  const [unread, setUnread] = useState(0);
  const load = useCallback(() => api(`${path}?count=1`).then((d) => setUnread(d.unread)).catch(() => {}), [path]);
  useEffect(() => {
    load();
    const timer = setInterval(() => document.visibilityState === 'visible' && load(), every);
    window.addEventListener('jobfair:notifications-seen', load);
    return () => {
      clearInterval(timer);
      window.removeEventListener('jobfair:notifications-seen', load);
    };
  }, [load, every]);
  return unread;
}

export function NotificationBell({ to, path, className, every }) {
  const unread = useUnread(path, every);
  return (
    <Link to={to} aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'} className={cx('relative grid size-10 shrink-0 place-items-center rounded-full text-slate-600 hover:bg-slate-100', className)}>
      <Bell className="size-5" aria-hidden="true" />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[11px] font-extrabold text-white ring-2 ring-white">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
    </Link>
  );
}

const dayOf = (s) => (s ? fmtTime(s).split(',')[0] : '');

export default function NotificationList({ path, seenPath, empty = 'Alerts about your tokens, results and announcements from the organisers appear here.' }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(
    () =>
      api(path)
        .then((d) => {
          setData(d);
          setError('');
          // Opening the list marks everything as seen (the new ones stay highlighted on this visit).
          if (d.unread) api(seenPath, { method: 'POST' }).then(() => window.dispatchEvent(new Event('jobfair:notifications-seen'))).catch(() => {});
        })
        .catch((err) => setError(err.message)),
    [path, seenPath],
  );
  useEffect(() => {
    load();
  }, [load]);

  if (!data) return error ? <ErrorNote message={error} onRetry={load} /> : <PageLoader />;

  // Grouped by day, newest first.
  const groups = [];
  for (const n of data.rows) {
    const day = dayOf(n.created_at);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(n);
    else groups.push({ day, items: [n] });
  }
  const today = dayOf(new Date().toISOString().replace('T', ' ').slice(0, 19));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight text-slate-900">Notifications</h1>
          <p className="text-slate-500">{data.unread ? `${data.unread} new` : 'You are all caught up'}</p>
        </div>
      </div>

      {data.rows.length === 0 ? (
        <div className="grid place-items-center gap-3 rounded-3xl bg-white p-10 text-center ring-1 ring-slate-900/5">
          <span className="grid size-14 place-items-center rounded-2xl bg-slate-100 text-slate-400">
            <Bell className="size-7" aria-hidden="true" />
          </span>
          <p className="font-extrabold text-slate-900">No notifications yet</p>
          <p className="max-w-sm text-sm text-slate-500">{empty}</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <section key={g.day}>
              <h2 className="mb-2 px-1 text-xs font-extrabold uppercase tracking-widest text-slate-400">{g.day === today ? 'Today' : g.day}</h2>
              <ul className="overflow-hidden rounded-3xl bg-white shadow-xs ring-1 ring-slate-900/5">
                {g.items.map((n, i) => {
                  const k = KINDS[n.kind] || KINDS.info;
                  const fresh = n.created_at > (data.seen_at || '');
                  const body = (
                    <>
                      <span className={cx('grid size-10 shrink-0 place-items-center rounded-xl', k.tone)}>
                        <k.Icon className="size-5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-start justify-between gap-3">
                          <span className="font-extrabold text-slate-900">{n.title}</span>
                          <span className="shrink-0 pt-0.5 text-xs text-slate-400">{fmtTime(n.created_at).split(', ').pop()}</span>
                        </span>
                        {n.body && <span className="mt-0.5 block whitespace-pre-line text-sm text-slate-600">{n.body}</span>}
                        {n.kind === 'announcement' && <span className="mt-1 block text-[11px] font-bold uppercase tracking-wide text-blue-700/70">From the organisers</span>}
                      </span>
                      {fresh && <span className="mt-1.5 size-2.5 shrink-0 rounded-full bg-blue-600" aria-label="New" />}
                    </>
                  );
                  const cls = cx('flex items-start gap-3 p-4', i > 0 && 'border-t border-slate-100', fresh && 'bg-blue-50/50');
                  return (
                    <li key={n.id}>
                      {n.url && n.url !== '/dashboard' ? (
                        <Link to={n.url} className={cx(cls, 'transition hover:bg-slate-50')}>
                          {body}
                        </Link>
                      ) : (
                        <div className={cls}>{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <CircleCheck className="size-3.5" aria-hidden="true" /> That is everything
          </p>
        </div>
      )}
    </div>
  );
}
