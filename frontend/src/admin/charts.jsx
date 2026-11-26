import { useState } from 'react';
import { Card, cx } from '../ui.jsx';

// Small chart pieces for the admin overview, in plain HTML. Every chart shows one measure in one
// hue (blue = how many), so colour never has to be decoded; names and numbers are always written out.

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export function ChartCard({ title, sub, action, className, children }) {
  return (
    <Card className={cx('flex min-w-0 flex-col p-5', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-extrabold text-slate-900">{title}</h3>
          {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
        </div>
        {action}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </Card>
  );
}

const Empty = ({ text = 'No data yet' }) => <p className="grid h-full min-h-24 place-items-center text-sm text-slate-400">{text}</p>;

/** Horizontal bars: a label, a bar and the number, one row per item. */
export function BarList({ items, total, empty }) {
  const shown = items.filter((x) => x.value > 0);
  if (!shown.length) return <Empty text={empty} />;
  const max = Math.max(...shown.map((x) => x.value));
  const whole = total ?? shown.reduce((a, x) => a + x.value, 0);
  return (
    <ul className="space-y-2.5">
      {shown.map((x) => (
        <li key={x.label} className="group" title={`${x.label}: ${fmt(x.value)} (${pct(x.value, whole)}%)`}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className={cx('truncate', x.other ? 'text-slate-500' : 'font-semibold text-slate-700')}>{x.label}</span>
            <span className="shrink-0 tabular-nums">
              <span className="font-bold text-slate-900">{fmt(x.value)}</span>
              <span className="ml-1.5 text-xs text-slate-400 opacity-0 transition group-hover:opacity-100">{pct(x.value, whole)}%</span>
            </span>
          </div>
          <div className="h-2 rounded-full bg-slate-100">
            <div
              className={cx('h-2 rounded-full transition-[width] duration-500', x.other ? 'bg-slate-300' : x.tone || 'bg-blue-600 group-hover:bg-blue-700')}
              style={{ width: `${Math.max(2, (x.value / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One share of a whole: "4 of 5 have applied", with a bar. */
export function Meter({ label, value, total, note, tone = 'bg-blue-600' }) {
  const p = pct(value, total);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="shrink-0 text-sm tabular-nums">
          <span className="font-extrabold text-slate-900">{p}%</span>
          <span className="ml-1.5 text-xs text-slate-500">
            {fmt(value)} of {fmt(total)}
          </span>
        </p>
      </div>
      <div className="mt-1.5 h-2.5 rounded-full bg-slate-100" role="meter" aria-valuemin={0} aria-valuemax={total} aria-valuenow={value} aria-label={label}>
        <div className={cx('h-2.5 rounded-full transition-[width] duration-500', tone)} style={{ width: `${total ? Math.max(value ? 2 : 0, p) : 0}%` }} />
      </div>
      {note && <p className="mt-1 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

/** Columns over time, with a tooltip on hover or tap. */
export function Columns({ points, empty }) {
  const [hover, setHover] = useState(null);
  if (!points.length || points.every((p) => !p.value)) return <Empty text={empty} />;
  const max = Math.max(...points.map((p) => p.value));
  const ticks = [max, Math.round(max / 2), 0].filter((v, i, a) => a.indexOf(v) === i);
  const every = Math.ceil(points.length / 8); // keep the axis labels from crowding
  const active = hover != null ? points[hover] : null;
  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <div className="flex h-44 gap-2">
        <div className="flex flex-col justify-between pb-5 text-right text-[11px] tabular-nums text-slate-400" aria-hidden="true">
          {ticks.map((t) => (
            <span key={t}>{fmt(t)}</span>
          ))}
        </div>
        <div className="relative flex-1">
          <div className="absolute inset-x-0 top-0 bottom-5 flex flex-col justify-between" aria-hidden="true">
            {ticks.map((t) => (
              <div key={t} className="border-t border-dashed border-slate-200" />
            ))}
          </div>
          <ul className="absolute inset-x-0 top-0 bottom-0 flex items-end gap-[2px]" aria-label="Chart">
            {points.map((p, i) => (
              <li
                key={p.key}
                className="flex h-full min-w-0 flex-1 cursor-default flex-col items-center justify-end"
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover(i)}
                aria-label={`${p.long || p.label}: ${fmt(p.value)}`}
              >
                <div className="flex w-full flex-1 items-end justify-center pb-0">
                  <div
                    className={cx('w-full max-w-7 rounded-t transition-colors', hover === i ? 'bg-blue-700' : 'bg-blue-600', !p.value && 'bg-transparent')}
                    style={{ height: `${(p.value / max) * 100}%`, minHeight: p.value ? 3 : 0 }}
                  />
                </div>
                <span className="mt-1 h-4 w-full truncate text-center text-[10px] text-slate-400">{i % every === 0 || i === points.length - 1 ? p.label : ''}</span>
              </li>
            ))}
          </ul>
          {active && (
            <div
              className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg"
              style={{ left: `${((hover + 0.5) / points.length) * 100}%` }}
              role="status"
            >
              <span className="text-slate-300">{active.long || active.label}</span> <span className="font-bold">{fmt(active.value)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Tabs for switching what a chart shows. */
export function Segmented({ value, options, onChange }) {
  return (
    <div className="flex shrink-0 rounded-xl bg-slate-100 p-0.5" role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'min-h-8 cursor-pointer rounded-[10px] px-2.5 text-xs font-bold transition focus-visible:outline-2 focus-visible:outline-blue-600',
            value === o.value ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-700',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Vertical bars for a few categories: the number on top, the name underneath. */
export function VBars({ items, total, empty, keepEmpty = true }) {
  const [hover, setHover] = useState(null);
  const shown = keepEmpty ? items : items.filter((x) => x.value > 0);
  if (!shown.length || shown.every((x) => !x.value)) return <Empty text={empty} />;
  const max = Math.max(...shown.map((x) => x.value));
  const whole = total ?? shown.reduce((a, x) => a + x.value, 0);
  return (
    <div onMouseLeave={() => setHover(null)}>
      <div className="flex h-44 items-end gap-2 border-b border-slate-200">
        {shown.map((x, i) => (
          <div
            key={x.label}
            className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
            onMouseEnter={() => setHover(i)}
            title={`${x.label}: ${fmt(x.value)} (${pct(x.value, whole)}%)`}
          >
            <span className="mb-1 text-xs font-bold tabular-nums text-slate-900">{hover === i ? `${pct(x.value, whole)}%` : fmt(x.value)}</span>
            <div
              className={cx('w-full max-w-12 rounded-t-md transition-[height,background-color] duration-500', x.tone || (hover === i ? 'bg-blue-700' : 'bg-blue-600'))}
              style={{ height: `calc((100% - 1.25rem) * ${x.value / max})`, minHeight: x.value ? 4 : 1 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        {shown.map((x) => (
          <span key={x.label} className="line-clamp-2 min-w-0 flex-1 text-center text-[11px] leading-tight text-slate-500">
            {x.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// Two-series charts. Blue and saffron, checked with the colour-blind validator (ΔE 31.7 protan,
// 39.4 normal vision); both always come with a legend and the numbers in the tooltip.
export const SERIES = [
  { key: 'a', color: '#2563eb', dot: 'bg-[#2563eb]' },
  { key: 'b', color: '#e8650a', dot: 'bg-[#e8650a]' },
];

export function Legend({ names }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">
      {names.map((name, i) => (
        <li key={name} className="flex items-center gap-1.5">
          <span className={cx('size-2.5 rounded-sm', SERIES[i].dot)} aria-hidden="true" />
          {name}
        </li>
      ))}
    </ul>
  );
}

function Tip({ left, title, rows }) {
  return (
    <div
      className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg"
      style={{ left: `clamp(3.5rem, ${left}%, calc(100% - 3.5rem))` }}
      role="status"
    >
      <p className="text-slate-300">{title}</p>
      {rows.map(([name, value], i) => (
        <p key={name} className="flex items-center gap-1.5">
          <span className={cx('size-2 rounded-sm', SERIES[i].dot)} aria-hidden="true" />
          {name} <span className="ml-auto pl-3 font-bold tabular-nums">{fmt(value)}</span>
        </p>
      ))}
    </div>
  );
}

function YAxis({ max }) {
  const ticks = [max, Math.round(max / 2), 0].filter((v, i, a) => a.indexOf(v) === i);
  return {
    labels: (
      <div className="flex flex-col justify-between pb-5 text-right text-[11px] tabular-nums text-slate-400" aria-hidden="true">
        {ticks.map((t) => (
          <span key={t}>{fmt(t)}</span>
        ))}
      </div>
    ),
    grid: (
      <div className="absolute inset-x-0 top-0 bottom-5 flex flex-col justify-between" aria-hidden="true">
        {ticks.map((t) => (
          <div key={t} className="border-t border-dashed border-slate-200" />
        ))}
      </div>
    ),
  };
}

/** Clustered columns: two bars side by side for each day or hour. points: [{ key, label, long, a, b }] */
export function ClusteredColumns({ points, names, empty }) {
  const [hover, setHover] = useState(null);
  if (!points.length || points.every((p) => !p.a && !p.b)) return <Empty text={empty} />;
  const max = Math.max(1, ...points.flatMap((p) => [p.a, p.b]));
  const axis = YAxis({ max });
  const every = Math.ceil(points.length / 8);
  const active = hover != null ? points[hover] : null;
  return (
    <div>
      <Legend names={names} />
      <div className="relative mt-3 flex h-48 gap-2" onMouseLeave={() => setHover(null)}>
        {axis.labels}
        <div className="relative flex-1">
          {axis.grid}
          <ul className="absolute inset-0 flex items-end gap-1.5">
            {points.map((p, i) => (
              <li
                key={p.key}
                className={cx('flex h-full min-w-0 flex-1 flex-col justify-end rounded-md transition-colors', hover === i && 'bg-slate-100/70')}
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover(i)}
                aria-label={`${p.long || p.label}: ${names[0]} ${fmt(p.a)}, ${names[1]} ${fmt(p.b)}`}
              >
                <div className="flex flex-1 items-end justify-center gap-[2px] px-[2px]">
                  {[p.a, p.b].map((v, s) => (
                    <div
                      key={s}
                      className="w-full max-w-4 rounded-t-[4px] transition-[height] duration-500"
                      style={{ height: `${(v / max) * 100}%`, minHeight: v ? 3 : 0, background: SERIES[s].color }}
                    />
                  ))}
                </div>
                <span className="mt-1 h-4 truncate text-center text-[10px] text-slate-400">{i % every === 0 || i === points.length - 1 ? p.label : ''}</span>
              </li>
            ))}
          </ul>
          {active && (
            <Tip
              left={((hover + 0.5) / points.length) * 100}
              title={active.long || active.label}
              rows={[
                [names[0], active.a],
                [names[1], active.b],
              ]}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Line chart with up to two lines, a crosshair and a tooltip. points: [{ key, label, long, a, b }] */
export function LineChart({ points, names, empty, area = false }) {
  const [hover, setHover] = useState(null);
  if (!points.length || points.every((p) => !p.a && !p.b)) return <Empty text={empty} />;
  const max = Math.max(1, ...points.flatMap((p) => [p.a, p.b ?? 0]));
  const axis = YAxis({ max });
  const n = points.length;
  const x = (i) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v) => 100 - (v / max) * 100;
  const keys = names.length > 1 ? ['a', 'b'] : ['a'];
  const every = Math.ceil(n / 8);
  const active = hover != null ? points[hover] : null;

  function pick(e) {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  return (
    <div>
      <Legend names={names} />
      <div className="relative mt-3 flex h-48 gap-2">
        {axis.labels}
        <div className="relative flex-1">
          {axis.grid}
          <div className="absolute inset-x-1 top-0 bottom-5" onMouseMove={pick} onClick={pick} onMouseLeave={() => setHover(null)}>
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
              {area &&
                keys.map((k, s) => (
                  <polygon
                    key={`${k}-area`}
                    points={`${x(0)},100 ${points.map((p, i) => `${x(i)},${y(p[k] ?? 0)}`).join(' ')} ${x(n - 1)},100`}
                    fill={SERIES[s].color}
                    fillOpacity={keys.length > 1 ? 0.12 : 0.18}
                  />
                ))}
              {keys.map((k, s) => (
                <polyline
                  key={k}
                  points={points.map((p, i) => `${x(i)},${y(p[k] ?? 0)}`).join(' ')}
                  fill="none"
                  stroke={SERIES[s].color}
                  strokeWidth="2"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              {active && <line x1={x(hover)} x2={x(hover)} y1="0" y2="100" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
            </svg>
            {/* Markers in HTML so they stay round however the chart is stretched. */}
            {active &&
              keys.map((k, s) => (
                <span
                  key={k}
                  className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white"
                  style={{ left: `${x(hover)}%`, top: `${y(active[k] ?? 0)}%`, background: SERIES[s].color }}
                />
              ))}
            {active && (
              <Tip
                left={x(hover)}
                title={active.long || active.label}
                rows={keys.map((k, s) => [names[s], active[k] ?? 0])}
              />
            )}
          </div>
          <div className="absolute inset-x-1 bottom-0 h-4" aria-hidden="true">
            {points.map((p, i) =>
              i % every === 0 || i === n - 1 ? (
                <span key={p.key} className="absolute -translate-x-1/2 text-[10px] whitespace-nowrap text-slate-400" style={{ left: `${x(i)}%` }}>
                  {p.label}
                </span>
              ) : null,
            )}
          </div>
        </div>
      </div>
      <ul className="sr-only">
        {points.map((p) => (
          <li key={p.key}>
            {p.long || p.label}: {keys.map((k, s) => `${names[s]} ${p[k] ?? 0}`).join(', ')}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Pie slices take the reference categorical colours in this fixed order (validated: worst
// adjacent CVD ΔE 11.8, normal vision 20.5). Several sit under 3:1 on white, so every pie
// carries a legend with the name, number and share written out. More than 6 slices fold into Other.
const PIE = ['#257de0', '#f47230', '#00b894', '#f2a600', '#ee7fac', '#008a17'];
const OTHER = '#cbd5e1';

/** Doughnut chart with the total in the middle and a legend beside it. */
export function Donut({ items, empty, center = 'Total' }) {
  const [hover, setHover] = useState(null);
  let list = items.filter((x) => x.value > 0);
  if (!list.length) return <Empty text={empty} />;
  const named = list.filter((x) => !x.other);
  const folded = list.filter((x) => x.other).reduce((a, x) => a + x.value, 0) + named.slice(6).reduce((a, x) => a + x.value, 0);
  list = [...named.slice(0, 6).map((x, i) => ({ ...x, color: PIE[i] })), ...(folded ? [{ label: 'Other', value: folded, color: OTHER, other: true }] : [])];
  const total = list.reduce((a, x) => a + x.value, 0);
  const R = 15.9155; // circumference 100, so lengths are percentages
  const gap = list.length > 1 ? 0.8 : 0;
  let at = 0;
  const active = hover != null ? list[hover] : null;
  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center" onMouseLeave={() => setHover(null)}>
      <div className="relative size-36 shrink-0">
        <svg viewBox="0 0 42 42" className="size-full -rotate-90" aria-hidden="true">
          <circle cx="21" cy="21" r={R} fill="none" stroke="#f1f5f9" strokeWidth="6" />
          {list.map((x, i) => {
            const len = (x.value / total) * 100;
            const seg = (
              <circle
                key={x.label}
                cx="21"
                cy="21"
                r={R}
                fill="none"
                stroke={x.color}
                strokeWidth={hover === i ? 7.5 : 6}
                strokeDasharray={`${Math.max(0, len - gap)} ${100 - Math.max(0, len - gap)}`}
                strokeDashoffset={-at}
                className="cursor-pointer transition-[stroke-width] duration-200"
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover(i)}
              />
            );
            at += len;
            return seg;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="text-xl font-extrabold tabular-nums leading-none text-slate-900">{fmt(active ? active.value : total)}</p>
            <p className="mt-1 max-w-20 truncate text-[11px] font-semibold text-slate-500">{active ? `${pct(active.value, total)}%` : center}</p>
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5">
        {list.map((x, i) => (
          <li
            key={x.label}
            className={cx('flex cursor-default items-center gap-2 rounded-lg px-1.5 py-0.5 text-sm transition-colors', hover === i && 'bg-slate-100')}
            onMouseEnter={() => setHover(i)}
          >
            <span className="size-2.5 shrink-0 rounded-sm" style={{ background: x.color }} aria-hidden="true" />
            <span className={cx('min-w-0 flex-1 truncate', x.other ? 'text-slate-500' : 'font-semibold text-slate-700')} title={x.label}>
              {x.label}
            </span>
            <span className="shrink-0 font-bold tabular-nums text-slate-900">{fmt(x.value)}</span>
            <span className="w-9 shrink-0 text-right text-xs tabular-nums text-slate-400">{pct(x.value, total)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** A ring showing one share of a whole: "80%, 4 of 5". */
export function Ring({ label, value, total, color = '#2563eb' }) {
  const p = pct(value, total);
  return (
    <div className="flex min-w-0 flex-col items-center text-center" role="meter" aria-valuemin={0} aria-valuemax={total} aria-valuenow={value} aria-label={label}>
      <div className="relative size-20">
        <svg viewBox="0 0 42 42" className="size-full -rotate-90" aria-hidden="true">
          <circle cx="21" cy="21" r="15.9155" fill="none" stroke="#f1f5f9" strokeWidth="5" />
          <circle
            cx="21"
            cy="21"
            r="15.9155"
            fill="none"
            stroke={color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={`${total ? Math.max(value ? 1 : 0, p) : 0} 100`}
            className="transition-[stroke-dasharray] duration-500"
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-base font-extrabold tabular-nums text-slate-900">{p}%</span>
      </div>
      <p className="mt-2 text-xs font-bold leading-tight text-slate-700">{label}</p>
      <p className="text-[11px] tabular-nums text-slate-500">
        {fmt(value)} of {fmt(total)}
      </p>
    </div>
  );
}

/** Combo: columns for the first measure and a line for the second, on one shared scale. */
export function Combo({ points, names, empty }) {
  const [hover, setHover] = useState(null);
  if (!points.length || points.every((p) => !p.a && !p.b)) return <Empty text={empty} />;
  const max = Math.max(1, ...points.flatMap((p) => [p.a, p.b]));
  const axis = YAxis({ max });
  const n = points.length;
  const every = Math.ceil(n / 8);
  const cx_ = (i) => ((i + 0.5) / n) * 100;
  const y = (v) => 100 - (v / max) * 100;
  const active = hover != null ? points[hover] : null;
  return (
    <div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: SERIES[0].color }} aria-hidden="true" />
          {names[0]} (columns)
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-0.5 w-3.5 rounded-full" style={{ background: SERIES[1].color }} aria-hidden="true" />
          {names[1]} (line)
        </li>
      </ul>
      <div className="relative mt-3 flex h-48 gap-2" onMouseLeave={() => setHover(null)}>
        {axis.labels}
        <div className="relative flex-1">
          {axis.grid}
          <ul className="absolute inset-0 flex items-end gap-[3px]">
            {points.map((p, i) => (
              <li
                key={p.key}
                className="flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                onMouseEnter={() => setHover(i)}
                onClick={() => setHover(i)}
                aria-label={`${p.long || p.label}: ${names[0]} ${fmt(p.a)}, ${names[1]} ${fmt(p.b)}`}
              >
                <div className="flex w-full flex-1 items-end justify-center">
                  <div
                    className="w-full max-w-7 rounded-t-[4px] transition-[height,opacity] duration-500"
                    style={{ height: `${(p.a / max) * 100}%`, minHeight: p.a ? 3 : 0, background: SERIES[0].color, opacity: hover == null || hover === i ? 1 : 0.55 }}
                  />
                </div>
                <span className="mt-1 h-4 w-full truncate text-center text-[10px] text-slate-400">{i % every === 0 || i === n - 1 ? p.label : ''}</span>
              </li>
            ))}
          </ul>
          <div className="pointer-events-none absolute inset-x-0 top-0 bottom-5">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden="true">
              <polyline
                points={points.map((p, i) => `${cx_(i)},${y(p.b)}`).join(' ')}
                fill="none"
                stroke={SERIES[1].color}
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {points.map((p, i) => (
              <span
                key={p.key}
                className={cx('absolute -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white transition-all', hover === i ? 'size-2.5' : 'size-1.5')}
                style={{ left: `${cx_(i)}%`, top: `${y(p.b)}%`, background: SERIES[1].color }}
              />
            ))}
          </div>
          {active && (
            <Tip
              left={cx_(hover)}
              title={active.long || active.label}
              rows={[
                [names[0], active.a],
                [names[1], active.b],
              ]}
            />
          )}
        </div>
      </div>
    </div>
  );
}
