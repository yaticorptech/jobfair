import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Building2, SearchX } from 'lucide-react';
import { api, getToken, setToken, useInfo } from '../lib.jsx';
import { Button, Credit, Empty, ErrorNote, Field, Input, Notice, PageLoader, TopBar } from '../ui.jsx';
import { FormError } from '../Login.jsx';
import IndustrySelect from '../IndustrySelect.jsx';

// Where the company registration QR code leads (/r/<code>): the same page for every company.
// The company types its name, which registers it and logs it in to its dashboard. There it adds
// its details and job openings, and scans the QR code at its desk to make that desk its own.
export default function CompanyRegister() {
  const { code } = useParams();
  const { info } = useInfo();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [name, setName] = useState('');
  const [industry, setIndustry] = useState('');
  const [deskNo, setDeskNo] = useState('');
  const [floor, setFloor] = useState('');
  const [deskError, setDeskError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [taken, setTaken] = useState(false); // a company with this name is registered already
  const [failed, setFailed] = useState('');
  const [busy, setBusy] = useState(false);
  const loggedIn = Boolean(getToken('recruiter'));

  const load = useCallback(
    () =>
      api(`/public/company-register/${encodeURIComponent(code)}`)
        .then(() => {
          setReady(true);
          setError(null);
        })
        .catch((err) => setError({ message: err.message, missing: err.status === 404 })),
    [code],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function submit(e) {
    e.preventDefault();
    if (name.trim().length < 2) {
      setFieldError('Enter your company name');
      return;
    }
    setBusy(true);
    setFailed('');
    try {
      const data = await api(`/public/company-register/${encodeURIComponent(code)}`, { method: 'POST', body: { name, industry, room_no: deskNo, location: floor } });
      setToken('recruiter', data.token);
      navigate('/company?welcome=1', { replace: true });
    } catch (err) {
      if (err.fields?.name) {
        setFieldError(err.fields.name);
        setTaken(err.status === 409);
      } else if (err.fields?.room_no) setDeskError(err.fields.room_no);
      else setFailed(err.message);
      setBusy(false);
      requestAnimationFrame(() => document.querySelector('[data-error]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    }
  }

  return (
    <div className="min-h-dvh bg-white sm:bg-slate-50">
      <TopBar title={info.fair_name} />
      <main className="mx-auto w-full max-w-md px-5 py-6 sm:py-10">
        {error?.missing ? (
          <Empty icon={SearchX} title="This link does not work any more" text="The company registration link has been changed. Please ask the organisers at the help desk for the new QR code.">
            <Button as={Link} to="/company/login" variant="secondary">
              I have an access code
            </Button>
          </Empty>
        ) : error ? (
          <ErrorNote message={error.message} onRetry={load} />
        ) : !ready ? (
          <PageLoader />
        ) : (
          <div className="sm:rounded-3xl sm:bg-white sm:p-8 sm:shadow-xs sm:ring-1 sm:ring-slate-900/5">
            <span className="grid size-14 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <Building2 className="size-7" aria-hidden="true" />
            </span>
            <h1 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-slate-900">Register your company</h1>
            <p className="mt-1.5 text-slate-500">Enter your company name to begin. Next you add your job openings.</p>

            {loggedIn && (
              <Notice tone="blue" className="mt-5">
                <p>This phone is already logged in to a company dashboard.</p>
                <Button as={Link} to="/company" size="sm" className="mt-2">
                  Open my dashboard <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </Notice>
            )}

            <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
              <Field label="Company name" required error={fieldError} hint="Check the spelling. Candidates will see this name.">
                <Input
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setFieldError('');
                    setTaken(false);
                  }}
                  error={fieldError}
                  maxLength={120}
                  autoComplete="organization"
                  autoCapitalize="words"
                  autoFocus={!loggedIn}
                />
              </Field>
              {taken && (
                <Button as={Link} to="/company/login" variant="secondary" className="w-full">
                  Open the dashboard with the access code
                </Button>
              )}
              <Field label="Industry" hint="Optional">
                <IndustrySelect value={industry} onChange={setIndustry} />
              </Field>
              {/* For a company that is already at its desk. Others add these later, from the dashboard. */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Interview desk number" error={deskError} hint={deskError ? undefined : 'The number on the poster at your desk'}>
                  <Input
                    value={deskNo}
                    onChange={(e) => {
                      setDeskNo(e.target.value);
                      setDeskError('');
                    }}
                    error={deskError}
                    inputMode="numeric"
                    maxLength={20}
                    placeholder="e.g. 12"
                  />
                </Field>
                <Field label="Floor number" hint="e.g. 1, or Ground floor">
                  <Input value={floor} onChange={(e) => setFloor(e.target.value)} maxLength={80} placeholder="e.g. 1" />
                </Field>
              </div>
              <p className="-mt-1 text-sm text-slate-500">Not at your desk yet? Leave these two empty. You can add them later, or scan the QR code at your desk.</p>
              <FormError>{failed}</FormError>
              <Button type="submit" size="lg" loading={busy} className="w-full">
                Register <ArrowRight className="size-5" aria-hidden="true" />
              </Button>
            </form>

            <p className="mt-6 rounded-2xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Already registered?{' '}
              <Link to="/company/login" className="font-bold text-blue-700 underline-offset-4 hover:underline">
                Open your dashboard
              </Link>
              . Looking for a job?{' '}
              <Link to="/" className="font-bold text-blue-700 underline-offset-4 hover:underline">
                I am a candidate
              </Link>
            </p>
          </div>
        )}
        <Credit className="mt-8" />
      </main>
    </div>
  );
}
