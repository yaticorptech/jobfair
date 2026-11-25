import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Clock, GraduationCap, MapPin, Megaphone, Phone } from 'lucide-react';
import { fmtDate, getToken, splitList, useInfo } from './lib.jsx';
import { Brand, Button, Card, Credit, Notice, StickyBar } from './ui.jsx';

// "Blue Chip Connect" → "Connect" is shown in colour, like the logo ("Free Mega Job Fair" → "Job Fair").
function FairTitle({ name }) {
  const match = /^(.*?)((?:connect|job\s*fair).*)$/i.exec(name);
  if (!match || !match[1].trim()) return <>{name}</>;
  return (
    <>
      {match[1]}
      <span className="block text-amber-300">{match[2]}</span>
    </>
  );
}

function Detail({ icon: Icon, label, children }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white/15">
        <Icon className="size-5 text-amber-300" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <dt className="text-[11px] font-bold uppercase tracking-wider text-blue-200">{label}</dt>
        <dd className="font-bold leading-snug">{children}</dd>
      </div>
    </div>
  );
}

const STEPS = [
  { title: 'Register', text: 'Fill in your details once. It takes two minutes.' },
  { title: 'Find a company', text: 'See every company, its jobs and its interview desk.' },
  { title: 'Apply and get a token', text: 'Go to the interview desk and wait for your token number.' },
];

export default function Landing() {
  const { info } = useInfo();
  const loggedIn = Boolean(getToken('candidate'));
  const highlights = splitList(info.highlights, '\n'); // one per line, so "10,000+" stays whole
  const contacts = splitList(info.contacts);
  const companies = info.companies || [];
  const shown = companies.slice(0, 8);

  // Register and Login: in the bottom bar on phones, inside the event card on a laptop.
  const actions = (main) =>
    loggedIn ? (
      <Button as={Link} to="/dashboard" size="lg" variant={main} className="flex-1">
        Go to my dashboard <ArrowRight className="size-5" aria-hidden="true" />
      </Button>
    ) : (
      <>
        {info.registration_open ? (
          <Button as={Link} to="/register" size="lg" variant={main} className="flex-1">
            Register now <ArrowRight className="size-5" aria-hidden="true" />
          </Button>
        ) : (
          <p className={main === 'accent' ? 'flex-1 self-center text-[15px] font-bold text-blue-100' : 'flex-1 text-[15px] font-bold text-slate-600'}>Registration is closed</p>
        )}
        <Button as={Link} to="/login" size="lg" variant="secondary">
          Login
        </Button>
      </>
    );

  return (
    <div className="min-h-dvh bg-slate-50 pb-28 lg:pb-10">
      <header className="mx-auto flex max-w-2xl items-center justify-between gap-4 px-4 py-3 lg:max-w-6xl lg:px-8">
        <Brand name={info.fair_name} />
        <Link to={loggedIn ? '/dashboard' : '/login'} className="inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-[15px] font-bold text-blue-700 hover:bg-blue-50">
          {loggedIn ? 'My dashboard' : 'Login'}
        </Link>
      </header>

      {/* One column on phones and tablets. On a laptop the event card stays on the left
          while the rest of the page scrolls on the right. */}
      <main className="mx-auto max-w-2xl space-y-4 px-4 lg:grid lg:max-w-6xl lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-start lg:gap-6 lg:space-y-0 lg:px-8">
        {/* The event at a glance */}
        <section className="rounded-[28px] bg-blue-600 p-6 text-white shadow-lg shadow-blue-600/25 sm:p-8 lg:sticky lg:top-6 lg:p-10">
          <h1 className="text-[2.6rem] font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            <FairTitle name={info.fair_name} />
          </h1>
          {highlights.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {highlights.map((h) => (
                <li key={h} className="rounded-full bg-white/15 px-3 py-1.5 text-sm font-bold">
                  {h}
                </li>
              ))}
            </ul>
          )}
          <dl className="mt-6 space-y-3.5">
            {info.fair_date && (
              <Detail icon={CalendarDays} label="Date">
                {fmtDate(info.fair_date)}
              </Detail>
            )}
            {info.fair_time && (
              <Detail icon={Clock} label="Time">
                {info.fair_time}
              </Detail>
            )}
            {info.venue && (
              <Detail icon={MapPin} label="Venue">
                {info.venue}
              </Detail>
            )}
          </dl>
          {/* On a laptop the buttons sit here; on phones they are in the bar at the bottom. */}
          <div className="mt-8 hidden gap-3 lg:flex">{actions('accent')}</div>
        </section>

        <div className="space-y-4">
        {info.notice && (
          <Notice icon={Megaphone}>
            <p className="whitespace-pre-line">{info.notice}</p>
          </Notice>
        )}

        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-extrabold text-slate-900">How it works</h2>
          <ol className="mt-4 space-y-4">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex items-start gap-3.5">
                <span className="grid size-9 shrink-0 place-items-center rounded-full bg-blue-600 text-sm font-extrabold text-white">{i + 1}</span>
                <div>
                  <p className="font-bold text-slate-900">{step.title}</p>
                  <p className="text-sm text-slate-500">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-extrabold text-slate-900">Companies</h2>
            {companies.length > 0 && <p className="text-sm font-bold text-blue-700">{companies.length} so far</p>}
          </div>
          {companies.length === 0 ? (
            <p className="mt-2 text-slate-500">The company list will appear here soon. Register now and you will see it on your dashboard.</p>
          ) : (
            <>
              <ul className="mt-3 flex flex-wrap gap-2">
                {shown.map((c) => (
                  <li key={c.name} className="max-w-full truncate rounded-full bg-slate-100 px-3.5 py-2 text-sm font-semibold text-slate-700">
                    {c.name}
                  </li>
                ))}
                {companies.length > shown.length && (
                  <li className="rounded-full bg-blue-50 px-3.5 py-2 text-sm font-bold text-blue-700">+ {companies.length - shown.length} more</li>
                )}
              </ul>
              <p className="mt-3 text-sm text-slate-500">Register to see the jobs, salary and interview desk of each company.</p>
            </>
          )}
        </Card>

        {info.eligibility && (
          <Card className="flex items-start gap-3.5 p-5 sm:p-6">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
              <GraduationCap className="size-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="font-extrabold text-slate-900">Who can take part?</h2>
              <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-slate-600">{info.eligibility}</p>
            </div>
          </Card>
        )}

        {contacts.length > 0 && (
          <Card className="p-5 sm:p-6">
            <h2 className="text-lg font-extrabold text-slate-900">Need help?</h2>
            <p className="text-sm text-slate-500">Tap a number to call the organisers.</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {contacts.map((number) => (
                <li key={number}>
                  <a href={`tel:${number.replace(/[^\d+]/g, '')}`} className="flex min-h-12 items-center gap-3 rounded-2xl bg-slate-100 px-4 font-bold text-slate-800 hover:bg-blue-50">
                    <Phone className="size-4 text-blue-600" aria-hidden="true" />
                    {number}
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <footer className="space-y-3 px-1 pb-2 pt-4 text-center text-sm text-slate-500">
          <p>{info.organiser ? `Organised by ${info.organiser}` : info.fair_name}</p>
          <p className="flex justify-center gap-2">
            <Link to="/company" className="inline-flex min-h-11 items-center rounded-full px-4 font-bold text-slate-600 hover:bg-slate-100">
              Company login
            </Link>
            <Link to="/admin" className="inline-flex min-h-11 items-center rounded-full px-4 font-bold text-slate-600 hover:bg-slate-100">
              Organiser login
            </Link>
          </p>
          <Credit />
        </footer>
        </div>
      </main>

      {/* On phones the main action stays on screen however far the page is scrolled. */}
      <div className="lg:hidden">
        <StickyBar>{actions('primary')}</StickyBar>
      </div>
    </div>
  );
}
