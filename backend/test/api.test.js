import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Each run gets its own empty MongoDB database, and a temp folder for resumes.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobfair-test-'));
process.env.DATA_DIR = dataDir;
process.env.MONGODB_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017';
process.env.MONGODB_DB = `jobfair_test_${process.pid}_${Date.now()}`;
process.env.ADMIN_USER = 'admin';
process.env.ADMIN_PASS = 'test-admin-pass';

let server;
let base;
let adminAuth;

async function call(method, url, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${base}/api${url}`, { method, headers, body: payload });
  const isJson = (res.headers.get('content-type') || '').includes('json');
  return { status: res.status, data: isJson ? await res.json() : await res.arrayBuffer(), headers: res.headers };
}

const person = (overrides = {}) => ({
  full_name: 'Asha Shetty',
  mobile: '9845012345',
  email: 'asha@example.com',
  gender: 'Female',
  dob: '2002-04-12',
  city: 'Kaup',
  qualification: 'MBA',
  specialization: 'Finance',
  college: 'Test College',
  passing_year: '2025',
  percentage: '72%',
  experience_type: 'fresher',
  languages: 'English, Kannada',
  skills: 'Tally, Excel',
  ...overrides,
});

function toForm(fields, file) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  if (file) form.append('resume', new Blob([file.content], { type: file.type }), file.name);
  return form;
}

// Organisers add a company with its name and details only. A desk number given here is then set
// the way the company itself does it: from its dashboard, with its access code.
// Candidates can only apply to a company that has its desk, so every company gets one unless the
// test asks for none (noDesk).
async function addCompany(body) {
  const { room_no, location, noDesk, ...details } = body;
  const res = await call('POST', '/admin/companies', { token: adminAuth, body: body.name ? details : body });
  assert.equal(res.status, 201);
  if (!body.name || noDesk) return res.data;
  // A company gets its desk by scanning the desk QR code there (once): the organisers add that
  // desk QR code, and the company scans it.
  const login = await call('POST', '/recruiter/login', { body: { code: res.data.access_code } });
  let desk = (await call('GET', '/admin/companies', { token: adminAuth })).data.find((c) => c.name === '' && c.room_no === room_no && !c.holder);
  if (!desk) desk = (await call('POST', '/admin/companies', { token: adminAuth, body: { name: '', room_no: room_no || `T${res.data.id}`, location } })).data;
  const placed = await call('POST', '/recruiter/desk', { token: login.data.token, body: { qr: `https://fair.example/c/${desk.id}`, location } });
  assert.equal(placed.status, 200, placed.data.error);
  return { ...res.data, ...placed.data.company };
}

before(async () => {
  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const login = await call('POST', '/admin/login', { body: { username: 'admin', password: 'test-admin-pass' } });
  adminAuth = login.data.token;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  const { db, closeDb } = await import('../src/db.js');
  await db.dropDatabase();
  await closeDb();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test('public info carries the event details', async () => {
  const res = await call('GET', '/public/info');
  assert.equal(res.status, 200);
  assert.equal(res.data.fair_name, 'Blue Chip Connect');
  assert.equal(res.data.fair_date, '2026-11-27');
  assert.equal(res.data.registration_open, true);
  assert.equal(res.data.jwt_secret, undefined);
});

test('admin login rejects a wrong password and admin routes need a token', async () => {
  const bad = await call('POST', '/admin/login', { body: { username: 'admin', password: 'nope' } });
  assert.equal(bad.status, 401);
  assert.equal((await call('GET', '/admin/overview')).status, 401);
  assert.equal((await call('GET', '/admin/candidates')).status, 401);
});

test('registration validates the details', async () => {
  const res = await call('POST', '/auth/register', {
    form: toForm(person({ mobile: '12345', email: 'not-an-email', full_name: '' })),
  });
  assert.equal(res.status, 400);
  for (const field of ['mobile', 'email', 'full_name']) assert.ok(res.data.fields[field], field);
  assert.equal(res.data.fields.password, undefined); // there is no password to give

  // Only a 10-digit mobile number is accepted
  const mobileError = async (mobile) => (await call('POST', '/auth/register', { body: person({ mobile, email: 'digits@example.com' }) })).data.fields?.mobile;
  for (const wrong of ['984501234', '98450123456', '9845O12345', '98450-1234', '', '919845012345678']) {
    assert.equal(await mobileError(wrong), 'Enter your 10-digit mobile number', wrong);
  }
  assert.match(await mobileError('5845012345'), /starts with 6, 7, 8 or 9/);
  assert.match(await mobileError('0123456789'), /starts with 6, 7, 8 or 9/);

  // Percentage / CGPA must be filled in, with a sensible number in it. (The mobile number is
  // wrong on purpose, so none of these tries creates a registration.)
  const marksError = async (percentage) => (await call('POST', '/auth/register', { body: person({ mobile: '1', percentage }) })).data.fields.percentage;
  assert.equal(await marksError(''), 'Enter your percentage or CGPA');
  assert.equal(await marksError('   '), 'Enter your percentage or CGPA');
  for (const wrong of ['good', 'abc%', '0', '720', '101%']) assert.match(await marksError(wrong), /percentage \(like 72%\)/, wrong);
  for (const fine of ['72%', '72', '68.5 %', '7.8 CGPA', 'CGPA 8.25', '100', '9']) assert.equal(await marksError(fine), undefined, fine);
});

test('full candidate journey: register, see companies and rooms, apply, get a token', async () => {
  const company = await addCompany({
    name: 'Test Motors',
    industry: 'Automobile & Mobile',
    room_no: '104',
    location: 'Ground Floor',
    roles: 'Sales Executive, Service Advisor',
    website: 'testmotors.example.com',
  });
  assert.deepEqual(company.roles, ['Sales Executive', 'Service Advisor']);
  assert.equal(company.website, 'https://testmotors.example.com/');
  const single = await addCompany({ name: 'Solo Retail', room_no: '201', roles: 'Cashier' });
  const hidden = await addCompany({ name: 'Hidden Co', room_no: '999', active: false });

  // Register with a resume
  const reg = await call('POST', '/auth/register', {
    form: toForm(person({ mobile: '+91 98450 12345' }), { name: 'cv.pdf', type: 'application/pdf', content: '%PDF-1.4 test' }),
  });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.candidate.reg_no, 'JF-0001');
  assert.equal(reg.data.candidate.mobile, '9845012345');
  assert.equal(reg.data.candidate.has_resume, true);
  assert.equal(reg.data.candidate.password_hash, undefined);
  const token = reg.data.token;

  // Same mobile again is refused
  const dup = await call('POST', '/auth/register', { form: toForm(person({ email: 'other@example.com' })) });
  assert.equal(dup.status, 400);
  assert.ok(dup.data.fields.mobile);

  // Login needs only the mobile number: there is no password
  const login = await call('POST', '/auth/login', { body: { mobile: '9845012345' } });
  assert.equal(login.status, 200);
  assert.equal(login.data.candidate.reg_no, 'JF-0001');
  assert.equal(login.data.candidate.password_hash, undefined);
  assert.equal((await call('GET', '/me', { token: login.data.token })).data.mobile, '9845012345');
  assert.equal((await call('POST', '/auth/login', { body: { mobile: '+91 98450 12345' } })).status, 200);
  const stranger = await call('POST', '/auth/login', { body: { mobile: '9845000000' } });
  assert.equal(stranger.status, 404);
  assert.match(stranger.data.error, /not registered/);
  assert.equal(stranger.data.token, undefined);
  for (const wrong of ['98450', '984501234567', 'asha@example.com', '']) {
    assert.equal((await call('POST', '/auth/login', { body: { mobile: wrong } })).status, 400, wrong);
  }
  assert.equal((await call('POST', '/auth/login', { body: {} })).status, 400);

  // Company list shows room numbers and hides inactive companies
  assert.equal((await call('GET', '/companies')).status, 401);
  let list = (await call('GET', '/companies', { token })).data;
  assert.deepEqual(list.map((c) => c.name), ['Solo Retail', 'Test Motors']);
  assert.equal(list.find((c) => c.name === 'Test Motors').room_no, '104');
  assert.equal(list[0].application, null);

  // Applying needs a role when the company has several
  const noRole = await call('POST', `/companies/${company.id}/apply`, { token, body: {} });
  assert.equal(noRole.status, 400);
  const applied = await call('POST', `/companies/${company.id}/apply`, { token, body: { role: 'Service Advisor' } });
  assert.equal(applied.status, 201);
  assert.equal(applied.data.token_no, 1);
  assert.equal(applied.data.status, 'applied');
  assert.equal((await call('POST', `/companies/${company.id}/apply`, { token, body: { role: 'Service Advisor' } })).status, 409);

  // Single-role company picks the role automatically; inactive company cannot be applied to
  const auto = await call('POST', `/companies/${single.id}/apply`, { token, body: {} });
  assert.equal(auto.data.role, 'Cashier');
  assert.equal((await call('POST', `/companies/${hidden.id}/apply`, { token, body: {} })).status, 404);

  list = (await call('GET', '/companies', { token })).data;
  const mine = list.find((c) => c.name === 'Test Motors');
  assert.equal(mine.application.role, 'Service Advisor');
  assert.equal(mine.applicants, 1);

  // A second candidate gets the next token for the same company
  const second = await call('POST', '/auth/register', {
    form: toForm(person({ full_name: 'Ravi Kumar', mobile: '9845099999', email: 'ravi@example.com', gender: 'Male' })),
  });
  assert.equal(second.data.candidate.reg_no, 'JF-0002');
  const secondApp = await call('POST', `/companies/${company.id}/apply`, {
    token: second.data.token,
    body: { role: 'Sales Executive' },
  });
  assert.equal(secondApp.data.token_no, 2);

  // Admin marks the first candidate as shortlisted; the candidate sees it and can no longer withdraw
  const apps = await call('GET', `/admin/applications?company=${company.id}`, { token: adminAuth });
  assert.equal(apps.data.total, 2);
  assert.deepEqual(apps.data.rows.map((r) => r.token_no), [1, 2]);
  const upd = await call('PUT', `/admin/applications/${applied.data.id}`, { token: adminAuth, body: { status: 'shortlisted' } });
  assert.equal(upd.status, 200);
  assert.equal((await call('PUT', `/admin/applications/${applied.data.id}`, { token: adminAuth, body: { status: 'bogus' } })).status, 400);
  list = (await call('GET', '/companies', { token })).data;
  assert.equal(list.find((c) => c.name === 'Test Motors').application.status, 'shortlisted');
  assert.equal((await call('DELETE', `/applications/${applied.data.id}`, { token })).status, 400);

  // The second candidate can withdraw, but not somebody else's application
  assert.equal((await call('DELETE', `/applications/${applied.data.id}`, { token: second.data.token })).status, 404);
  assert.equal((await call('DELETE', `/applications/${secondApp.data.id}`, { token: second.data.token })).status, 200);

  // One application per company, ever: after withdrawing, the same company cannot be applied to again
  const again = await call('POST', `/companies/${company.id}/apply`, { token: second.data.token, body: { role: 'Sales Executive' } });
  assert.equal(again.status, 409);
  assert.match(again.data.error, /withdrew/);

  // Resume download: own resume and admin copy
  const own = await call('GET', '/me/resume', { token });
  assert.equal(own.status, 200);
  assert.match(own.headers.get('content-disposition'), /JF-0001_Asha_Shetty\.pdf/);
  assert.equal((await call('GET', '/admin/candidates/1/resume', { token: adminAuth })).status, 200);
  assert.equal((await call('GET', '/admin/candidates/1/resume', { token })).status, 401);

  // Admin search and Excel downloads
  const found = await call('GET', '/admin/candidates?q=JF-0002', { token: adminAuth });
  assert.equal(found.data.total, 1);
  assert.equal(found.data.rows[0].full_name, 'Ravi Kumar');
  const sheet = await call('GET', '/admin/export/applications', { token: adminAuth });
  assert.equal(sheet.status, 200);
  assert.match(sheet.headers.get('content-type'), /spreadsheetml/);

  // Profile update
  const edit = await call('PUT', '/me', { token, body: { ...person(), city: 'Udupi', experience_type: 'experienced', experience_years: '2' } });
  assert.equal(edit.status, 200);
  assert.equal(edit.data.city, 'Udupi');
  assert.equal(edit.data.experience_years, 2);

  // There are no candidate passwords, so there is nothing to change or reset
  assert.equal((await call('PUT', '/me/password', { token, body: { current: 'x', next: 'newsecret' } })).status, 404);
  assert.equal((await call('POST', '/admin/candidates/1/password', { token: adminAuth, body: { password: 'helpdesk1' } })).status, 404);
  assert.equal((await call('GET', '/me', { token })).status, 200);

  // A candidate who changes their mobile number logs in with the new one from then on
  const moved = await call('PUT', '/me', { token, body: { ...person(), mobile: '9845012346' } });
  assert.equal(moved.status, 200);
  assert.equal((await call('POST', '/auth/login', { body: { mobile: '9845012345' } })).status, 404);
  assert.equal((await call('POST', '/auth/login', { body: { mobile: '9845012346' } })).status, 200);
  assert.equal((await call('PUT', '/me', { token, body: person() })).status, 200); // and back again
  assert.equal((await call('POST', '/auth/login', { body: { mobile: '9845012345' } })).status, 200);
});

test('resume must be a document under 2 MB', async () => {
  const wrongType = await call('POST', '/auth/register', {
    form: toForm(person({ mobile: '9845011111', email: 'a1@example.com' }), { name: 'photo.exe', type: 'application/octet-stream', content: 'x' }),
  });
  assert.equal(wrongType.status, 400);
  assert.match(wrongType.data.error, /PDF/);
  const tooBig = await call('POST', '/auth/register', {
    form: toForm(person({ mobile: '9845011112', email: 'a2@example.com' }), { name: 'big.pdf', type: 'application/pdf', content: 'x'.repeat(2 * 1024 * 1024 + 10) }),
  });
  assert.equal(tooBig.status, 400);
  assert.match(tooBig.data.error, /2 MB/);
});

test('companies can be uploaded in bulk and re-uploaded to fill in room numbers', async () => {
  const upload = (csv) => {
    const form = new FormData();
    form.append('file', new Blob([csv], { type: 'text/csv' }), 'companies.csv');
    return call('POST', '/admin/companies/import', { token: adminAuth, form });
  };
  const first = await upload(
    'Company Name,Industry,Room No,Roles,Vacancies\n' +
      'Bulk One,Retail,,"Cashier, Store Supervisor",10\n' +
      'Bulk Two – ಕನ್ನಡ,BPO,B-12,Voice Support,25\n' +
      ',Retail,5,No name,1\n',
  );
  assert.equal(first.status, 200);
  assert.equal(first.data.added, 2);
  assert.equal(first.data.skipped.length, 1);

  const second = await upload('Company,Room,Vacancies\nbulk one,305,12\n');
  assert.deepEqual({ added: second.data.added, updated: second.data.updated }, { added: 0, updated: 1 });

  const all = (await call('GET', '/admin/companies', { token: adminAuth })).data;
  const one = all.find((c) => c.name === 'Bulk One');
  // Desk numbers in the file are not used: the company links its desk by scanning the QR code there
  assert.equal(one.room_no, '');
  assert.equal(one.desk_id, null);
  assert.equal(all.find((c) => c.name === 'Bulk Two – ಕನ್ನಡ').room_no, '');
  assert.deepEqual(one.roles, ['Cashier', 'Store Supervisor']); // untouched by the second file
  assert.equal(one.vacancies, 12);
  assert.ok(all.find((c) => c.name === 'Bulk Two – ಕನ್ನಡ'));

  assert.equal((await upload('Industry,Room\nRetail,1\n')).status, 400);

  // The downloadable Excel template can be filled in and uploaded as it is
  const template = await call('GET', '/admin/companies/template', { token: adminAuth });
  assert.equal(template.status, 200);
  const form = new FormData();
  form.append('file', new Blob([template.data]), 'companies-template.xlsx');
  const fromExcel = await call('POST', '/admin/companies/import', { token: adminAuth, form });
  assert.equal(fromExcel.data.added, 1);
  const example = (await call('GET', '/admin/companies', { token: adminAuth })).data.find((c) => c.name === 'Example Motors Pvt Ltd');
  assert.equal(example.room_no, '');
  assert.equal(example.vacancies, 12);
  assert.deepEqual(example.roles, ['Sales Executive', 'Service Advisor']);
  assert.equal((await call('DELETE', `/admin/companies/${example.id}`, { token: adminAuth })).status, 200);
});

test('settings: closing registration and limiting applications', async () => {
  const current = (await call('GET', '/admin/settings', { token: adminAuth })).data;
  const save = (changes) => call('PUT', '/admin/settings', { token: adminAuth, body: { ...current, ...changes } });

  const flip = (key, on) => call('PUT', '/admin/controls', { token: adminAuth, body: { key, on } });
  // Saving the settings form leaves the switches alone; they are flipped on Desk control
  assert.equal((await save({ registration_open: false })).status, 200);
  assert.equal((await call('GET', '/public/switches')).data.registration_open, true);
  assert.equal((await flip('registration_open', false)).status, 200);
  const closed = await call('POST', '/auth/register', { form: toForm(person({ mobile: '9845022222', email: 'b@example.com' })) });
  assert.equal(closed.status, 403);

  await flip('registration_open', true);
  await save({ max_applications: 1 });
  const reg = await call('POST', '/auth/register', { form: toForm(person({ mobile: '9845022222', email: 'b@example.com' })) });
  assert.equal(reg.status, 201);
  // Applications open only at companies that have their desk
  const list = (await call('GET', '/companies', { token: reg.data.token })).data.filter((c) => c.room_no && c.active !== false);
  const pick = (c) => ({ role: c.roles[0] ?? '' });
  assert.equal((await call('POST', `/companies/${list[0].id}/apply`, { token: reg.data.token, body: pick(list[0]) })).status, 201);
  const over = await call('POST', `/companies/${list[1].id}/apply`, { token: reg.data.token, body: pick(list[1]) });
  assert.equal(over.status, 400);
  assert.match(over.data.error, /maximum of 1/);

  await save({ max_applications: 0 });
  await flip('applications_open', false);
  assert.equal((await call('POST', `/companies/${list[1].id}/apply`, { token: reg.data.token, body: pick(list[1]) })).status, 403);
  await flip('applications_open', true);
  assert.equal((await save({ fair_name: '' })).status, 400);
});

test('deleting a candidate removes their applications', async () => {
  const before = (await call('GET', '/admin/overview', { token: adminAuth })).data.totals;
  const theirs = (await call('GET', '/admin/candidates/2', { token: adminAuth })).data.applications;
  const count = Array.isArray(theirs) ? theirs.length : Number(theirs) || 0;
  assert.equal((await call('DELETE', '/admin/candidates/2', { token: adminAuth })).status, 200);
  const afterTotals = (await call('GET', '/admin/overview', { token: adminAuth })).data.totals;
  assert.equal(afterTotals.candidates, before.candidates - 1);
  assert.equal(afterTotals.applications, before.applications - count);
  assert.equal((await call('POST', '/admin/demo/clear', { token: adminAuth })).status, 400);
});

test('room QR page: anyone can see the company, a logged-in candidate also sees their token', async () => {
  const company = await addCompany({ name: 'Scan Corp', room_no: 'Q1', roles: 'Trainee' });
  await addCompany({ name: 'Same Room Ltd', room_no: 'q1' });
  const hidden = await addCompany({ name: 'Hidden Scan Co', room_no: 'Q1', active: false });

  const page = await call('GET', `/public/companies/${company.id}`);
  assert.equal(page.status, 200);
  assert.equal(page.data.name, 'Scan Corp');
  assert.equal(page.data.room_no, 'Q1');
  assert.deepEqual(page.data.roles, ['Trainee']);
  assert.deepEqual(page.data.others.map((c) => c.name), ['Same Room Ltd']);
  assert.equal(page.data.access_code, undefined);
  assert.equal((await call('GET', `/public/companies/${hidden.id}`)).status, 404);
  assert.equal((await call('GET', '/public/companies/999999')).status, 404);
  assert.equal((await call('GET', '/public/companies/abc')).status, 404);

  // Registration from the QR page sends plain JSON (no file)
  const reg = await call('POST', '/auth/register', {
    body: person({ full_name: 'Qr Tester', mobile: '9845033333', email: 'qr@example.com' }),
  });
  assert.equal(reg.status, 201);
  const token = reg.data.token;
  assert.equal((await call('GET', `/companies/${company.id}`)).status, 401);
  assert.equal((await call('GET', `/companies/${company.id}`, { token })).data.application, null);
  const applied = await call('POST', `/companies/${company.id}/apply`, { token, body: {} });
  assert.equal(applied.status, 201);
  const mine = await call('GET', `/companies/${company.id}`, { token });
  assert.equal(mine.data.application.token_no, applied.data.token_no);
  assert.equal(mine.data.application.status, 'applied');
});

test('company dashboard: login with the access code, see and update only its own candidates', async () => {
  const all = (await call('GET', '/admin/companies', { token: adminAuth })).data;
  const company = all.find((c) => c.name === 'Scan Corp');
  const other = await addCompany({ name: 'Other Corp', room_no: 'Q2' });
  const candidate = (await call('POST', '/auth/login', { body: { mobile: '9845033333' } })).data.token;
  const otherApp = await call('POST', `/companies/${other.id}/apply`, { token: candidate, body: {} });
  assert.equal(otherApp.status, 201);

  // Every company has its own code. Organisers can see it, candidates cannot.
  for (const c of all) assert.match(c.access_code, /^[0-9A-HJKMNP-TV-Z]{8}$/, c.name);
  assert.equal(new Set(all.map((c) => c.access_code)).size, all.length);
  const code = company.access_code;
  const candidateList = (await call('GET', '/companies', { token: candidate })).data;
  assert.ok(candidateList.length > 0);
  assert.ok(candidateList.every((c) => c.access_code === undefined));

  // Login forgives lower case and the dash
  assert.equal((await call('POST', '/recruiter/login', { body: { code: 'WRONG123' } })).status, 401);
  assert.equal((await call('POST', '/recruiter/login', { body: {} })).status, 401);
  const login = await call('POST', '/recruiter/login', { body: { code: ` ${code.slice(0, 4)}-${code.slice(4)} `.toLowerCase() } });
  assert.equal(login.status, 200);
  assert.equal(login.data.company.name, 'Scan Corp');
  assert.equal(login.data.company.access_code, undefined);
  const recruiter = login.data.token;

  // Only a company login opens the company dashboard
  assert.equal((await call('GET', '/recruiter/applications')).status, 401);
  assert.equal((await call('GET', '/recruiter/applications', { token: candidate })).status, 401);
  assert.equal((await call('GET', '/recruiter/applications', { token: adminAuth })).status, 401);
  assert.equal((await call('GET', '/admin/companies', { token: recruiter })).status, 401);
  assert.equal((await call('GET', '/companies', { token: recruiter })).status, 401);

  const me = await call('GET', '/recruiter/me', { token: recruiter });
  assert.equal(me.data.company.room_no, 'Q1');
  assert.deepEqual({ total: me.data.counts.total, applied: me.data.counts.applied }, { total: 1, applied: 1 });

  // Its own queue, with the candidate's details; asking for another company's list is ignored
  const queue = await call('GET', `/recruiter/applications?company=${other.id}`, { token: recruiter });
  assert.equal(queue.data.total, 1);
  assert.equal(queue.data.rows[0].full_name, 'Qr Tester');
  assert.equal(queue.data.rows[0].mobile, '9845033333');
  assert.equal(queue.data.rows[0].reg_no.startsWith('JF-'), true);
  assert.equal(queue.data.rows[0].password_hash, undefined);
  const token = queue.data.rows[0].token_no;
  assert.equal((await call('GET', `/recruiter/applications?q=${token}`, { token: recruiter })).data.total, 1);
  assert.equal((await call('GET', '/recruiter/applications?q=nobody', { token: recruiter })).data.total, 0);
  assert.equal((await call('GET', '/recruiter/applications?status=selected', { token: recruiter })).data.total, 0);

  // It can set the result for its own candidate, not for another company's
  const done = await call('PUT', `/recruiter/applications/${queue.data.rows[0].id}`, { token: recruiter, body: { status: 'selected' } });
  assert.equal(done.status, 200);
  assert.equal(done.data.counts.selected, 1);
  assert.equal((await call('PUT', `/recruiter/applications/${queue.data.rows[0].id}`, { token: recruiter, body: { status: 'bogus' } })).status, 400);
  assert.equal((await call('PUT', `/recruiter/applications/${otherApp.data.id}`, { token: recruiter, body: { status: 'selected' } })).status, 404);
  const seen = (await call('GET', `/companies/${company.id}`, { token: candidate })).data;
  assert.equal(seen.application.status, 'selected');

  const sheet = await call('GET', '/recruiter/export', { token: recruiter });
  assert.equal(sheet.status, 200);
  assert.match(sheet.headers.get('content-type'), /spreadsheetml/);
  assert.match(sheet.headers.get('content-disposition'), /Scan-Corp-candidates\.xlsx/);
  const logins = await call('GET', '/admin/export/company-logins', { token: adminAuth });
  assert.match(logins.headers.get('content-type'), /spreadsheetml/);
  assert.equal((await call('GET', '/admin/export/company-logins', { token: recruiter })).status, 401);

  // A new access code logs the old one out
  const fresh = await call('POST', `/admin/companies/${company.id}/access-code`, { token: adminAuth });
  assert.equal(fresh.status, 200);
  assert.notEqual(fresh.data.access_code, code);
  assert.equal((await call('GET', '/recruiter/me', { token: recruiter })).status, 401);
  assert.equal((await call('POST', '/recruiter/login', { body: { code } })).status, 401);
  assert.equal((await call('POST', '/recruiter/login', { body: { code: fresh.data.access_code } })).status, 200);
  assert.equal((await call('POST', '/admin/companies/999999/access-code', { token: adminAuth })).status, 404);
});

test('settings: the website address used in QR codes', async () => {
  const current = (await call('GET', '/admin/settings', { token: adminAuth })).data;
  assert.equal(current.site_url, '');
  const save = (site_url) => call('PUT', '/admin/settings', { token: adminAuth, body: { ...current, site_url } });
  assert.equal((await save('jobfair.example.com/some/page')).data.site_url, 'https://jobfair.example.com');
  assert.equal((await call('GET', '/public/info')).data.site_url, 'https://jobfair.example.com');
  assert.equal((await save('http://192.168.1.12:8170')).data.site_url, 'http://192.168.1.12:8170');
  assert.equal((await save('not a website')).status, 400);
  assert.equal((await save('')).data.site_url, '');
});

test('a company fills in its own details and job openings', async () => {
  const company = await addCompany({ name: 'Self Service Co', room_no: 'S1', roles: 'Accountant, Driver', vacancies: 7, salary: 'As per norms' });
  assert.deepEqual(company.roles, ['Accountant', 'Driver']);
  assert.equal(company.vacancies, 7);
  const code = (await call('GET', '/admin/companies', { token: adminAuth })).data.find((c) => c.id === company.id).access_code;
  const recruiter = (await call('POST', '/recruiter/login', { body: { code } })).data.token;
  const save = (body, token = recruiter) => call('PUT', '/recruiter/company', { token, body });

  // Only the company itself can do this
  assert.equal((await save({ about: 'x' }, null)).status, 401);
  assert.equal((await save({ about: 'x' }, adminAuth)).status, 401);

  // The company has its desk (scanned once); it can change the floor shown. A bare floor number is shown as "Floor 2".
  assert.equal((await save({ location: '2' })).data.company.location, 'Floor 2');
  assert.equal((await call('GET', `/public/companies/${company.id}`)).data.location, 'Floor 2');
  assert.equal((await save({ location: 'Block A, 1st floor' })).data.company.location, 'Block A, 1st floor');

  // Jobs the organisers typed as plain titles come with empty details, ready to be filled in
  const me = (await call('GET', '/recruiter/me', { token: recruiter })).data.company;
  assert.deepEqual(me.jobs.map((j) => [j.title, j.description, j.openings, j.ctc, j.applicants]), [['Accountant', '', 0, '', 0], ['Driver', '', 0, '', 0]]);

  // A candidate applies for Accountant before the company edits anything
  const candidate = (await call('POST', '/auth/register', { body: person({ full_name: 'Job Seeker', mobile: '9845044444', email: 'seeker@example.com' }) })).data.token;
  assert.equal((await call('POST', `/companies/${company.id}/apply`, { token: candidate, body: { role: 'Accountant' } })).status, 201);

  const saved = await save({
    industry: 'Retail',
    about: 'We run twelve stores.\nHead office in Udupi.',
    eligibility: 'Any degree',
    job_location: 'Udupi',
    website: 'selfservice.example.com',
    name: 'Renamed By Company', // not theirs to change
    jobs: [
      { id: me.jobs[0].id, title: 'Senior Accountant', description: 'Tally and GST filing.', openings: 3, ctc: '₹3.0 – 3.6 LPA', eligibility: 'BCom / MCom, 3 years experience', location: 'Udupi' },
      { id: me.jobs[1].id, title: 'Driver', description: '', openings: '2', ctc: '₹18,000 per month', eligibility: 'SSLC, LMV licence', location: 'Udupi, Manipal' },
      { title: 'Store Manager', description: 'Runs one store.', openings: 1, ctc: '₹4.2 LPA', eligibility: 'Any degree', location: 'Karkala' },
    ],
  });
  assert.equal(saved.status, 200);
  const mine = saved.data.company;
  assert.equal(mine.name, 'Self Service Co');
  assert.equal(mine.room_no, 'S1');
  assert.equal(mine.website, 'https://selfservice.example.com/');
  assert.deepEqual(mine.roles, ['Senior Accountant', 'Driver', 'Store Manager']);
  assert.equal(mine.vacancies, 6); // 3 + 2 + 1 open positions replace the organisers' rough number
  assert.equal(mine.jobs[0].id, me.jobs[0].id);
  assert.equal(mine.jobs[0].applicants, 1); // the earlier applicant follows the renamed job

  // What candidates see: the scanned page has every detail, the long list leaves descriptions out
  const page = (await call('GET', `/public/companies/${company.id}`)).data;
  assert.equal(page.about, 'We run twelve stores.\nHead office in Udupi.');
  assert.deepEqual(page.jobs.map((j) => [j.title, j.description, j.openings, j.ctc]), [
    ['Senior Accountant', 'Tally and GST filing.', 3, '₹3.0 – 3.6 LPA'],
    ['Driver', '', 2, '₹18,000 per month'],
    ['Store Manager', 'Runs one store.', 1, '₹4.2 LPA'],
  ]);
  // Each job says who can apply for it and where it is
  assert.deepEqual(page.jobs.map((j) => [j.eligibility, j.location]), [
    ['BCom / MCom, 3 years experience', 'Udupi'],
    ['SSLC, LMV licence', 'Udupi, Manipal'],
    ['Any degree', 'Karkala'],
  ]);
  const listed = (await call('GET', '/companies', { token: candidate })).data.find((c) => c.id === company.id);
  assert.deepEqual(listed.roles, ['Senior Accountant', 'Driver', 'Store Manager']);
  assert.equal(listed.jobs[0].ctc, '₹3.0 – 3.6 LPA');
  assert.equal(listed.jobs[0].description, undefined);
  assert.equal(listed.application.role, 'Senior Accountant');
  assert.equal((await call('POST', `/companies/${company.id}/apply`, { token: candidate, body: { role: 'Driver' } })).status, 409);

  // Sending only part of the form changes only that part
  const partial = await save({ about: 'Shorter text.' });
  assert.equal(partial.data.company.about, 'Shorter text.');
  assert.equal(partial.data.company.jobs.length, 3);
  assert.equal(partial.data.company.industry, 'Retail');

  // Mistakes are refused with a clear message and nothing is saved
  assert.match((await save({ jobs: [{ title: '' }] })).data.error, /enter the job role/);
  const whoWhere = { eligibility: 'Any degree', location: 'Udupi' };
  assert.match((await save({ jobs: [{ title: 'Driver', ...whoWhere }, { title: 'driver', ...whoWhere }] })).data.error, /listed twice/);
  // Who can apply and the job location are required for a job opening
  assert.equal((await save({ jobs: [...mine.jobs, { title: 'Packer', location: 'Udupi' }] })).data.error, 'Packer: enter who can apply');
  assert.equal((await save({ jobs: [...mine.jobs, { title: 'Packer', eligibility: 'PUC' }] })).data.error, 'Packer: enter the job location');
  assert.equal((await save({ jobs: [{ ...mine.jobs[0], location: ' ' }, ...mine.jobs.slice(1)] })).data.error, 'Senior Accountant: enter the job location');
  assert.equal((await save({ website: 'not a website' })).status, 400);
  assert.equal((await save({ jobs: Array.from({ length: 26 }, (_, i) => ({ title: `Role ${i}` })) })).status, 400);
  assert.equal((await call('GET', '/recruiter/me', { token: recruiter })).data.company.jobs.length, 3);

  // When organisers edit the company or upload Excel again, the company's job details survive
  const edited = await call('PUT', `/admin/companies/${company.id}`, { token: adminAuth, body: { name: 'Self Service Co', room_no: 'S2', vacancies: 7, roles: 'Driver\nsenior accountant\nCleaner' } });
  assert.equal(edited.status, 200);
  let after = (await call('GET', `/public/companies/${company.id}`)).data;
  assert.equal(after.room_no, 'S1'); // the desk stays the one the company set itself
  assert.deepEqual(after.jobs.map((j) => [j.title, j.openings, j.ctc]), [['Driver', 2, '₹18,000 per month'], ['senior accountant', 3, '₹3.0 – 3.6 LPA'], ['Cleaner', 0, '']]);
  assert.deepEqual(after.jobs.map((j) => j.location), ['Udupi, Manipal', 'Udupi', '']);
  // "Cleaner" was typed by the organisers, without those two details. It does not get in the way
  // of the company changing another job, but changing Cleaner itself asks for them.
  const current = (await call('GET', '/recruiter/me', { token: recruiter })).data.company.jobs;
  assert.equal((await save({ jobs: [{ ...current[0], openings: 5 }, current[1], current[2]] })).status, 200);
  assert.equal((await save({ jobs: [current[0], current[1], { ...current[2], ctc: '₹12,000 per month' }] })).data.error, 'Cleaner: enter who can apply');
  assert.equal((await save({ jobs: [{ ...current[0], openings: 2 }, current[1], current[2]] })).status, 200);
  const form = new FormData();
  form.append('file', new Blob(['Company Name,Roles,Room No\nself service co,"Driver, Cleaner, Packer",S3\n'], { type: 'text/csv' }), 'companies.csv');
  assert.equal((await call('POST', '/admin/companies/import', { token: adminAuth, form })).data.updated, 1);
  after = (await call('GET', `/public/companies/${company.id}`)).data;
  assert.equal(after.room_no, 'S1'); // a desk number in Excel does not move the company
  assert.deepEqual(after.jobs.map((j) => [j.title, j.openings]), [['Driver', 2], ['Cleaner', 0], ['Packer', 0]]);
  assert.equal(after.vacancies, 2);

  // A company with no open positions entered falls back to the organisers' number
  assert.equal((await save({ jobs: [{ title: 'Helper', ...whoWhere }] })).data.company.vacancies, 7);
});

test('desk QR codes go anywhere: a company registers, then scans the one at its desk to activate it', async () => {
  // Organisers make desk QR codes 501 to 503 before any company arrives
  const made = await call('POST', '/admin/desks', { token: adminAuth, body: { from: 501, to: 503, location: 'Hall B' } });
  assert.equal(made.status, 201);
  assert.deepEqual(made.data, { added: 3, skipped: [] });
  // Numbers that are already in use are left alone
  assert.deepEqual((await call('POST', '/admin/desks', { token: adminAuth, body: { from: 502, to: 504 } })).data, { added: 1, skipped: ['502', '503'] });
  assert.equal((await call('POST', '/admin/desks', { token: adminAuth, body: { from: 5, to: 2 } })).status, 400);
  assert.equal((await call('POST', '/admin/desks', { token: adminAuth, body: { from: 1, to: 999 } })).status, 400);
  assert.equal((await call('POST', '/admin/desks', { token: adminAuth, body: { from: 'A1', to: 'A9' } })).status, 400);
  assert.equal((await call('POST', '/admin/desks', { body: { from: 1, to: 2 } })).status, 401);

  const adminList = async () => (await call('GET', '/admin/companies', { token: adminAuth })).data;
  const deskAt = async (no) => (await adminList()).find((c) => c.name === '' && c.room_no === no);
  const page = async (id) => (await call('GET', `/public/companies/${id}`)).data;
  const desk = await deskAt('501');
  const desk2 = await deskAt('502');
  const desk3 = await deskAt('503');
  const desk4 = await deskAt('504');
  assert.equal(desk.location, 'Hall B');
  assert.equal(desk.holder, null);
  const qrOf = (d) => `https://fair.example.com/c/${d.id}`;

  // A desk QR code that no company has activated shows nothing to apply to
  const candidate = (await call('POST', '/auth/register', { body: person({ full_name: 'Desk Walker', mobile: '9845055555', email: 'walker@example.com' }) })).data.token;
  assert.ok((await call('GET', '/public/info')).data.companies.every((c) => c.name));
  assert.ok((await call('GET', '/companies', { token: candidate })).data.every((c) => c.name));
  assert.deepEqual(await page(desk.id), { id: desk.id, pending: true, room_no: '501', location: 'Hall B' });
  assert.equal((await call('POST', `/companies/${desk.id}/apply`, { token: candidate, body: {} })).status, 404);
  assert.equal((await call('GET', '/admin/overview', { token: adminAuth })).data.totals.empty_desks, 4);

  // Companies register through one link: the one inside the company registration QR code
  const link = (await call('GET', '/admin/company-link', { token: adminAuth })).data.code;
  assert.match(link, /^[0-9A-HJKMNP-TV-Z]{10}$/);
  assert.equal((await call('GET', '/admin/company-link', { token: adminAuth })).data.code, link);
  assert.equal((await call('GET', '/admin/company-link')).status, 401);
  assert.equal((await call('GET', '/public/company-register/WRONGC0DE1')).status, 404);
  assert.equal((await call('GET', `/public/company-register/${link.toLowerCase()}`)).status, 200);
  assert.equal((await call('POST', `/public/company-register/${link}`, { body: { name: ' ' } })).status, 400);
  assert.equal((await call('POST', '/public/company-register/WRONGC0DE1', { body: { name: 'Sneaky Ltd' } })).status, 404);
  const reg = await call('POST', `/public/company-register/${link}`, { body: { name: '  Desk First   Pvt Ltd ', industry: 'Retail' } });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.company.name, 'Desk First Pvt Ltd');
  assert.equal(reg.data.company.industry, 'Retail');
  assert.equal(reg.data.company.room_no, '');
  assert.equal(reg.data.company.desk_id, null);
  assert.match(reg.data.access_code, /^[0-9A-HJKMNP-TV-Z]{8}$/);
  const first = reg.data.company;
  const recruiter = reg.data.token;
  // Registering the same company a second time is refused: its people use the access code
  const twice = await call('POST', `/public/company-register/${link}`, { body: { name: 'desk first pvt ltd' } });
  assert.equal(twice.status, 409);
  assert.match(twice.data.error, /already registered/);
  assert.equal((await call('POST', '/recruiter/login', { body: { code: reg.data.access_code } })).status, 200);

  // It is in the candidates' list straight away, with no desk yet. Until it scans its desk QR code
  // it can do nothing else: not even add its jobs.
  assert.equal((await page(first.id)).room_no, '');
  assert.equal((await call('GET', '/recruiter/me', { token: recruiter })).data.access_code, reg.data.access_code);
  assert.equal((await call('GET', '/recruiter/me', { token: recruiter })).data.at_desk, false);
  const blocked = await call('PUT', '/recruiter/company', { token: recruiter, body: { jobs: [{ title: 'Cashier' }] } });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.data.code, 'scan_desk');

  // The company scans the QR code on the poster at its desk
  const activate = (body, token = recruiter) => call('POST', '/recruiter/desk', { token, body });
  assert.equal((await activate({ qr: qrOf(desk) }, null)).status, 401);
  assert.equal((await activate({ qr: qrOf(desk) }, candidate)).status, 401);
  assert.equal((await activate({})).status, 400);
  assert.equal((await activate({ qr: 'https://example.com/something-else' })).status, 400);
  assert.match((await activate({ qr: `https://fair.example.com/r/${link}` })).data.error, /company registration QR code/);
  assert.equal((await activate({ qr: 'https://fair.example.com/c/999999' })).status, 404);
  const mine = await activate({ qr: qrOf(desk) });
  assert.equal(mine.status, 200);
  assert.equal(mine.data.company.room_no, '501');
  assert.equal(mine.data.company.location, 'Hall B');
  assert.equal(mine.data.company.desk_id, desk.id);
  // Now it adds a job opening (its name stays the organisers')
  assert.equal((await call('PUT', '/recruiter/company', { token: recruiter, body: { jobs: [{ title: 'Cashier', openings: 4, ctc: '₹14,000 per month', eligibility: 'PUC', location: 'Kaup' }] } })).status, 200);
  assert.equal((await call('PUT', '/recruiter/company', { token: recruiter, body: { name: 'Renamed' } })).data.company.name, 'Desk First Pvt Ltd');
  // A later login opens the dashboard without scanning again
  const later = (await call('POST', '/recruiter/login', { body: { code: reg.data.access_code } })).data.token;
  assert.equal((await call('GET', '/recruiter/me', { token: later })).data.at_desk, true);

  // Candidates who scan that poster now see this company, and can apply from there
  const seen = await page(desk.id);
  assert.equal(seen.id, first.id);
  assert.equal(seen.name, 'Desk First Pvt Ltd');
  assert.equal(seen.room_no, '501');
  assert.deepEqual(seen.jobs.map((j) => [j.title, j.openings]), [['Cashier', 4]]);
  assert.equal(seen.desk_id, undefined);
  const applied = await call('POST', `/companies/${desk.id}/apply`, { token: candidate, body: {} });
  assert.equal(applied.status, 201);
  assert.equal((await call('GET', `/companies/${desk.id}`, { token: candidate })).data.application.token_no, applied.data.token_no);
  assert.equal((await call('GET', '/recruiter/applications', { token: recruiter })).data.total, 1);
  const listed = await adminList();
  assert.deepEqual(listed.find((c) => c.id === desk.id).holder, { id: first.id, name: 'Desk First Pvt Ltd' });
  assert.equal(listed.find((c) => c.id === first.id).desk_id, desk.id);
  assert.equal((await call('GET', '/admin/overview', { token: adminAuth })).data.totals.empty_desks, 3);

  // A second company cannot take that desk. It activates its own by typing the number on the poster.
  const second = await call('POST', `/public/company-register/${link}`, { body: { name: 'Second Company' } });
  const other = second.data.token;
  const clash = await activate({ qr: qrOf(desk) }, other);
  assert.equal(clash.status, 409);
  assert.match(clash.data.error, /Desk 501 is already activated by Desk First Pvt Ltd/);
  assert.equal((await activate({ desk_no: '501' }, other)).status, 409);
  assert.equal((await activate({ desk_no: '777' }, other)).status, 404);
  assert.equal((await activate({ desk_no: '502' }, other)).data.company.room_no, '502');
  assert.equal((await page(desk2.id)).name, 'Second Company');
  // Scanning its own poster again changes nothing; another company's own page is not a desk
  assert.equal((await activate({ qr: qrOf(desk2) }, other)).data.company.desk_id, desk2.id);
  assert.match((await activate({ qr: `https://fair.example.com/c/${first.id}` }, other)).data.error, /belongs to Desk First Pvt Ltd/);

  // A company that moves scans the poster at its new desk; the old one is free again
  assert.equal((await activate({ qr: `${qrOf(desk3)}/` })).data.company.room_no, '503');
  assert.equal((await page(desk.id)).pending, true);
  assert.equal((await page(desk3.id)).name, 'Desk First Pvt Ltd');
  assert.equal((await call('GET', `/companies/${desk3.id}`, { token: candidate })).data.application.token_no, applied.data.token_no);

  // Organisers can take a desk QR code away from a company
  assert.equal((await call('POST', `/admin/companies/${first.id}/desk/free`, { token: adminAuth })).status, 200);
  assert.equal((await call('GET', '/recruiter/me', { token: recruiter })).data.company.room_no, '');
  assert.equal((await page(desk3.id)).pending, true);
  assert.equal((await call('POST', '/admin/companies/999999/desk/free', { token: adminAuth })).status, 404);
  assert.equal((await call('POST', `/admin/companies/${desk.id}/desk/free`, { token: adminAuth })).status, 404);

  // The posters are already printed and on the desks, so organisers never hand out a desk: a desk
  // number they type (in the form or in Excel) is not used. The company links its desk itself.
  const typed = (room_no) => call('PUT', `/admin/companies/${first.id}`, { token: adminAuth, body: { name: 'Desk First Pvt Ltd', industry: 'Retail', roles: 'Cashier', room_no } });
  assert.equal((await typed('501')).data.room_no, '');
  assert.equal((await page(desk.id)).pending, true);
  assert.equal((await activate({ qr: qrOf(desk) })).data.company.room_no, '501');
  assert.equal((await typed('999')).data.room_no, '501'); // an edit by the organisers leaves the company's desk alone
  assert.equal((await page(desk.id)).name, 'Desk First Pvt Ltd');
  const added = await call('POST', '/admin/companies', { token: adminAuth, body: { name: 'Typed By Organiser', room_no: '503' } });
  assert.equal(added.status, 201);
  assert.deepEqual([added.data.room_no, added.data.desk_id, added.data.filled_desk], ['', null, undefined]);
  assert.match(added.data.access_code, /^[0-9A-HJKMNP-TV-Z]{8}$/); // handed to the company straight away
  assert.equal((await page(desk3.id)).pending, true);
  const form = new FormData();
  form.append('file', new Blob(['Company Name,Desk No\nFrom Excel Ltd,504\n'], { type: 'text/csv' }), 'companies.csv');
  assert.equal((await call('POST', '/admin/companies/import', { token: adminAuth, form })).data.added, 1);
  assert.equal((await page(desk4.id)).pending, true);
  const excelCode = (await adminList()).find((c) => c.name === 'From Excel Ltd').access_code;
  const excelLogin = (await call('POST', '/recruiter/login', { body: { code: excelCode } })).data.token;
  assert.equal((await activate({ qr: qrOf(desk4) }, excelLogin)).status, 200);
  assert.equal((await page(desk4.id)).name, 'From Excel Ltd');

  // A desk QR code stays a desk: it cannot be given a name or logged in to. Its number can be changed.
  assert.equal((await call('PUT', `/admin/companies/${desk4.id}`, { token: adminAuth, body: { name: 'Not A Company', room_no: '604', location: 'Hall C' } })).status, 200);
  const renumbered = (await adminList()).find((c) => c.id === desk4.id);
  assert.deepEqual([renumbered.name, renumbered.room_no], ['', '604']);
  assert.deepEqual([(await page(desk4.id)).room_no, (await page(desk4.id)).location], ['604', 'Hall C']); // its company follows
  assert.equal((await call('PUT', `/admin/companies/${desk4.id}`, { token: adminAuth, body: { room_no: '' } })).status, 400);
  assert.equal((await call('POST', '/recruiter/login', { body: { code: desk.access_code } })).status, 401);
  assert.equal((await call('POST', '/admin/companies', { token: adminAuth, body: { name: '', room_no: '' } })).status, 400);
  const single = await call('POST', '/admin/companies', { token: adminAuth, body: { name: '', room_no: 'B-7' } });
  assert.equal(single.status, 201);
  assert.equal(single.data.name, '');
  assert.equal((await call('PUT', `/admin/companies/${first.id}`, { token: adminAuth, body: { name: '', room_no: '5' } })).status, 400);

  // Deleting a desk QR code leaves its company without a desk
  assert.equal((await call('DELETE', `/admin/companies/${desk4.id}`, { token: adminAuth })).status, 200);
  const excel = (await adminList()).find((c) => c.name === 'From Excel Ltd');
  assert.deepEqual([excel.room_no, excel.desk_id], ['', null]);

  // A new company gets its desk only by scanning the desk QR code there: a desk number typed when
  // registering is ignored, and nothing else opens until it scans. After that it can move desks.
  assert.equal((await call('POST', '/admin/desks', { token: adminAuth, body: { from: 701, to: 703 } })).data.added, 3);
  const d701 = await deskAt('701');
  const d702 = await deskAt('702');
  const typedReg = await call('POST', `/public/company-register/${link}`, { body: { name: 'Typed Desk Co', room_no: '701', location: '1' } });
  assert.equal(typedReg.status, 201);
  assert.deepEqual([typedReg.data.company.room_no, typedReg.data.company.desk_id], ['', null]);
  assert.equal((await call('PUT', '/recruiter/company', { token: typedReg.data.token, body: { location: '1' } })).status, 403);
  const scanned = await call('POST', '/recruiter/desk', { token: typedReg.data.token, body: { qr: qrOf(d701), location: '1' } });
  assert.deepEqual([scanned.data.company.room_no, scanned.data.company.location, scanned.data.company.desk_id], ['701', 'Floor 1', d701.id]);
  assert.equal((await page(d701.id)).name, 'Typed Desk Co');
  // Another company scanning a desk that is taken is refused
  const lateReg = await call('POST', `/public/company-register/${link}`, { body: { name: 'Late Co' } });
  assert.equal(lateReg.status, 201);
  assert.match((await call('POST', '/recruiter/desk', { token: lateReg.data.token, body: { qr: qrOf(d701) } })).data.error, /Desk 701 is already activated by Typed Desk Co/);
  // In its details: another desk with its floor, only the floor, a taken desk, a desk that is not there, no desk
  const details = (body) => call('PUT', '/recruiter/company', { token: typedReg.data.token, body });
  const movedCo = (await details({ room_no: '702', location: 'Second floor, Block B' })).data.company;
  assert.deepEqual([movedCo.room_no, movedCo.location, movedCo.desk_id], ['702', 'Second floor, Block B', d702.id]);
  assert.equal((await page(d701.id)).pending, true);
  assert.equal((await page(d702.id)).location, 'Second floor, Block B');
  const floorOnly = (await details({ location: '3' })).data.company;
  assert.deepEqual([floorOnly.room_no, floorOnly.location, floorOnly.desk_id], ['702', 'Floor 3', d702.id]);
  assert.match((await details({ room_no: '502' })).data.error, /Desk 502 is already activated by Second Company/);
  assert.match((await details({ room_no: '888' })).data.fields.room_no, /There is no desk 888/);
  assert.equal((await call('GET', '/recruiter/me', { token: typedReg.data.token })).data.company.room_no, '702');
  const left = (await details({ room_no: '' })).data.company;
  assert.deepEqual([left.room_no, left.location, left.desk_id], ['', '', null]);
  assert.equal((await page(d702.id)).pending, true);
  // The activation sheet can carry the floor too
  const withFloor = (await call('POST', '/recruiter/desk', { token: typedReg.data.token, body: { desk_no: '703', location: 'Ground floor' } })).data.company;
  assert.deepEqual([withFloor.room_no, withFloor.location], ['703', 'Ground floor']);

  // A new registration link stops the old one
  const fresh = (await call('POST', '/admin/company-link/renew', { token: adminAuth })).data.code;
  assert.notEqual(fresh, link);
  assert.equal((await call('GET', `/public/company-register/${link}`)).status, 404);
  assert.equal((await call('GET', `/public/company-register/${fresh}`)).status, 200);
  assert.equal((await call('POST', '/admin/company-link/renew')).status, 401);
});

test('the website can live on another address than the server (Vercel and Railway)', async () => {
  const origin = 'https://jobfair.vercel.app';
  // The browser's question before a request that carries a login
  const ask = await fetch(`${base}/api/admin/companies`, {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type' },
  });
  assert.equal(ask.status, 204);
  assert.equal(ask.headers.get('access-control-allow-origin'), '*');
  assert.match(ask.headers.get('access-control-allow-headers'), /Authorization.*Content-Type/);
  assert.match(ask.headers.get('access-control-allow-methods'), /PUT/);

  // That website can read an answer, and the file name of a download
  const info = await fetch(`${base}/api/public/info`, { headers: { Origin: origin } });
  assert.equal(info.status, 200);
  assert.equal(info.headers.get('access-control-allow-origin'), '*');
  const sheet = await fetch(`${base}/api/admin/export/candidates`, { headers: { Origin: origin, Authorization: `Bearer ${adminAuth}` } });
  assert.equal(sheet.status, 200);
  assert.match(sheet.headers.get('access-control-expose-headers'), /Content-Disposition/);
  assert.match(sheet.headers.get('content-disposition'), /job-fair-candidates\.xlsx/);
  // Being on another address gives no extra rights: organiser pages still need the organiser login
  assert.equal((await fetch(`${base}/api/admin/companies`, { headers: { Origin: origin } })).status, 401);

  // CORS_ORIGIN limits the callers to the listed websites
  process.env.CORS_ORIGIN = 'https://jobfair.vercel.app/, https://fair.example.com';
  const { createApp } = await import('../src/app.js');
  const strict = createApp().listen(0);
  delete process.env.CORS_ORIGIN;
  await new Promise((resolve) => strict.once('listening', resolve));
  const at = `http://127.0.0.1:${strict.address().port}/api/public/info`;
  try {
    assert.equal((await fetch(at, { headers: { Origin: origin } })).headers.get('access-control-allow-origin'), origin);
    assert.equal((await fetch(at, { headers: { Origin: 'https://fair.example.com' } })).headers.get('access-control-allow-origin'), 'https://fair.example.com');
    assert.equal((await fetch(at, { headers: { Origin: 'https://elsewhere.example.com' } })).headers.get('access-control-allow-origin'), null);
  } finally {
    await new Promise((resolve) => strict.close(resolve));
  }
});

test('the queue at a desk: now serving, call next, and a missed token', async () => {
  const company = await addCompany({ name: 'Queue Works', roles: 'Helper' });
  const recruiter = (await call('POST', '/recruiter/login', { body: { code: company.access_code } })).data.token;
  const people = [];
  for (let i = 1; i <= 4; i += 1) {
    const reg = await call('POST', '/auth/register', { body: person({ full_name: `Queue Person ${i}`, mobile: `98451${String(i).padStart(5, '0')}`, email: `queue${i}@example.com` }) });
    assert.equal(reg.status, 201);
    const applied = await call('POST', `/companies/${company.id}/apply`, { token: reg.data.token, body: {} });
    assert.equal(applied.data.token_no, i);
    people.push({ token: reg.data.token, application: applied.data });
  }
  const place = async (i) => (await call('GET', `/companies/${company.id}`, { token: people[i].token })).data;
  assert.equal(people[2].application.queue.ahead, 2);
  assert.equal((await place(0)).now_serving, 0);

  const next = () => call('POST', '/recruiter/queue/next', { token: recruiter });
  assert.equal((await next()).data.called.token_no, 1);
  let page = await place(0);
  assert.deepEqual([page.now_serving, page.application.queue.state], [1, 'called']);
  assert.deepEqual([(await place(3)).application.queue.state, (await place(3)).application.queue.ahead], ['waiting', 2]);

  // Token 2 is not there: the company calls token 3 straight away, and 2 is missed
  const third = (await call('GET', '/recruiter/applications?q=3', { token: recruiter })).data.rows[0];
  const called = await call('POST', `/recruiter/applications/${third.id}/call`, { token: recruiter });
  assert.equal(called.data.queue.now_serving, 3);
  // Token 1 was called and left without a result, so it is missed as well
  assert.deepEqual(called.data.queue.missed.map((m) => m.token_no), [1, 2]);
  assert.equal((await place(1)).application.queue.state, 'missed');
  assert.equal((await place(3)).application.queue.ahead, 0);
  // Call next skips the missed token. Token 3 was called but left without a result, so once the
  // desk moves on, it is missed too.
  assert.equal((await next()).data.called.token_no, 4);
  assert.equal((await place(2)).application.queue.state, 'missed');
  assert.deepEqual((await call('GET', '/recruiter/me', { token: recruiter })).data.queue.missed.map((m) => m.token_no), [1, 2, 3]);
  await call('PUT', `/recruiter/applications/${third.id}`, { token: recruiter, body: { status: 'selected' } });
  assert.equal((await next()).status, 404);
  // Token 2 comes later and is called in, or given a result: either way not missed any more
  const second = called.data.queue.missed[1];
  const done = await call('PUT', `/recruiter/applications/${second.id}`, { token: recruiter, body: { status: 'interviewed' } });
  assert.deepEqual(done.data.queue.missed.map((m) => m.token_no), [1]);
  assert.equal((await place(1)).application.queue, null);
  // Another company cannot call these candidates in
  const other = await addCompany({ name: 'Queue Other' });
  const otherLogin = (await call('POST', '/recruiter/login', { body: { code: other.access_code } })).data.token;
  assert.equal((await call('POST', `/recruiter/applications/${second.id}/call`, { token: otherLogin })).status, 404);
});

test('interviews: start, rate questions, save the result, and the question list', async () => {
  const company = await addCompany({ name: 'Interview House', roles: 'Clerk' });
  const recruiter = (await call('POST', '/recruiter/login', { body: { code: company.access_code } })).data.token;
  const reg = await call('POST', '/auth/register', { body: person({ full_name: 'Rated Person', mobile: '9845200001', email: 'rated@example.com' }) });
  await call('POST', `/companies/${company.id}/apply`, { token: reg.data.token, body: {} });
  const row = (await call('GET', '/recruiter/applications', { token: recruiter })).data.rows[0];
  assert.equal(row.interview, null);

  // Suggested questions until the company changes them
  const me = (await call('GET', '/recruiter/me', { token: recruiter })).data.company;
  assert.equal(me.questions_custom, false);
  assert.ok(me.questions.length >= 5);

  // Starting the interview calls the candidate in
  const started = await call('POST', `/recruiter/applications/${row.id}/start`, { token: recruiter });
  assert.equal(started.status, 200);
  assert.equal(started.data.queue.now_serving, 1);
  assert.equal((await call('GET', `/public/companies/${company.id}`)).data.now_serving_started, true);
  assert.ok(started.data.interview.started_at);
  assert.equal((await call('GET', `/companies/${company.id}`, { token: reg.data.token })).data.application.queue.state, 'called');
  assert.equal((await call('GET', `/public/companies/${company.id}`)).data.now_serving_done, false); // interview going on

  // Ratings are optional; bad ones are dropped. The score is their average.
  const [q1, q2] = me.questions;
  const saved = await call('PUT', `/recruiter/applications/${row.id}/interview`, {
    token: recruiter,
    body: { ratings: [{ ...q1, rating: 4 }, { ...q2, rating: 5 }, { id: 'x', text: 'Bad', rating: 9 }], notes: 'Good fit', status: 'shortlisted' },
  });
  assert.equal(saved.status, 200);
  assert.deepEqual([saved.data.status, saved.data.interview.score, saved.data.interview.ratings.length], ['shortlisted', 4.5, 2]);
  const desk = (await call('GET', `/public/companies/${company.id}`)).data;
  assert.deepEqual([desk.now_serving, desk.now_serving_done], [1, true]); // interview done
  const after = (await call('GET', '/recruiter/applications', { token: recruiter })).data.rows[0];
  assert.deepEqual([after.status, after.interview.notes, after.interview.score], ['shortlisted', 'Good fit', 4.5]);
  assert.equal((await call('PUT', `/recruiter/applications/${row.id}/interview`, { token: recruiter, body: { status: 'maybe' } })).status, 400);
  assert.equal((await call('GET', '/recruiter/export', { token: recruiter })).status, 200);
  const one = await call('GET', `/recruiter/applications/${row.id}`, { token: recruiter });
  assert.deepEqual([one.data.row.full_name, one.data.row.token_no, one.data.row.interview.score, one.data.row.login_key], ['Rated Person', 1, 4.5, undefined]);

  // The company's own questions, kept for all its interviews; the saved ratings keep their wording
  const edited = await call('PUT', '/recruiter/questions', { token: recruiter, body: { questions: [{ id: q1.id, text: 'Introduce yourself' }, { text: 'Typing speed' }, { text: '' }] } });
  assert.deepEqual(edited.data.company.questions.map((q) => q.text), ['Introduce yourself', 'Typing speed']);
  assert.equal(edited.data.company.questions[0].id, q1.id);
  assert.equal(edited.data.company.questions_custom, true);
  assert.equal((await call('GET', '/recruiter/applications', { token: recruiter })).data.rows[0].interview.ratings[0].text, q1.text);
  assert.equal((await call('PUT', '/recruiter/questions', { token: recruiter, body: { questions: [{ text: 'Same' }, { text: 'same' }] } })).status, 400);
  const reset = await call('PUT', '/recruiter/questions', { token: recruiter, body: { reset: true } });
  assert.equal(reset.data.company.questions_custom, false);
  // Another company cannot touch this interview
  const other = await addCompany({ name: 'Interview Other' });
  const otherLogin = (await call('POST', '/recruiter/login', { body: { code: other.access_code } })).data.token;
  assert.equal((await call('POST', `/recruiter/applications/${row.id}/start`, { token: otherLogin })).status, 404);
  assert.equal((await call('GET', `/recruiter/applications/${row.id}`, { token: otherLogin })).status, 404);
  assert.equal((await call('PUT', `/recruiter/applications/${row.id}/interview`, { token: otherLogin, body: {} })).status, 404);
});

test('admin lists come one page at a time', async () => {
  const all = (await call('GET', '/admin/candidates', { token: adminAuth })).data;
  assert.ok(all.total >= 3);
  const first = (await call('GET', '/admin/candidates?limit=2', { token: adminAuth })).data;
  const second = (await call('GET', '/admin/candidates?limit=2&offset=2', { token: adminAuth })).data;
  assert.deepEqual([first.rows.length, first.total], [2, all.total]);
  assert.deepEqual(second.rows[0].id, all.rows[2].id);
  assert.equal((await call('GET', '/admin/candidates?limit=5000', { token: adminAuth })).data.rows.length, Math.min(100, all.total));
  const apps = (await call('GET', '/admin/applications?limit=1', { token: adminAuth })).data;
  assert.equal(apps.rows.length, 1);
  assert.ok(apps.total >= 1);
});

test('a candidate is not given the same token at two desks', async () => {
  const deskA = await addCompany({ name: 'Token Desk A', roles: 'Helper' });
  const deskB = await addCompany({ name: 'Token Desk B', roles: 'Helper' });
  const join = async (n) => {
    const reg = await call('POST', '/auth/register', { body: person({ full_name: `Token Person ${n}`, mobile: `98453${String(n).padStart(5, '0')}`, email: `token${n}@example.com` }) });
    return reg.data.token;
  };
  const apply = async (token, desk) => (await call('POST', `/companies/${desk.id}/apply`, { token, body: {} })).data.token_no;
  const asha = await join(1);
  const ravi = await join(2);
  const mala = await join(3);
  const tara = await join(4);

  assert.equal(await apply(asha, deskA), 1);
  // Desk B's next token would be 1, which Asha already has at desk A, and 2 is right after it: she gets 3
  assert.equal(await apply(asha, deskB), 3);
  // The skipped numbers go to the next people, in order
  assert.equal(await apply(ravi, deskB), 1);
  assert.equal(await apply(mala, deskB), 2);
  // Then the sequence carries on
  assert.equal(await apply(tara, deskB), 4);
  // No clash: the plain next number
  assert.equal(await apply(ravi, deskA), 3); // 2 is next to Ravi's token 1 at desk B, so he gets 3
  assert.equal(await apply(mala, deskA), 4); // 2 is still free, but Mala holds 2 at desk B; 3 is taken
  assert.equal(await apply(tara, deskA), 2);

  const tokensAt = async (desk) =>
    (await call('GET', `/admin/applications?company=${desk.id}`, { token: adminAuth })).data.rows.map((r) => r.token_no).sort((a, b) => a - b);
  assert.deepEqual(await tokensAt(deskA), [1, 2, 3, 4]);
  assert.deepEqual(await tokensAt(deskB), [1, 2, 3, 4]);
});
