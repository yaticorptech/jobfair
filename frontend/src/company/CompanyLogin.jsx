import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { api, getToken, setToken } from '../lib.jsx';
import { Button, Field, Input } from '../ui.jsx';
import { AuthShell, FormError } from '../Login.jsx';

export default function CompanyLogin() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (getToken('recruiter')) return <Navigate to="/company" replace />;

  async function submit(e) {
    e.preventDefault();
    if (code.replace(/[^0-9a-z]/gi, '').length < 8) {
      setError('Enter the 8-character access code');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const data = await api('/recruiter/login', { method: 'POST', body: { code } });
      setToken('recruiter', data.token);
      navigate('/company', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Company login" subtitle="Enter the access code the organisers gave your company." icon={Building2}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Access code" hint="8 letters and numbers, for example K7M4-P2XQ">
          <Input
            value={code}
            onChange={(e) => {
              setCode(e.target.value.toUpperCase());
              setError('');
            }}
            placeholder="XXXX-XXXX"
            maxLength={12}
            autoComplete="off"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            className="min-h-16 text-center font-mono text-2xl font-bold tracking-[0.2em] placeholder:font-normal"
          />
        </Field>
        <FormError>{error}</FormError>
        <Button type="submit" size="lg" loading={busy} className="w-full">
          Open company dashboard
        </Button>
        <p className="text-center text-sm text-slate-500">No code, or it does not work? Ask the organisers at the help desk.</p>
      </form>
    </AuthShell>
  );
}
