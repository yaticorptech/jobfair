import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, DoorClosed } from 'lucide-react';
import { api, getToken, nextPath, setToken, useInfo, withNext } from './lib.jsx';
import { Button, Card, Credit, Empty, StickyBar, TopBar, cx, useToast } from './ui.jsx';
import { FIELD_GROUPS, candidateErrors, emptyCandidate } from './candidate/CandidateFields.jsx';

// Registration is split into short steps, one per screen. There is no password: afterwards
// candidates log in with their mobile number alone.
const STEP_COUNT = FIELD_GROUPS.length;

export default function Register() {
  const { info } = useInfo();
  const navigate = useNavigate();
  const toast = useToast();
  // Set when the candidate came from a desk QR code: they go back to that company afterwards.
  const next = nextPath(useLocation().search);
  const [step, setStep] = useState(0);
  const [v, setV] = useState(emptyCandidate);
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
    const all = candidateErrors(v);
    for (const field of FIELD_GROUPS[index].fields) if (all[field]) found[field] = all[field];
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
      if (next) {
        toast('Registration successful. You can apply now.');
        navigate(next, { replace: true });
      } else {
        navigate('/dashboard', { replace: true, state: { welcome: true } });
      }
    } catch (err) {
      setBusy(false);
      // The server found a problem (for example, the mobile number is already registered):
      // go back to the screen that has that question.
      const fields = err.fields || {};
      const at = FIELD_GROUPS.findIndex((group) => group.fields.some((field) => fields[field]));
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

  const group = FIELD_GROUPS[step];
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
