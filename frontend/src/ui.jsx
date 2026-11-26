import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, CircleAlert, CircleCheck, Copy, LoaderCircle, X } from 'lucide-react';
import { DEVELOPER, STATUS, initials } from './lib.jsx';

// The look of the whole site lives here: big touch targets, short labels, one clear
// main button per screen. Pages are built from these pieces so they stay consistent.

export const cx = (...parts) => parts.filter(Boolean).join(' ');

// ───────── buttons ─────────

const BTN_BASE =
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-2xl font-bold transition select-none ' +
  'active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ' +
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100';
const BTN_VARIANTS = {
  primary: 'bg-blue-600 text-white shadow-sm shadow-blue-600/30 hover:bg-blue-700',
  accent: 'bg-amber-400 text-slate-900 shadow-sm shadow-amber-500/30 hover:bg-amber-300',
  tricolor: 'bg-[#138808] text-white shadow-sm shadow-green-800/30 hover:bg-[#0F6E06]',
  secondary: 'bg-white text-slate-800 ring-1 ring-inset ring-slate-200 hover:bg-slate-50',
  soft: 'bg-blue-50 text-blue-700 hover:bg-blue-100',
  ghost: 'text-slate-600 hover:bg-slate-100',
  danger: 'bg-rose-50 text-rose-700 hover:bg-rose-100',
};
// Even the small size is 40px tall, so it is easy to tap on a phone.
const BTN_SIZES = {
  sm: 'min-h-10 px-3.5 text-sm',
  md: 'min-h-12 px-5 text-[15px]',
  lg: 'min-h-14 px-6 text-base',
};

export function Button({ as: Tag = 'button', variant = 'primary', size = 'md', loading = false, disabled, className, children, ...props }) {
  const native = Tag === 'button' ? { type: props.type || 'button', disabled: disabled || loading } : {};
  return (
    <Tag {...props} {...native} className={cx(BTN_BASE, BTN_VARIANTS[variant], BTN_SIZES[size], className)}>
      {loading && <LoaderCircle className="size-5 animate-spin" aria-hidden="true" />}
      {children}
    </Tag>
  );
}

// ───────── form controls ─────────

export function Field({ label, required, error, hint, className, as: Tag = 'label', children }) {
  return (
    <Tag className={cx('block min-w-0', className)}>
      <span className="mb-1.5 block text-sm font-bold text-slate-700">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
      {error ? (
        <span data-error className="mt-1.5 block text-sm font-semibold text-rose-600">
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1.5 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </Tag>
  );
}

// 16px text stops iPhones from zooming in when a field is tapped; 52px height is easy to tap.
const controlCls = (error) =>
  cx(
    'block min-h-13 w-full min-w-0 max-w-full rounded-2xl border bg-white px-4 py-3 text-base text-slate-900 outline-none transition',
    'placeholder:text-slate-400 focus:ring-4 disabled:bg-slate-100',
    error ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100' : 'border-slate-200 focus:border-blue-600 focus:ring-blue-100',
  );

export function Input({ error, className, ...props }) {
  return <input {...props} className={cx(controlCls(error), className)} />;
}

export function Select({ error, className, children, ...props }) {
  return (
    <select {...props} className={cx(controlCls(error), 'appearance-auto pr-2', className)}>
      {children}
    </select>
  );
}

export function Textarea({ error, className, rows = 3, ...props }) {
  return <textarea rows={rows} {...props} className={cx(controlCls(error), 'resize-y', className)} />;
}

export function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-7 w-12 rounded-full bg-slate-300 transition peer-checked:bg-blue-600 peer-focus-visible:ring-4 peer-focus-visible:ring-blue-200" />
        <span className="absolute left-0.5 top-0.5 size-6 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
      <span>
        <span className="block text-[15px] font-bold text-slate-800">{label}</span>
        {hint && <span className="block text-sm text-slate-500">{hint}</span>}
      </span>
    </label>
  );
}

// A row of big buttons where one is chosen (gender, fresher / experienced).
export function Choice({ name, value, current, onPick, children }) {
  const active = current === value;
  return (
    <label
      className={cx(
        'flex min-h-13 flex-1 cursor-pointer items-center justify-center rounded-2xl border px-3 text-[15px] font-bold transition',
        active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
      )}
    >
      <input type="radio" name={name} value={value} checked={active} onChange={() => onPick(value)} className="sr-only" />
      {children}
    </label>
  );
}

// ───────── layout pieces ─────────

export function Card({ className, children, ...props }) {
  return (
    <div {...props} className={cx('rounded-3xl bg-white shadow-xs ring-1 ring-slate-900/5', className)}>
      {children}
    </div>
  );
}

// The name of the website. The job fair itself has its own name (Admin > Settings).
export const SITE_NAME = 'Blue Chip Connect';

// eslint-disable-next-line no-unused-vars
export function Brand({ name, light = false, to = '/' }) {
  return (
    <Link to={to} aria-label={`${SITE_NAME} home`} className="flex min-h-11 min-w-0 shrink items-center">
      <img
        src="/logo.png"
        alt={SITE_NAME}
        width="1127"
        height="96"
        className={cx('h-3.5 w-auto max-w-full min-[400px]:h-4 sm:h-[18px]', light ? 'brightness-0 invert' : 'mix-blend-multiply')}
      />
    </Link>
  );
}

// The bar at the top of a screen: a back arrow, the screen name, and at most one thing on the right.
// "back" is the page to go back to, or a function (for example: the previous step of a form).
export function TopBar({ title, back, right }) {
  const backCls = 'grid size-11 shrink-0 cursor-pointer place-items-center rounded-full text-slate-700 hover:bg-slate-100';
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/95 backdrop-blur print:hidden">
      <div className="mx-auto flex h-14 max-w-2xl items-center gap-1 px-2">
        {typeof back === 'function' ? (
          <button type="button" onClick={back} aria-label="Back" className={backCls}>
            <ArrowLeft className="size-6" />
          </button>
        ) : back ? (
          <Link to={back} aria-label="Back" className={backCls}>
            <ArrowLeft className="size-6" />
          </Link>
        ) : null}
        <p className={cx('min-w-0 flex-1 truncate text-[17px] font-extrabold tracking-tight text-slate-900', !back && 'pl-2')}>{title}</p>
        {right && <div className="shrink-0 pr-2">{right}</div>}
      </div>
    </header>
  );
}

// The main button of a screen, always within reach of the thumb at the bottom of the phone.
// Give the page enough bottom padding (pb-28) so nothing hides behind it.
export function StickyBar({ children, className = 'items-center gap-3' }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/70 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur print:hidden">
      <div className={cx('mx-auto flex max-w-2xl', className)}>{children}</div>
    </div>
  );
}

// "Developed by Yaticorp": the line at the foot of every screen. (The printed posters carry their own.)
export function Credit({ className }) {
  const name = DEVELOPER.url ? (
    <a href={DEVELOPER.url} target="_blank" rel="noopener noreferrer" className="font-bold text-slate-500 underline-offset-4 hover:underline">
      {DEVELOPER.name}
    </a>
  ) : (
    <span className="font-bold text-slate-500">{DEVELOPER.name}</span>
  );
  // The Blue Chip Connect logo, with "Product of Yaticorp" under it.
  return (
    <div className={cx('flex flex-col items-center gap-1.5 text-center print:hidden', className)}>
      <img src="/logo.png" alt={SITE_NAME} width="1127" height="96" className="h-3.5 w-auto opacity-80 mix-blend-multiply" />
      <p className="text-xs text-slate-400">Product of {name}</p>
    </div>
  );
}

export function Spinner({ className }) {
  return <LoaderCircle className={cx('size-6 animate-spin text-blue-600', className)} aria-label="Loading" />;
}

export function PageLoader() {
  return (
    <div className="grid min-h-[50dvh] place-items-center">
      <Spinner className="size-9" />
    </div>
  );
}

export function ErrorNote({ message, onRetry }) {
  return (
    <div className="mx-auto my-10 max-w-md rounded-3xl bg-rose-50 p-6 text-center">
      <CircleAlert className="mx-auto size-8 text-rose-600" aria-hidden="true" />
      <p className="mt-2 font-semibold text-rose-800">{message}</p>
      {onRetry && (
        <Button variant="secondary" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Empty({ icon: Icon, title, text, children }) {
  return (
    <div className="rounded-3xl bg-white px-6 py-12 text-center shadow-xs ring-1 ring-slate-900/5">
      {Icon && (
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-blue-50 text-blue-600">
          <Icon className="size-8" aria-hidden="true" />
        </span>
      )}
      <p className="mt-4 text-lg font-extrabold text-slate-900">{title}</p>
      {text && <p className="mx-auto mt-1 max-w-sm text-slate-500">{text}</p>}
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}

// A short message in a coloured box (announcements, warnings).
export function Notice({ icon: Icon, tone = 'amber', children, className }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-950 ring-amber-200',
    blue: 'bg-blue-50 text-slate-900 ring-blue-200',
    rose: 'bg-rose-50 text-rose-900 ring-rose-200',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  };
  return (
    <div className={cx('flex items-start gap-3 rounded-2xl px-4 py-3.5 text-[15px] font-semibold ring-1 ring-inset', tones[tone], className)}>
      {Icon && <Icon className="mt-0.5 size-5 shrink-0 opacity-80" aria-hidden="true" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function StatusBadge({ status, className }) {
  const s = STATUS[status] || { label: status, cls: 'bg-slate-100 text-slate-600 ring-slate-200' };
  return (
    <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold ring-1 ring-inset', s.cls, className)}>
      {s.label}
    </span>
  );
}

// Interview desk and token are the two things a candidate must be able to read at a glance.
export function RoomBadge({ room, className, big = false, empty = 'To be announced' }) {
  return (
    <div className={cx('shrink-0 rounded-2xl bg-amber-100 text-center text-amber-950', big ? 'px-5 py-3' : 'px-3.5 py-2', className)}>
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-amber-700">Desk</p>
      <p className={cx('max-w-28 break-words font-extrabold leading-none', room ? (big ? 'text-4xl' : 'text-2xl') : 'max-w-20 py-1 text-xs leading-tight')}>
        {room || empty}
      </p>
    </div>
  );
}

export function TokenBadge({ token, label = 'Token', className, big = false }) {
  return (
    <div className={cx('shrink-0 rounded-2xl bg-blue-600 text-center text-white', big ? 'px-5 py-3' : 'px-3.5 py-2', className)}>
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-blue-100">{label}</p>
      <p className={cx('font-extrabold leading-none', big ? 'text-4xl' : 'text-2xl')}>{token}</p>
    </div>
  );
}

const AVATAR_TONES = [
  'bg-blue-100 text-blue-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-700',
  'bg-violet-100 text-violet-700',
  'bg-cyan-100 text-cyan-700',
];

export function Avatar({ name, round = false, className }) {
  let hash = 0;
  for (const ch of String(name)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <span
      aria-hidden="true"
      className={cx(
        'grid size-12 shrink-0 place-items-center text-sm font-extrabold',
        round ? 'rounded-full' : 'rounded-2xl',
        AVATAR_TONES[hash % AVATAR_TONES.length],
        className,
      )}
    >
      {initials(name) || '?'}
    </span>
  );
}

// ───────── modal (a sheet that slides up from the bottom on phones) ─────────

export function Modal({ open, onClose, title, children, footer, wide = false }) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current?.();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-slate-900/60" onClick={onClose} />
      <div className={cx('pop-in relative flex max-h-[92dvh] w-full flex-col rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]', wide ? 'sm:max-w-2xl' : 'sm:max-w-md')}>
        <span className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-slate-200 sm:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between gap-4 px-5 pb-3 pt-3 sm:pt-5">
          <h2 className="text-xl font-extrabold tracking-tight text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-5">{children}</div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 *:w-full sm:flex-row sm:justify-end sm:*:w-auto">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────── toasts ─────────

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const nextId = useRef(1);

  const toast = useCallback((message, type = 'success') => {
    const id = nextId.current++;
    setItems((list) => [...list.slice(-2), { id, message, type }]);
    setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), type === 'error' ? 5000 : 3200);
  }, []);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4 print:hidden" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              'pop-in pointer-events-auto flex max-w-md items-start gap-2.5 rounded-2xl px-4 py-3.5 text-[15px] font-semibold text-white shadow-lg',
              t.type === 'error' ? 'bg-rose-600' : 'bg-slate-900',
            )}
          >
            {t.type === 'error' ? <CircleAlert className="mt-0.5 size-5 shrink-0" /> : <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-400" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// ───────── pages of a long list ─────────

// Previous / numbered pages / next. Pages are counted from 1. With many pages, the numbers
// around the current one are shown, with the first and the last.
export function Pager({ page, pages, onChange, label, className }) {
  if (pages <= 1) return null;
  const numbers = [];
  for (let n = 1; n <= pages; n += 1) {
    if (n === 1 || n === pages || Math.abs(n - page) <= 1) numbers.push(n);
    else if (numbers.at(-1) !== '…') numbers.push('…');
  }
  const btn = 'grid min-h-11 min-w-11 cursor-pointer place-items-center rounded-full px-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-40';
  return (
    <nav aria-label="Pages" className={cx('flex flex-col items-center gap-2 print:hidden', className)}>
      <div className="flex items-center gap-1 rounded-full bg-white p-1 shadow-xs ring-1 ring-slate-900/5">
        <button type="button" onClick={() => onChange(page - 1)} disabled={page === 1} aria-label="Previous page" className={cx(btn, 'text-slate-700 hover:bg-slate-100')}>
          <ChevronLeft className="size-5" aria-hidden="true" />
        </button>
        {numbers.map((n, i) =>
          n === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-sm font-bold text-slate-400" aria-hidden="true">…</span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-label={`Page ${n}`}
              aria-current={n === page ? 'page' : undefined}
              className={cx(btn, 'tabular-nums', n === page ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100')}
            >
              {n}
            </button>
          ),
        )}
        <button type="button" onClick={() => onChange(page + 1)} disabled={page === pages} aria-label="Next page" className={cx(btn, 'text-slate-700 hover:bg-slate-100')}>
          <ChevronRight className="size-5" aria-hidden="true" />
        </button>
      </div>
      {label && <p className="text-sm font-semibold text-slate-500">{label}</p>}
    </nav>
  );
}

// Which page of a list is shown. Goes back to page 1 when `resetKey` changes (a new search or
// filter), and never points past the last page when the list gets shorter.
export function usePaging(count, size, resetKey = '', { scroll = true, initial = 1 } = {}) {
  const [page, setPageState] = useState(initial);
  const [key, setKey] = useState(resetKey);
  if (key !== resetKey) {
    setKey(resetKey);
    setPageState(1);
  }
  const pages = Math.max(1, Math.ceil(count / size));
  const current = Math.min(page, pages);
  const setPage = (n) => {
    setPageState(Math.min(Math.max(1, n), pages));
    if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  return { page: current, pages, setPage, start: (current - 1) * size, end: Math.min(count, current * size) };
}

// "Desks 13–24 of 40"
export const rangeLabel = (start, end, total, noun) =>
  total ? `${noun} ${(start + 1).toLocaleString('en-IN')}–${end.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')}` : '';

// How many items go on one page: fewer on a phone, where every item takes the full width.
export function usePageSize(phone, wide) {
  const query = '(max-width: 639px)';
  const [small, setSmall] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const update = () => setSmall(list.matches);
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, []);
  return small ? phone : wide;
}

// A company's access code in a dark box. Tapping the box copies the code (as typed at login, without
// the dash) and says so for a moment.
export function AccessCode({ code, shown }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  async function copy() {
    const text = String(code ?? '');
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Older browsers or a page without clipboard access: copy through a hidden text box.
      const box = document.createElement('textarea');
      box.value = text;
      box.setAttribute('readonly', '');
      box.style.position = 'fixed';
      box.style.opacity = '0';
      document.body.appendChild(box);
      box.select();
      document.execCommand('copy');
      box.remove();
    }
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Access code ${shown}. Tap to copy`}
      className="group mt-4 block w-full cursor-pointer rounded-2xl border border-dashed border-blue-300 bg-blue-50/60 px-4 py-4 text-center transition hover:border-blue-400 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-200 active:scale-[0.99]"
    >
      <span className="block text-[11px] font-extrabold uppercase tracking-widest text-blue-700">Access code</span>
      <span className="mt-1 block font-mono text-3xl font-bold tracking-[0.15em] text-slate-900">{shown}</span>
      <span
        className={cx(
          'mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold transition',
          copied ? 'bg-emerald-100 text-emerald-800' : 'bg-white text-blue-700 ring-1 ring-inset ring-blue-200 group-hover:bg-blue-600 group-hover:text-white group-hover:ring-blue-600',
        )}
        aria-live="polite"
      >
        {copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
        {copied ? 'Copied' : 'Tap to copy'}
      </span>
    </button>
  );
}
