import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { api, getToken, setToken } from '../lib.jsx';
import { Button, Field, Input } from '../ui.jsx';
import { AuthShell, FormError } from '../Login.jsx';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (getToken('admin')) return <Navigate to="/admin" replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await api('/admin/login', { method: 'POST', body: { username, password } });
      setToken('admin', data.token);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Organiser login" subtitle="For the job fair organising team only." icon={ShieldCheck}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Username">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" autoFocus />
        </Field>
        <Field label="Password">
          <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </Field>
        <FormError>{error}</FormError>
        <Button type="submit" size="lg" loading={busy} className="w-full">
          Login
        </Button>
      </form>
    </AuthShell>
  );
}
