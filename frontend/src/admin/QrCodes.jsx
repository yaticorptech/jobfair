import { useCallback, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { Copy, ExternalLink, Grid2x2Plus, Printer, QrCode, RefreshCw, TriangleAlert, X } from 'lucide-react';
import { api, useInfo } from '../lib.jsx';
import { Button, Card, ErrorNote, PageLoader, Pager, cx, rangeLabel, usePageSize, usePaging, useToast } from '../ui.jsx';
import { Poster, byDesk } from '../qr.jsx';
import { PageTitle, SearchBox, isLocalAddress, siteAddress } from './shared.jsx';
import DesksModal, { nextDeskNumber } from './DesksModal.jsx';

// The two kinds of QR code that are printed.
const KINDS = {
  desk: { step: 1, label: 'Desk QR codes', who: 'One at every desk' },
  company: { step: 2, label: 'Company QR code', who: 'Companies register' },
};

const FILTERS = [
  ['', 'All desks'],
  ['waiting', 'No company yet'],
  ['done', 'With a company'],
];

const selectCls =
  'min-h-12 min-w-0 flex-1 cursor-pointer rounded-2xl border border-slate-200 bg-white px-3.5 text-base font-bold text-slate-800 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100';

// Under each desk poster on the screen (not printed): which company is at that desk, and how it
// got there. "Activated" is only said when the company scanned the poster itself.
function DeskState({ desk }) {
  const chip = 'inline-block max-w-full truncate rounded-full px-2.5 py-1 text-xs font-bold';
  if (!desk.company) return <span className={cx(chip, 'bg-amber-50 text-amber-800')}>Not activated yet</span>;
  if (desk.typed) return <span className={cx(chip, 'bg-slate-100 text-slate-600')}>Desk typed in by organisers · {desk.company}</span>;
  return <span className={cx(chip, 'bg-emerald-50 text-emerald-800')}>Activated · {desk.company}</span>;
}

// The local-address warning shared by both kinds: a QR code is only as good as the address inside it.
function AddressNote({ site }) {
  const local = isLocalAddress(site);
  return (
    <div className={cx('mb-4 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm', local ? 'border-amber-300 bg-amber-50 text-amber-950' : 'border-slate-200 bg-white text-slate-600')}>
      {local && <TriangleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />}
      <p>
        These QR codes open <span className="break-all font-bold">{site}</span>.{' '}
        {local ? (
          <>
            <span className="font-bold">Do not print them for the event yet:</span> this address only works on this computer or this Wi-Fi network. Once the site is live, enter its address in{' '}
            <Link to="/admin/settings" className="font-bold underline underline-offset-4">
              Settings › Website address
            </Link>{' '}
            and print again.
          </>
        ) : (
          <>
            Scan one with a phone before printing them all. To change the address, go to{' '}
            <Link to="/admin/settings" className="font-bold text-blue-700 underline underline-offset-4">
              Settings › Website address
            </Link>
            .
          </>
        )}
      </p>
    </div>
  );
}

// The one QR code through which every company registers itself, with the link to send to
// companies before the fair. Printing gives one large poster, or four copies on a page.
function CompanyQr({ site, fairName, perPage }) {
  const toast = useToast();
  const [code, setCode] = useState(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      api('/admin/company-link')
        .then((data) => {
          setCode(data.code);
          setError('');
        })
        .catch((err) => setError(err.message)),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  if (!code) return error ? <ErrorNote message={error} onRetry={load} /> : <PageLoader />;

  const url = `${site}/r/${code}`;
  const message = [`${fairName}: company registration`, `Register your company and add your job openings here: ${url}`, 'At the fair, scan the QR code at your interview desk from your dashboard to activate it.'].join('\n');
  const poster = <Poster kind="company" url={url} fairName={fairName} />;

  async function copy(text, done) {
    try {
      await navigator.clipboard.writeText(text);
      toast(done);
    } catch {
      toast('Could not copy automatically. Select the text and copy it.', 'error');
    }
  }

  async function renew() {
    setBusy(true);
    try {
      const data = await api('/admin/company-link/renew', { method: 'POST' });
      setCode(data.code);
      setConfirming(false);
      toast('New company registration link made. Print the QR code again.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:items-start print:hidden">
        <div>
          {poster}
          <div className="mt-2 flex gap-2">
            <Button className="flex-1" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden="true" /> Print {perPage === 4 ? '(4 copies)' : ''}
            </Button>
            <Button as="a" href={`/r/${code}`} target="_blank" rel="noopener noreferrer" variant="secondary" className="flex-1" title="Open the page a company sees after scanning">
              <ExternalLink className="size-4" aria-hidden="true" /> Open
            </Button>
          </div>
        </div>

        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-extrabold text-slate-900">Send it to companies before the fair</h2>
          <p className="mt-0.5 text-[15px] text-slate-600">Companies that register in advance only have to scan the QR code at their desk on the day.</p>
          <textarea
            readOnly
            value={message}
            rows={5}
            onFocus={(e) => e.target.select()}
            className="mt-3 block w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-700 outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
          />
          <div className="mt-2 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => copy(message, 'Copied. Paste it in WhatsApp, SMS or email.')}>
              <Copy className="size-4" aria-hidden="true" /> Copy message
            </Button>
            <Button variant="secondary" size="sm" onClick={() => copy(url, 'Link copied')}>
              <Copy className="size-4" aria-hidden="true" /> Copy link only
            </Button>
          </div>

          <div className="mt-5 border-t border-slate-100 pt-4">
            {confirming ? (
              <div className="rounded-xl bg-rose-50 px-4 py-3">
                <p className="text-sm font-semibold text-rose-800">The link above and every printed copy of this QR code stop working at once. Companies that have already registered are not affected.</p>
                <div className="mt-3 flex gap-2">
                  <Button variant="danger" size="sm" onClick={renew} loading={busy}>
                    Make a new link
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-left text-sm font-semibold text-slate-500 hover:text-slate-800">
                <RefreshCw className="size-4" aria-hidden="true" /> Link reached the wrong people? Make a new one
              </button>
            )}
          </div>
        </Card>
      </div>

      {/* Only these are printed. */}
      <div className={cx('hidden print:block', perPage === 4 ? 'per-4' : 'per-1 solo')}>
        {Array.from({ length: perPage === 4 ? 4 : 1 }, (_, i) => (
          <div key={i} className="poster-slot">
            {poster}
          </div>
        ))}
      </div>
    </>
  );
}

export default function QrCodes() {
  const { info } = useInfo();
  const [params, setParams] = useSearchParams();
  const companyId = Number(params.get('company')) || 0;
  const kind = params.get('kind') === 'company' ? 'company' : 'desk';
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [state, setState] = useState(''); // '' | 'waiting' | 'done'
  const [perPage, setPerPage] = useState(1);
  const [only, setOnly] = useState(null); // print just this desk's poster
  const [adding, setAdding] = useState(false); // the sheet where the number of desks is entered

  const load = useCallback(
    () =>
      api('/admin/companies')
        .then((data) => {
          setList(data);
          setError('');
        })
        .catch((err) => setError(err.message)),
    [],
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const reset = () => setOnly(null);
    window.addEventListener('afterprint', reset);
    return () => window.removeEventListener('afterprint', reset);
  }, []);

  const site = siteAddress(info);

  // One poster for every desk QR code, in desk order (the order they are carried round the hall).
  // "company" is the company that has activated it. A company that the organisers placed at a desk
  // themselves, without a desk QR code, has a QR code of its own and is listed as well.
  const desks = useMemo(
    () =>
      (list || [])
        .filter((c) => c.active && (c.name === '' || (c.room_no && !c.desk_id)))
        .map((c) => (c.name === '' ? { id: c.id, room_no: c.room_no, location: c.location, name: c.holder?.name || '', company: c.holder?.name || '', industry: '' } : { ...c, company: c.name, typed: true }))
        .sort(byDesk),
    [list],
  );

  const shown = useMemo(() => {
    if (companyId) return desks.filter((d) => d.id === companyId);
    const needle = q.trim().toLowerCase();
    return desks.filter((d) => (!state || (state === 'done') === Boolean(d.company)) && (!needle || [d.company, d.room_no, d.location].join(' ').toLowerCase().includes(needle)));
  }, [desks, q, state, companyId]);
  // 12 posters on the screen at a time (4 on a phone). Printing still gives every poster (Print all) or one (Print).
  const pageSize = usePageSize(4, 12);
  const paging = usePaging(shown.length, pageSize, `${q.trim()}|${state}|${companyId}|${pageSize}`);

  function pick(next) {
    const p = new URLSearchParams(params);
    if (next === 'company') p.set('kind', 'company');
    else p.delete('kind');
    p.delete('company');
    setParams(p, { replace: true });
  }

  function showAll() {
    const p = new URLSearchParams(params);
    p.delete('company');
    setParams(p, { replace: true });
  }

  function print(id = null) {
    // The choice must be on the page before the print window opens, because it freezes the page.
    flushSync(() => setOnly(id));
    window.print();
  }

  if (!list) return error ? <ErrorNote message={error} onRetry={load} /> : <PageLoader />;

  const desksSheet = adding && (
    <DesksModal
      suggested={nextDeskNumber(list)}
      onQrPage
      onClose={() => setAdding(false)}
      onDone={() => {
        // The new desks are not activated by anyone, so nothing may hide them.
        setQ('');
        setState('');
        pick('desk');
        load();
      }}
    />
  );

  const tabs = (
    <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-slate-200/70 p-1 print:hidden" role="tablist" aria-label="Which QR code">
      {Object.entries(KINDS).map(([key, item]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={kind === key}
          onClick={() => pick(key)}
          className={cx('flex min-h-14 cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-left transition', kind === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}
        >
          <span className={cx('grid size-8 shrink-0 place-items-center rounded-full text-sm font-extrabold', kind === key ? 'bg-blue-600 text-white' : 'bg-white text-slate-600')}>{item.step}</span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-extrabold leading-tight">{item.label}</span>
            <span className="block truncate text-xs font-semibold text-slate-500">{item.who}</span>
          </span>
        </button>
      ))}
    </div>
  );

  const printSize = (
    <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
      Print size
      <select value={perPage} onChange={(e) => setPerPage(Number(e.target.value))} className={selectCls}>
        <option value={1}>1 poster on an A4 page</option>
        <option value={4}>4 posters on an A4 page</option>
      </select>
    </label>
  );

  if (kind === 'company') {
    return (
      <>
        <div className="print:hidden">
          <PageTitle title="QR codes" sub="A QR code at every desk, and one QR code for companies to register.">
            {printSize}
          </PageTitle>
          {tabs}
          <p className="mb-4 text-[15px] text-slate-600">
            The same QR code for every company. A company scans it, registers and adds its jobs. Then it scans the desk QR code at its own desk, and that desk shows its details to candidates. Put copies at the entrance, the help desk or on the desks.
          </p>
          <AddressNote site={site} />
        </div>
        <CompanyQr site={site} fairName={info.fair_name} perPage={perPage} />
        {desksSheet}
      </>
    );
  }

  return (
    <>
      <div className="print:hidden">
        <PageTitle title="QR codes" sub="A QR code at every desk, and one QR code for companies to register.">
          {desks.length > 0 && printSize}
          <Button variant={desks.length ? 'secondary' : 'primary'} onClick={() => setAdding(true)}>
            <Grid2x2Plus className="size-4" aria-hidden="true" /> Add desks
          </Button>
          {desks.length > 0 && (
            <Button onClick={() => print()} disabled={shown.length === 0}>
              <Printer className="size-4" aria-hidden="true" /> Print {shown.length === desks.length ? 'all' : 'these'} ({shown.length})
            </Button>
          )}
        </PageTitle>
        {tabs}

        {desks.length === 0 ? (
          // With no desks at all, the page is just the one thing to do: say how many desks there are.
          <div className="rounded-3xl bg-white px-6 py-12 text-center shadow-xs ring-1 ring-slate-900/5">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-blue-50 text-blue-600">
              <QrCode className="size-8" aria-hidden="true" />
            </span>
            <p className="mt-4 text-lg font-extrabold text-slate-900">No desks yet</p>
            <p className="mx-auto mt-1 max-w-sm text-slate-500">Enter how many interview desks there are, and a QR code for every desk is made for you.</p>
            <Button size="lg" className="mt-5" onClick={() => setAdding(true)}>
              <QrCode className="size-5" aria-hidden="true" /> Generate QR codes
            </Button>
          </div>
        ) : (
          <>
            <p className="mb-4 text-[15px] text-slate-600">
              Print these and put one at every interview desk, in any order. The company at a desk activates its QR code by scanning it from its dashboard; after that, candidates who scan it see that company and can apply.
            </p>
            <AddressNote site={site} />

            {companyId ? (
              <button
                type="button"
                onClick={showAll}
                className="mb-4 inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                <X className="size-4" aria-hidden="true" /> Show all desks
              </button>
            ) : (
              <div className="mb-4 flex flex-wrap gap-2">
                <SearchBox value={q} onChange={setQ} placeholder="Search desk or company" className="w-full sm:w-auto sm:min-w-72" />
                <select value={state} onChange={(e) => setState(e.target.value)} aria-label="Which desks" className={cx(selectCls, 'sm:flex-none')}>
                  {FILTERS.map(([key, label]) => (
                    <option key={key} value={key}>
                      {label} ({key ? desks.filter((d) => (key === 'done') === Boolean(d.company)).length : desks.length})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {shown.length === 0 && <p className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-500">No desk matches.</p>}
          </>
        )}
      </div>

      <div className={cx('posters', perPage === 4 ? 'per-4' : 'per-1', only && 'solo')}>
        {shown.map((d, i) => {
          const onPage = i >= paging.start && i < paging.end;
          return (
          <div key={d.id} className={cx('poster-slot', only ? (only !== d.id && 'print:hidden') : null, !onPage && (only ? 'hidden' : 'hidden print:block'))}>
            <Poster company={d} url={`${site}/c/${d.id}`} fairName={info.fair_name} />
            <div className="mt-2 print:hidden">
              <DeskState desk={d} />
              <div className="mt-1.5 flex gap-2">
                <Button variant="secondary" size="sm" className="flex-1" onClick={() => print(d.id)}>
                  <Printer className="size-4" aria-hidden="true" /> Print
                </Button>
                <Button as="a" href={`/c/${d.id}`} target="_blank" rel="noopener noreferrer" variant="secondary" size="sm" className="flex-1" title="Open the page candidates see after scanning">
                  <ExternalLink className="size-4" aria-hidden="true" /> Open
                </Button>
              </div>
            </div>
          </div>
          );
        })}
      </div>
      <Pager className="mt-6" page={paging.page} pages={paging.pages} onChange={paging.setPage} label={rangeLabel(paging.start, paging.end, shown.length, 'Desks')} />

      {desksSheet}
    </>
  );
}
