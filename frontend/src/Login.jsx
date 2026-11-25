import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { UserRound } from 'lucide-react';
import { api, getToken, nextPath, setToken, useInfo, withNext } from './lib.jsx';
import { Button, Credit, Field, Input, TopBar } from './ui.jsx';
import { mobileProblem, tenDigits } from './candidate/CandidateFields.jsx';

// The frame shared by the three login screens (candidate, company, organiser).
export function AuthShell({ title, subtitle, icon: Icon = UserRound, back = '/', children, footer }) {
  const { info } = useInfo();
  return (
    <div className="min-h-dvh bg-white sm:bg-slate-50">
      <TopBar title={info.fair_name} back={back} />
      <main className="mx-auto w-full max-w-md px-5 py-8 sm:py-12">
        <div className="sm:rounded-3xl sm:bg-white sm:p-8 sm:shadow-xs sm:ring-1 sm:ring-slate-900/5">
          <span className="grid size-14 place-items-center rounded-2xl bg-blue-50 text-blue-600">
            <Icon className="size-7" aria-hidden="true" />
          </span>
          <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-slate-900">{title}</h1>
          {subtitle && <p className="mt-1.5 text-slate-500">{subtitle}</p>}
          <div className="mt-7">{children}</div>
        </div>
        {footer && <div className="mt-6 text-center text-[15px] text-slate-600">{footer}</div>}
        <Credit className="mt-8" />
      </main>
    </div>
  );
}

export function FormError({ children }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-3 text-[15px] font-semibold text-rose-700">
      {children}
    </p>
  );
}

// Candidates log in with the mobile number they registered with. There is no password.
export default function Login() {
  const navigate = useNavigate();
  const next = nextPath(useLocation().search);
  const [mobile, setMobile] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (getToken('candidate')) return <Navigate to={next || '/dashboard'} replace />;

  async function submit(e) {
    e.preventDefault();
    const problem = mobileProblem(mobile);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await api('/auth/login', { method: 'POST', body: { mobile } });
      setToken('candidate', data.token);
      navigate(next || '/dashboard', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Login"
      subtitle="Enter the mobile number you registered with."
      back={next || '/'}
      footer={
        <>
          New here?{' '}
          <Link to={withNext('/register', next)} className="font-bold text-blue-700 underline-offset-4 hover:underline">
            Register for the job fair
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Mobile number">
          {/* Only digits can be typed, and only 10 of them. */}
          <Input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]{10}"
            value={mobile}
            onChange={(e) => {
              setMobile(tenDigits(e.target.value));
              setError('');
            }}
            autoComplete="tel-national"
            placeholder="10-digit number"
            autoFocus
            className="min-h-16 text-2xl font-bold tracking-wider placeholder:text-base placeholder:font-normal placeholder:tracking-normal"
          />
        </Field>
        <FormError>{error}</FormError>
        <Button type="submit" size="lg" loading={busy} className="w-full">
          Login
        </Button>
      </form>
    </AuthShell>
  );
}
