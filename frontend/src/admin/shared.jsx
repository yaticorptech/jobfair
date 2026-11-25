import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { cx } from '../ui.jsx';

export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// The address put inside the desk QR codes and the company login message:
// the one saved in Settings, or else the address the organiser is using right now.
export const siteAddress = (info) => (info.site_url || window.location.origin).replace(/\/+$/, '');

// Addresses that only work on this computer or this Wi-Fi network: fine for trying things out,
// useless on a printed poster or in a message sent to a company.
export function isLocalAddress(address) {
  try {
    const host = new URL(address).hostname;
    return host === 'localhost' || host === '[::1]' || host.endsWith('.local') || /^(127|10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(host);
  } catch {
    return true;
  }
}

export function PageTitle({ title, sub, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-slate-900">{title}</h1>
        {sub && <p className="text-slate-500">{sub}</p>}
      </div>
      {/* On a phone the buttons share the full width, so each is easy to tap. */}
      {children && <div className="flex w-full flex-wrap gap-2 *:flex-1 sm:w-auto sm:*:flex-none">{children}</div>}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder, className }) {
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="block min-h-12 w-full rounded-2xl border border-slate-200 bg-white py-2.5 pl-11 pr-4 text-base outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
      />
    </div>
  );
}

// An ordinary table when there is room for it. Whenever its columns do not fit the space it has
// (a phone, a tablet, a small laptop with the side menu open), every row becomes a small card
// instead: the "primary" cell is the heading and each other cell shows its label.
// See .stack-table in index.css for how the cards look.
export function Table({ head, children, empty }) {
  const wrap = useRef(null);
  const needed = useRef(0); // how wide the table has to be when it is laid out as a table
  const [stacked, setStacked] = useState(false);

  const fit = useRef(null);
  fit.current = () => {
    const box = wrap.current;
    const table = box.firstElementChild;
    // The width a table needs can only be measured while it is a table.
    if (!table.classList.contains('is-stacked')) needed.current = table.scrollWidth;
    setStacked(needed.current > box.clientWidth + 1);
  };

  // Measured again after every change of the rows, before the screen is painted.
  useLayoutEffect(() => {
    fit.current();
  });

  // ... and whenever the space changes (the phone is turned, the window is resized).
  useEffect(() => {
    const observer = new ResizeObserver(() => fit.current());
    observer.observe(wrap.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={wrap} className="table-wrap overflow-x-auto rounded-3xl bg-white shadow-xs ring-1 ring-slate-900/5">
      <table className={cx('stack-table min-w-full text-left text-sm', stacked && 'is-stacked')}>
        <thead className="border-b border-slate-100 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
          <tr>
            {head.map((h) => (
              <th key={h.label ?? h} scope="col" className={cx('whitespace-nowrap px-4 py-3', h.className)}>
                {h.label ?? h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
      {empty && <p className="px-4 py-10 text-center text-sm text-slate-500">{empty}</p>}
    </div>
  );
}

// label: the column name shown beside the value on phones. primary: the card's heading.
// actions: a row of buttons. phoneHide: detail that is left out on phones to keep cards short.
export const Td = ({ className, label, primary = false, actions = false, phoneHide = false, children, ...props }) => (
  <td
    {...props}
    data-label={label}
    data-primary={primary ? '' : undefined}
    data-actions={actions ? '' : undefined}
    data-phone-hide={phoneHide ? '' : undefined}
    className={cx('px-4 py-3 align-middle', className)}
  >
    <div>{children}</div>
  </td>
);
