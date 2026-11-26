import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Clock, GraduationCap, MapPin, Megaphone, Phone } from 'lucide-react';
import { fmtDate, getToken, splitList, useInfo } from './lib.jsx';
import { Brand, Button, Card, Credit, Notice, StickyBar } from './ui.jsx';


function Detail({ icon: Icon, label, children }) {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#138808]/10 sm:size-11 sm:rounded-2xl">
        <Icon className="size-4 text-[#138808] sm:size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <dt className="text-[11px] font-bold uppercase tracking-wider text-[#138808]">{label}</dt>
        <dd className="text-[15px] font-bold leading-snug text-slate-900 sm:text-base">{children}</dd>
      </div>
    </div>
  );
}

// Branding from the official poster: the organising committee and the person presiding.
const ORGANISER = {
  name: 'KPCC Prachara Samithi, Udupi District',
  area: 'Kaup Assembly Constituency',
};
const LEADER = {
  name: 'Shri Vinay Kumar Sorake',
  role: 'Former Minister · President, KPCC Prachara Samithi',
  photo: '/leader.jpg',
};

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
          <p className={main === 'tricolor' ? 'flex-1 self-center text-[15px] font-bold text-slate-600' : 'flex-1 text-[15px] font-bold text-slate-600'}>Registration is closed</p>
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
        {/* On phones and tablets the event card and the notice fill the first screen together,
            so "How it works" starts below it. */}
        <div className={`flex flex-col gap-4 lg:sticky lg:top-6 lg:block max-lg:min-h-[calc(100svh-165px-max(0px,env(safe-area-inset-bottom)-12px))]`}>
        <section className="relative overflow-hidden rounded-[28px] max-lg:flex max-lg:flex-1 max-lg:flex-col bg-gradient-to-b from-[#FFE8CF] via-white to-[#DDF3E0] text-[#0B1F5C] shadow-lg shadow-orange-900/10 ring-1 ring-orange-100 px-5 pb-5 pt-6 sm:p-8 lg:p-10">
          {/* Tricolour edge, as on the poster */}
          <div className="absolute inset-x-0 top-0 flex h-2" aria-hidden="true">
            <span className="flex-1 bg-[#FF9933]" />
            <span className="grid flex-1 place-items-center bg-white">
              <span className="size-1.5 rounded-full ring-[1.5px] ring-[#0B1F5C]" />
            </span>
            <span className="flex-1 bg-[#138808]" />
          </div>

          <div className="mb-[clamp(1rem,3.5svh,2rem)] flex items-center gap-3 lg:mb-6">
            <img src="/congress.png" alt="Indian National Congress" className="size-10 shrink-0 rounded-full bg-white object-cover ring-2 ring-orange-200 sm:size-11" />
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-extrabold text-slate-900">{ORGANISER.name}</p>
              <p className="text-xs font-semibold text-slate-500">{ORGANISER.area}</p>
            </div>
          </div>

          {/* The poster's headline: ಉಚಿತ ಬೃಹತ್ ಉದ್ಯೋಗ ಮೇಳ = Free Mega Job Fair */}
          <div className="mb-[clamp(1rem,3svh,1.75rem)] lg:mb-6">
            <h1 className="text-[1.75rem] font-extrabold leading-[1.05] tracking-tight text-[#0B1F5C] min-[400px]:text-[2rem] sm:text-5xl lg:text-[2.6rem]">
              Free Mega <span className="text-[#E8650A]">Job Fair</span>
              <span className="sr-only"> · {info.fair_name}</span>
            </h1>
            <p lang="kn" className="mt-1.5 text-[15px] font-bold text-[#138808] sm:text-base">ಉಚಿತ ಬೃಹತ್ ಉದ್ಯೋಗ ಮೇಳ</p>
          </div>
          {highlights.length > 0 && (
            <ul className="grid grid-cols-2 gap-1.5 sm:gap-2">
              {highlights.map((h) => (
                <li key={h} className="flex min-h-8 items-center justify-center rounded-full bg-white px-2 py-1 text-center text-xs sm:min-h-9 sm:py-1.5 sm:text-[13px] font-bold leading-tight text-[#B34A00] ring-1 ring-orange-200 sm:px-3 sm:text-sm">
                  {h}
                </li>
              ))}
            </ul>
          )}
          <dl className="mt-[clamp(1rem,3.5svh,2rem)] space-y-[clamp(0.625rem,2svh,1.125rem)] lg:mt-6 lg:space-y-3.5">
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


          {/* Any height left on a tall phone sits here, just above the leader panel. */}
          <div className="min-h-[clamp(1rem,3.5svh,2rem)] flex-1 lg:hidden" aria-hidden="true" />
          <figure className="flex items-center gap-3 rounded-2xl bg-white/80 p-2.5 pr-3 sm:gap-4 sm:rounded-3xl lg:mt-6 sm:p-3 sm:pr-4 ring-1 ring-[#138808]/20 backdrop-blur">
            <img
              src={LEADER.photo}
              alt={LEADER.name}
              className="size-16 shrink-0 rounded-xl object-cover object-top ring-2 ring-[#FF9933] sm:size-18 sm:rounded-2xl"
            />
            <figcaption className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#E8650A]">Presided by</p>
              <p className="text-[15px] font-extrabold leading-snug text-slate-900 sm:text-base">{LEADER.name}</p>
              <p className="text-xs font-semibold leading-snug text-slate-600">{LEADER.role}</p>
            </figcaption>
          </figure>

          {/* On a laptop the buttons sit here; on phones they are in the bar at the bottom. */}
          <div className="mt-8 hidden gap-3 lg:flex">{actions('tricolor')}</div>
        </section>
        {info.notice && (
          <div className="lg:hidden">
            <Notice icon={Megaphone}>
              <p className="whitespace-pre-line">{info.notice}</p>
            </Notice>
          </div>
        )}
        </div>

        <div className="space-y-4">
        {info.notice && (
          <div className="hidden lg:block">
            <Notice icon={Megaphone}>
              <p className="whitespace-pre-line">{info.notice}</p>
            </Notice>
          </div>
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
        <StickyBar>{actions('tricolor')}</StickyBar>
      </div>
    </div>
  );
}
