// Load test: many candidates and companies using the job fair server at the same moment.
// Usage: node load-test.mjs <base url> <candidates>
const BASE = process.argv[2] || 'http://127.0.0.1:8199';
const USERS = Number(process.argv[3] || 150);
const COMPANIES = 20;
const stats = new Map(); // endpoint -> { times: [], errors: 0, codes: {} }
const problems = [];

async function call(name, method, url, { token, body, expect = [200, 201] } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const started = performance.now();
  let status = 0;
  let data = null;
  try {
    const res = await fetch(`${BASE}/api${url}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    status = res.status;
    data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : await res.arrayBuffer();
  } catch (err) {
    data = { error: err.message };
  }
  const ms = performance.now() - started;
  const s = stats.get(name) ?? { times: [], errors: 0, codes: {} };
  s.times.push(ms);
  s.codes[status] = (s.codes[status] ?? 0) + 1;
  if (!expect.includes(status)) {
    s.errors += 1;
    if (problems.length < 15) problems.push(`${name} ${method} ${url} -> ${status} ${JSON.stringify(data?.error ?? data).slice(0, 120)}`);
  }
  stats.set(name, s);
  return { status, data };
}

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Setup: organiser, desks, companies (each links its own desk) ──
const admin = (await call('admin login', 'POST', '/admin/login', { body: { username: 'admin', password: 'LoadTest@123' } })).data.token;
await call('add desks', 'POST', '/admin/desks', { token: admin, body: { from: 1, to: COMPANIES + 5, location: 'Hall A' } });
const companies = [];
for (let i = 1; i <= COMPANIES; i += 1) {
  const added = await call('admin add company', 'POST', '/admin/companies', {
    token: admin,
    body: { name: `Load Company ${String(i).padStart(2, '0')}`, industry: i % 2 ? 'Retail' : 'BPO', roles: i % 3 ? 'Sales Executive' : 'Accountant\nCashier' },
  });
  companies.push(added.data);
}
// Every company logs in and links its desk at the same time
await Promise.all(
  companies.map(async (c, i) => {
    const login = await call('company login', 'POST', '/recruiter/login', { body: { code: c.access_code } });
    c.token = login.data.token;
    await call('company links desk', 'POST', '/recruiter/desk', { token: c.token, body: { desk_no: String(i + 1) } });
  }),
);
console.log(`Setup: ${companies.length} companies, each at its own desk.`);

// ── The rush: every candidate at once, while every company interviews ──
let candidatesDone = false;
const t0 = performance.now();

async function candidate(i) {
  const mobile = `9${String(100000000 + i)}`;
  const info = await call('public info', 'GET', '/public/info');
  if (!info.data?.companies) return;
  const reg = await call('register', 'POST', '/auth/register', {
    body: {
      full_name: `Load Candidate ${i}`, mobile, email: `load${i}@example.com`, gender: i % 2 ? 'Female' : 'Male', dob: '2001-05-10',
      city: 'Udupi', qualification: 'MBA', specialization: 'Finance', college: 'Load College', passing_year: '2024', percentage: '70%',
      experience_type: 'fresher', skills: 'Excel',
    },
  });
  const token = reg.data?.token;
  if (!token) return;
  const list = await call('candidate companies', 'GET', '/companies', { token });
  // Everyone applies to company 1 (the busiest desk) and two others
  const picks = [companies[0], companies[1 + (i % (COMPANIES - 1))], companies[1 + ((i * 7) % (COMPANIES - 1))]];
  for (const c of new Set(picks)) {
    const page = await call('view company', 'GET', `/companies/${c.id}`, { token });
    const roles = page.data?.roles ?? [];
    await call('apply', 'POST', `/companies/${c.id}/apply`, { token, body: { role: roles[0] } });
  }
  await call('candidate companies', 'GET', '/companies', { token });
  await call('me', 'GET', '/me', { token });
  // A candidate who re-logs in on another phone
  if (i % 5 === 0) await call('candidate login', 'POST', '/auth/login', { body: { mobile } });
  // Waiting in the queue: the page refreshes itself
  for (let k = 0; k < 3; k += 1) {
    await sleep(200 + Math.random() * 400);
    await call('candidate companies', 'GET', '/companies', { token });
  }
  await call('scan desk QR', 'GET', `/public/companies/${companies[0].desk_id ?? companies[0].id}`);
}

async function companyDesk(c) {
  // The dashboard refreshes, calls candidates in, starts interviews and saves results
  while (!candidatesDone) {
    await call('company list', 'GET', '/recruiter/applications?limit=100', { token: c.token });
    const next = await call('call next', 'POST', '/recruiter/queue/next', { token: c.token, expect: [200, 404] });
    if (next.status === 200) {
      const id = next.data.called.id;
      await call('start interview', 'POST', `/recruiter/applications/${id}/start`, { token: c.token });
      await call('interview page', 'GET', `/recruiter/applications/${id}`, { token: c.token });
      await call('save interview', 'PUT', `/recruiter/applications/${id}/interview`, {
        token: c.token,
        body: { ratings: [{ id: 'd1', text: 'Tell us about yourself', rating: 4 }], notes: 'ok', status: 'interviewed' },
      });
    }
    await sleep(300);
  }
}

const desks = process.env.NO_DESKS ? [] : companies.map(companyDesk);
const organiser = process.env.NO_DESKS ? Promise.resolve() : (async () => {
  while (!candidatesDone) {
    await call('admin overview', 'GET', '/admin/overview', { token: admin });
    await call('admin applications', 'GET', '/admin/applications', { token: admin });
    await sleep(500);
  }
})();
await Promise.all(Array.from({ length: USERS }, (_, i) => candidate(i + 1)));
candidatesDone = true;
await Promise.all([...desks, organiser]);
const rushSeconds = (performance.now() - t0) / 1000;

// ── A burst: every candidate's phone refreshes at the same instant ──
const tokens = [];
for (let i = 1; i <= USERS; i += 1) {
  const login = await call('candidate login', 'POST', '/auth/login', { body: { mobile: `9${String(100000000 + i)}` } });
  if (login.data?.token) tokens.push(login.data.token);
}
const b0 = performance.now();
await Promise.all(tokens.flatMap((token) => [call('burst: companies', 'GET', '/companies', { token }), call('burst: public info', 'GET', '/public/info')]));
const burstMs = performance.now() - b0;

// ── Checks: tokens are unique and in order at every desk, nothing lost ──
const all = (await call('admin applications', 'GET', '/admin/export/applications', { token: admin })).status;
const checks = [];
let totalApps = 0;
let gaps = 0;
let clashes = 0;
const held = {};
for (const c of companies) {
  const rows = (await call('company list', 'GET', '/recruiter/applications?limit=2000', { token: c.token })).data.rows;
  totalApps += rows.length;
  const tokensAt = rows.map((r) => r.token_no).sort((a, b) => a - b);
  const unique = new Set(tokensAt).size === tokensAt.length;
  if (!unique) checks.push(`${c.name}: tokens DUPLICATED (${tokensAt.slice(0, 12).join(',')}…)`);
  gaps += tokensAt.length ? tokensAt.at(-1) - tokensAt.length : 0;
  // Nobody holds the same token, or one next to it, at two desks
  for (const r of rows) (held[r.candidate_id] ??= []).push(r.token_no);
}
for (const [who, list] of Object.entries(held)) {
  const sorted = [...list].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i += 1) if (sorted[i] - sorted[i - 1] <= 1) { clashes += 1; if (clashes < 4) checks.push(`candidate ${who}: tokens ${sorted.join(', ')}`); break; }
}
const overview = (await call('admin overview', 'GET', '/admin/overview', { token: admin })).data;

console.log(`\nRush: ${USERS} candidates + ${COMPANIES} company desks + organiser, all at once: ${rushSeconds.toFixed(1)} s`);
console.log(`Burst: ${tokens.length * 2} requests fired at the same instant, all answered in ${burstMs.toFixed(0)} ms`);
console.log(`Registered: ${overview.totals.candidates} · applications: ${overview.totals.applications} (companies see ${totalApps}) · interviews done: ${overview.totals.interviewed}`);
console.log(`Excel export after the rush: ${all}`);
console.log(`Token check: ${checks.length ? checks.join('\n  ') : 'no duplicate token at any desk; no candidate has the same or a next-door token at two desks'}`);
console.log(`Numbers skipped and not given out yet (the desk passed them, or no one applied after): ${gaps}`);
console.log('\nEndpoint                 calls  errors   p50 ms   p95 ms   max ms');
let calls = 0;
let errors = 0;
for (const [name, s] of [...stats].sort((a, b) => b[1].times.length - a[1].times.length)) {
  const sorted = [...s.times].sort((a, b) => a - b);
  calls += sorted.length;
  errors += s.errors;
  console.log(`${name.padEnd(24)} ${String(sorted.length).padStart(5)} ${String(s.errors).padStart(7)} ${pct(sorted, 50).toFixed(0).padStart(8)} ${pct(sorted, 95).toFixed(0).padStart(8)} ${sorted.at(-1).toFixed(0).padStart(8)}`);
}
console.log(`\nTotal: ${calls} requests, ${errors} unexpected errors`);
if (problems.length) console.log('Problems:\n  ' + problems.join('\n  '));
