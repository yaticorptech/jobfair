import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, BadgeCheck, Check, DoorClosed } from 'lucide-react';
import { api, getToken, nextPath, setToken, useInfo, withNext } from './lib.jsx';
import { Button, Card, Credit, Empty, StickyBar, TopBar, cx, useToast } from './ui.jsx';
import { askForAlerts } from './push.js';
import { FIELD_GROUPS, candidateErrors, emptyCandidate } from './candidate/CandidateFields.jsx';

// One Yes / No question, shown as two large tappable choices.
function Choice({ name, question, options, value, error, onChange }) {
  return (
    <fieldset data-error={error ? '' : undefined}>
      <legend className="text-[15px] font-bold text-slate-900">
        {question} <span className="text-rose-600">*</span>
      </legend>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {options.map((o) => {
          const active = value === o.value;
          return (
            <label
              key={o.value}
              className={cx(
                'flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 transition has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-blue-600',
                active ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'border-slate-200 bg-white hover:bg-slate-50',
                error && !value && 'border-rose-300',
              )}
            >
              <input type="radio" name={name} value={o.value} checked={active} onChange={() => onChange(o.value)} className="sr-only" />
              <span className={cx('grid size-5 shrink-0 place-items-center rounded-full border-2', active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300')}>
                {active && <Check className="size-3" strokeWidth={3.5} aria-hidden="true" />}
              </span>
              <span className="font-bold text-slate-900">{o.title}</span>
            </label>
          );
        })}
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-rose-600">{error}</p>}
    </fieldset>
  );
}

// The last screen of registration: does the candidate already know AI? Only if not, would they
// like to study the Government Certified AI Course? On Yes the server also saves their details in
// a separate list (ai_course_leads).
function AiCourseFields({ v, set, errors }) {
  return (
    <div className="space-y-6 sm:col-span-2">
      <Choice
        name="ai_known"
        question="Do you know AI (Artificial Intelligence)?"
        options={[
          { value: 'yes', title: 'Yes, I know AI' },
          { value: 'no', title: 'No, I don’t' },
        ]}
        value={v.ai_known}
        error={errors.ai_known}
        onChange={(value) => {
          set('ai_known', value);
          if (value === 'yes') set('ai_course', '');
        }}
      />

      {v.ai_known === 'no' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3.5 rounded-2xl bg-gradient-to-br from-[#FFF1E2] to-[#E6F5E8] p-4 ring-1 ring-orange-100">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-[#138808] shadow-xs">
              <BadgeCheck className="size-6" aria-hidden="true" />
            </span>
            <div>
              <p className="font-extrabold text-slate-900">Government Certified AI Course</p>
              <p className="mt-0.5 text-sm leading-relaxed text-slate-600">Learn practical AI skills that employers are asking for, and earn a government recognised certificate.</p>
            </div>
          </div>
          <Choice
            name="ai_course"
            question="Are you interested in studying this AI course?"
            options={[
              { value: 'yes', title: 'Yes, I am interested' },
              { value: 'no', title: 'No, thank you' },
            ]}
            value={v.ai_course}
            error={errors.ai_course}
            onChange={(value) => set('ai_course', value)}
          />
        </div>
      )}
    </div>
  );
}

// Registration is split into short steps, one per screen. There is no password: afterwards
// candidates log in with their mobile number alone.
const STEPS = [
  ...FIELD_GROUPS,
  { title: 'AI Course', sub: 'One last question before you register', fields: ['ai_known', 'ai_course'], Fields: AiCourseFields },
];
const STEP_COUNT = STEPS.length;
const aiCourseErrors = (v) =>
  !v.ai_known
    ? { ai_known: 'Please choose Yes or No' }
    : v.ai_known === 'no' && !v.ai_course
      ? { ai_course: 'Please choose Yes or No' }
      : {};

export default function Register() {
  const { info, refresh: refreshInfo } = useInfo();
  const navigate = useNavigate();
  const toast = useToast();
  // Set when the candidate came from a desk QR code: they go back to that company afterwards.
  const next = nextPath(useLocation().search);
  const [step, setStep] = useState(0);
  const [v, setV] = useState(() => ({ ...emptyCandidate, ai_known: '', ai_course: '' }));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  if (getToken('candidate')) return <Navigate to={next || '/dashboard'} replace />;

  const set = (key, value) => {
    setV((old) => ({ ...old, [key]: value }));
    setErrors((old) => (old[key] ? { ...old, [key]: undefined } : old));
  };

  function goTo(index) {
    setStep(index);
    window.scrollTo({ top: 0 });
  }

  function showErrors(found, message) {
    setErrors(found);
    toast(message, 'error');
    requestAnimationFrame(() => document.querySelector('[data-error]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  }

  // Only the questions on the current screen are checked when Next is pressed.
  function problemsOn(index) {
    const found = {};
    const all = { ...candidateErrors(v), ...aiCourseErrors(v) };
    for (const field of STEPS[index].fields) if (all[field]) found[field] = all[field];
    return found;
  }

  async function submit(e) {
    e.preventDefault();
    const found = problemsOn(step);
    if (Object.keys(found).length) {
      showErrors(found, 'Please check the highlighted fields');
      return;
    }
    setErrors({});
    if (step < STEP_COUNT - 1) {
      goTo(step + 1);
      return;
    }

    setBusy(true);
    try {
      const data = await api('/auth/register', { method: 'POST', body: v });
      setToken('candidate', data.token);
      askForAlerts();
      if (next) {
        toast('Registration successful. You can apply now.');
        navigate(next, { replace: true });
      } else {
        navigate('/dashboard', { replace: true, state: { welcome: true } });
      }
    } catch (err) {
      setBusy(false);
      if (err.status === 403) refreshInfo(); // registration was just closed: the page shows it at once
      // The server found a problem (for example, the mobile number is already registered):
      // go back to the screen that has that question.
      const fields = err.fields || {};
      const at = STEPS.findIndex((group) => group.fields.some((field) => fields[field]));
      if (at >= 0) goTo(at);
      showErrors(fields, err.message);
    }
  }

  if (!info.registration_open) {
    return (
      <div className="min-h-dvh bg-slate-50">
        <TopBar title="Register" back={next || '/'} />
        <main className="mx-auto max-w-2xl px-4 py-6">
          <Empty icon={DoorClosed} title="Registration is closed right now" text="Please contact the organisers or the help desk at the venue.">
            <Button as={Link} to={withNext('/login', next)} variant="secondary">
              Already registered? Login
            </Button>
          </Empty>
          <Credit className="mt-8" />
        </main>
      </div>
    );
  }

  const group = STEPS[step];
  const last = step === STEP_COUNT - 1;

  return (
    <div className="min-h-dvh bg-slate-50 pb-32">
      <TopBar
        title="Register"
        back={step === 0 ? next || '/' : () => goTo(step - 1)}
        right={
          <span className="text-sm font-bold text-slate-500">
            Step {step + 1} of {STEP_COUNT}
          </span>
        }
      />

      <form onSubmit={submit} noValidate className="mx-auto max-w-2xl px-4 pt-4">
        <div className="flex gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={STEP_COUNT} aria-valuenow={step + 1} aria-label="Registration progress">
          {Array.from({ length: STEP_COUNT }, (_, i) => (
            <span key={i} className={cx('h-1.5 flex-1 rounded-full transition-colors', i <= step ? 'bg-blue-600' : 'bg-slate-200')} />
          ))}
        </div>

        <h1 className="mt-6 text-[28px] font-extrabold leading-tight tracking-tight text-slate-900">{group.title}</h1>
        <p className="mt-1 text-slate-500">{group.sub}</p>

        <Card className="mt-5 grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
          <group.Fields v={v} set={set} errors={errors} />
        </Card>

        {step === 0 && (
          <p className="mt-5 text-center text-[15px] text-slate-600">
            Already registered?{' '}
            <Link to={withNext('/login', next)} className="font-bold text-blue-700 underline-offset-4 hover:underline">
              Login
            </Link>
          </p>
        )}
        <Credit className="mt-8" />

        <StickyBar>
          {step > 0 && (
            <Button variant="secondary" size="lg" onClick={() => goTo(step - 1)} disabled={busy}>
              Back
            </Button>
          )}
          <Button type="submit" size="lg" loading={busy} className="flex-1">
            {last ? 'Register' : 'Next'} {!busy && <ArrowRight className="size-5" aria-hidden="true" />}
          </Button>
        </StickyBar>
      </form>
    </div>
  );
}
