import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Briefcase, ChevronRight, CircleCheck, ExternalLink, GraduationCap, Hourglass, IndianRupee, MapPin, RefreshCw, ScanQrCode, SearchX } from 'lucide-react';
import { api, getToken, useInfo, withNext } from './lib.jsx';
import { Avatar, Button, Card, Credit, Empty, ErrorNote, PageLoader, RoomBadge, StatusBadge, StickyBar, TokenBadge, TopBar, cx, useToast } from './ui.jsx';
import QueueNote from './candidate/QueueNote.jsx';
import { PushPrompt } from './candidate/PushCard.jsx';
import { ApplyModal, Fact } from './candidate/Companies.jsx';

function Count({ label, value }) {
  return (
    <div className="rounded-2xl bg-slate-50 px-4 py-3">
      <dt className="text-xs font-extrabold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-3xl font-extrabold leading-tight text-slate-900">{value}</dd>
    </div>
  );
}

// One position: the role, how many people are needed, the CTC, who can apply, where it is and what the job is.
function Job({ job }) {
  const [open, setOpen] = useState(false);
  const long = job.description.length > 180;
  return (
    <li className="rounded-2xl bg-slate-50 p-4">
      <p className="font-extrabold leading-snug text-slate-900">{job.title}</p>
      {(job.openings > 0 || job.ctc) && (
        <p className="mt-1.5 flex flex-wrap gap-1.5 text-xs font-bold">
          {job.openings > 0 && (
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-blue-700">
              {job.openings.toLocaleString('en-IN')} open position{job.openings === 1 ? '' : 's'}
            </span>
          )}
          {job.ctc && <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-emerald-800">CTC {job.ctc}</span>}
        </p>
      )}
      {(job.eligibility || job.location) && (
        <ul className="mt-2.5 space-y-1.5 text-[15px] text-slate-700">
          {job.eligibility && (
            <li className="flex items-start gap-2">
              <GraduationCap className="mt-0.5 size-4.5 shrink-0 text-slate-400" aria-hidden="true" />
              <span className="min-w-0">
                <span className="font-bold text-slate-900">Who can apply:</span> {job.eligibility}
              </span>
            </li>
          )}
          {job.location && (
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 size-4.5 shrink-0 text-slate-400" aria-hidden="true" />
              <span className="min-w-0">
                <span className="font-bold text-slate-900">Job location:</span> {job.location}
              </span>
            </li>
          )}
        </ul>
      )}
      {job.description && (
        <>
          <p className={cx('mt-2.5 whitespace-pre-line text-[15px] leading-relaxed text-slate-600', long && !open && 'line-clamp-3')}>{job.description}</p>
          {long && (
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="mt-1 min-h-9 cursor-pointer text-sm font-bold text-blue-700 underline-offset-4 hover:underline">
              {open ? 'Show less' : 'Read more'}
            </button>
          )}
        </>
      )}
    </li>
  );
}

// One company: what a candidate sees after tapping it in the list or scanning the candidate QR
// code at its desk. Anyone can read it; applying needs a login, and the candidate comes back here after.
export default function CompanyPage() {
  const { id } = useParams();
  const { info } = useInfo();
  const loggedIn = Boolean(getToken('candidate'));
  const here = `/c/${id}`;
  const home = loggedIn ? '/dashboard' : '/';
  const [company, setCompany] = useState(null);
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  // A company that scanned this poster with its phone's own camera lands here too.
  const asCompany = Boolean(getToken('recruiter'));
  const [activating, setActivating] = useState(false);

  // Makes this desk the desk of the company that is logged in on this phone.
  async function activate() {
    setActivating(true);
    try {
      const data = await api('/recruiter/desk', { method: 'POST', body: { qr: here } });
      toast(`Desk ${data.company.room_no} is yours now. Candidates who scan this QR code see your company.`);
      navigate('/company', { replace: true });
    } catch (err) {
      toast(err.message, 'error');
      setActivating(false);
    }
  }

  const load = useCallback(
    () =>
      api(loggedIn ? `/companies/${id}` : `/public/companies/${id}`)
        .then((data) => {
          setCompany(data);
          setError(null);
        })
        .catch((err) => setError({ message: err.message, missing: err.status === 404 })),
    [id, loggedIn],
  );

  useEffect(() => {
    setCompany(null);
    setError(null);
    load();
  }, [load]);

  const app = company?.application;
  const waiting = app?.status === 'applied';

  // While the candidate waits for their turn, the "now serving" token keeps itself up to date.
  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 10000);
    return () => clearInterval(timer);
  }, [waiting, load]);

  return (
    <div className="min-h-dvh bg-slate-50 pb-36">
      <TopBar
        title="Company"
        back={home}
        right={
          !loggedIn && (
            <Link to={withNext('/login', here)} className="inline-flex min-h-11 items-center rounded-full px-4 text-[15px] font-bold text-blue-700 hover:bg-blue-50">
              Login
            </Link>
          )
        }
      />

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-4">
        {error?.missing ? (
          <Empty icon={SearchX} title="This company is not in the list" text="The QR code may be old, or the company is no longer taking part.">
            <Button as={Link} to={home}>
              {loggedIn ? 'See all companies' : 'Go to the job fair page'}
            </Button>
          </Empty>
        ) : error ? (
          <ErrorNote message={error.message} onRetry={load} />
        ) : !company ? (
          <PageLoader />
        ) : company.pending ? (
          <Empty
            icon={Hourglass}
            title={company.room_no ? `Desk ${company.room_no}: details coming soon` : 'Details coming soon'}
            text="The company at this interview desk has not activated this QR code yet. Please check again in a few minutes."
          >
            {asCompany && (
              <div className="mx-auto mb-5 max-w-sm rounded-2xl bg-amber-50 p-4 text-left text-amber-950 ring-1 ring-inset ring-amber-300">
                <p className="font-extrabold">Is this your company&rsquo;s desk?</p>
                <p className="mt-0.5 text-sm">Activate it and candidates who scan this QR code will see your company.</p>
                <Button variant="accent" className="mt-3 w-full" onClick={activate} loading={activating}>
                  Activate this desk for my company
                </Button>
              </div>
            )}
            <div className="flex flex-col items-center gap-2">
              <Button onClick={load}>
                <RefreshCw className="size-4" aria-hidden="true" /> Check again
              </Button>
              <Button as={Link} to={home} variant="ghost">
                {loggedIn ? 'See all companies' : 'Go to the job fair page'}
              </Button>
            </div>
          </Empty>
        ) : (
          <>
            {app && (
              <Card className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <p className="flex min-w-0 items-center gap-2 font-extrabold text-emerald-700">
                    <CircleCheck className="size-5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0">You have applied{app.role ? ` · ${app.role}` : ''}</span>
                  </p>
                  <StatusBadge status={app.status} />
                </div>
                <div className="mt-3.5 grid grid-cols-2 gap-2.5">
                  <TokenBadge token={app.token_no} label="Your token" big />
                  <RoomBadge room={company.room_no} big />
                </div>
                {app.status === 'applied' && app.queue ? (
                  <QueueNote app={app} nowServing={company.now_serving} nowServingStarted={company.now_serving_started} nowServingDone={company.now_serving_done} onBreak={company.on_break} room={company.room_no} className="mt-3" />
                ) : (
                  <p className="mt-3 text-sm text-slate-500">Tell them your token number when you reach the interview desk.</p>
                )}
              </Card>
            )}

            <Card className="p-5 sm:p-6">
              <div className="flex items-start gap-3.5">
                <Avatar name={company.name} className="size-14 text-base" />
                <div className="min-w-0 flex-1">
                  <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-slate-900">{company.name}</h1>
                  {company.industry && <p className="mt-0.5 text-slate-500">{company.industry}</p>}
                </div>
                {!app && <RoomBadge room={company.room_no} />}
              </div>
              {company.location && (
                <p className="mt-4 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-[15px] font-bold text-amber-900">
                  <MapPin className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden="true" />
                  {company.location}
                </p>
              )}

              {(company.jobs.length > 0 || company.vacancies > 0) && (
                <dl className="mt-4 grid grid-cols-2 gap-2.5">
                  <Count label="Open positions" value={company.jobs.length || '—'} />
                  <Count label="Vacancies" value={company.vacancies > 0 ? company.vacancies.toLocaleString('en-IN') : '—'} />
                </dl>
              )}

              {company.jobs.length > 0 && (
                <div className="mt-5">
                  <h2 className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Positions</h2>
                  <ul className="mt-2 space-y-2.5">
                    {company.jobs.map((job) => (
                      <Job key={job.id} job={job} />
                    ))}
                  </ul>
                </div>
              )}

              {(company.eligibility || company.salary || company.job_location) && (
                <ul className="mt-5 space-y-3">
                  {company.eligibility && <Fact icon={GraduationCap}>{company.eligibility}</Fact>}
                  {company.salary && <Fact icon={IndianRupee}>{company.salary}</Fact>}
                  {company.job_location && <Fact icon={Briefcase}>Job location: {company.job_location}</Fact>}
                </ul>
              )}

              {company.about && <p className="mt-5 whitespace-pre-line border-t border-slate-100 pt-4 text-[15px] leading-relaxed text-slate-600">{company.about}</p>}
              {company.website && (
                <a href={company.website} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-10 items-center gap-1.5 font-bold text-blue-700 underline-offset-4 hover:underline">
                  Visit website <ExternalLink className="size-4" aria-hidden="true" />
                </a>
              )}
            </Card>

            {company.others.length > 0 && (
              <Card className="p-5 sm:p-6">
                <h2 className="font-extrabold text-slate-900">Also at desk {company.room_no}</h2>
                <ul className="mt-1 divide-y divide-slate-100">
                  {company.others.map((other) => (
                    <li key={other.id}>
                      <Link to={`/c/${other.id}`} className="flex min-h-14 items-center justify-between gap-3 py-2">
                        <span className="min-w-0">
                          <span className="block truncate font-bold text-slate-900">{other.name}</span>
                          {other.industry && <span className="block truncate text-sm text-slate-500">{other.industry}</span>}
                        </span>
                        <ChevronRight className="size-5 shrink-0 text-slate-300" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
        <Credit className="pt-4" />
      </main>

      {/* The one thing to do next, always at the bottom of the screen */}
      {company && !company.pending && !error && (
        <StickyBar className="flex-col items-stretch gap-1">
          {app ? (
            <Button as={Link} to={loggedIn ? '/dashboard/scan' : home} variant="secondary" size="lg">
              <ScanQrCode className="size-5" aria-hidden="true" /> Scan another desk QR code
            </Button>
          ) : !company.room_no ? (
            <p className="py-3 text-center font-bold text-slate-600">Applications open as soon as this company reaches its interview desk. Please check again soon.</p>
          ) : company.withdrawn ? (
            <p className="py-3 text-center font-bold text-slate-600">You withdrew from this company. Each company accepts one application per candidate.</p>
          ) : !info.applications_open ? (
            <p className="py-3 text-center font-bold text-slate-600">Applications are closed right now.</p>
          ) : loggedIn ? (
            <Button size="lg" onClick={() => setApplying(true)}>
              Apply and get my token <ArrowRight className="size-5" aria-hidden="true" />
            </Button>
          ) : (
            <>
              {info.registration_open && (
                <Button as={Link} to={withNext('/register', here)} size="lg">
                  Register and apply <ArrowRight className="size-5" aria-hidden="true" />
                </Button>
              )}
              <Button as={Link} to={withNext('/login', here)} variant={info.registration_open ? 'ghost' : 'primary'} size={info.registration_open ? 'md' : 'lg'}>
                I have already registered
              </Button>
            </>
          )}
        </StickyBar>
      )}

      {loggedIn && <PushPrompt />}
      {applying && company && <ApplyModal company={company} onClose={() => setApplying(false)} onDone={() => load()} />}
    </div>
  );
}
