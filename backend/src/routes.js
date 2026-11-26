import express from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import {
  NO_ID,
  RESUME_DIR,
  aiCourseLeads,
  applications,
  candidates,
  companies,
  companyLinkCode,
  getSettings,
  isDuplicate,
  newAccessCode,
  nextId,
  now,
  resetIds,
  setSetting,
} from './db.js';
import {
  ADMIN_USER,
  adminToken,
  candidateToken,
  checkAdmin,
  clearFailures,
  newLoginKey,
  recordFailure,
  recruiterToken,
  requireAdmin,
  requireCandidate,
  requireRecruiter,
  tooManyAttempts,
} from './auth.js';

export const router = express.Router();

// ───────────────────────── helpers ─────────────────────────

const STATUSES = ['applied', 'interviewed', 'shortlisted', 'selected', 'rejected'];
const STATUS_LABEL = {
  applied: 'Applied',
  interviewed: 'Interview done',
  shortlisted: 'Shortlisted',
  selected: 'Selected',
  rejected: 'Not selected',
};
const GENDERS = ['Male', 'Female', 'Other'];
const TIME_ZONE = process.env.TIME_ZONE || 'Asia/Kolkata';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const clean = (v, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanText = (v, max = 1000) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);
const regNo = (id) => `JF-${String(id).padStart(4, '0')}`;
const normMobile = (v) => String(v ?? '').replace(/[\s()-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '');
const toId = (v) => (/^\d{1,12}$/.test(String(v)) ? Number(v) : 0);
const isOff = (v) => v === false || v === 0 || v === '0' || v === 'false';
// One page of a long list: ?offset=&limit= (up to 100 at a time).
const pageOf = (query) => ({
  offset: Math.max(0, Number.parseInt(query.offset, 10) || 0),
  limit: Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 100)),
});

// Text searches: "contains" and "exactly, ignoring capitals".
const escapeRx = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const containing = (s) => new RegExp(escapeRx(s), 'i');
const sameText = (s) => new RegExp(`^${escapeRx(s)}$`, 'i');
const nocase = (a, b) => {
  const x = String(a).toLowerCase();
  const y = String(b).toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
};

// Counts of records grouped by one field: field value -> count.
async function countBy(collection, field, match = {}) {
  const rows = await collection.aggregate([{ $match: match }, { $group: { _id: `$${field}`, n: { $sum: 1 } } }]).toArray();
  return new Map(rows.map((r) => [r._id, r.n]));
}

// The ids of the desk QR codes that a company has activated.
const heldDesks = () => companies.distinct('desk_id', { desk_id: { $type: 'number' } });

function localTime(utc) {
  if (!utc) return '';
  return new Date(`${utc.replace(' ', 'T')}Z`).toLocaleString('en-IN', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function sendSheet(res, filename, sheetName, header, rows) {
  const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
  ws['!cols'] = header.map((h, i) => {
    const longest = rows.reduce((m, r) => Math.max(m, String(r[i] ?? '').length), String(h).length);
    return { wch: Math.min(48, Math.max(10, longest + 2)) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}

// ───────────────────────── settings ─────────────────────────

const TEXT_SETTINGS = {
  fair_name: 80,
  fair_time: 60,
  venue: 200,
  organiser: 160,
  contacts: 200,
  highlights: 300,
  eligibility: 500,
  notice: 500,
};

async function settingsOut() {
  const s = await getSettings();
  return {
    fair_name: s.fair_name,
    fair_date: s.fair_date,
    fair_time: s.fair_time,
    venue: s.venue,
    organiser: s.organiser,
    contacts: s.contacts,
    highlights: s.highlights,
    eligibility: s.eligibility,
    notice: s.notice,
    registration_open: s.registration_open === '1',
    applications_open: s.applications_open === '1',
    max_applications: Number(s.max_applications) || 0,
    site_url: s.site_url || '',
  };
}

// ───────────────────────── candidates ─────────────────────────

const CANDIDATE_COLS = [
  'full_name', 'mobile', 'email', 'gender', 'dob', 'pincode', 'city', 'qualification', 'specialization', 'college',
  'passing_year', 'percentage', 'experience_type', 'experience_years', 'last_company', 'last_role',
  'skills', 'languages', 'preferred_role',
];

function candidateOut(row) {
  const { _id, login_key: _key, resume_file, ...rest } = row;
  return { ...rest, reg_no: regNo(row.id), has_resume: Boolean(resume_file) };
}

const findCandidate = (id) => candidates.findOne({ id }, NO_ID);

function validateCandidate(body = {}) {
  const errors = {};
  const experienced = body.experience_type === 'experienced';
  const v = {
    full_name: clean(body.full_name, 80),
    mobile: normMobile(body.mobile).slice(0, 15),
    email: clean(body.email, 120).toLowerCase(),
    gender: clean(body.gender, 10),
    dob: clean(body.dob, 10),
    pincode: String(body.pincode ?? '').replace(/\D/g, '').slice(0, 6),
    city: clean(body.city, 60),
    qualification: clean(body.qualification, 80),
    specialization: clean(body.specialization, 80),
    college: clean(body.college, 120),
    passing_year: Number.parseInt(body.passing_year, 10),
    percentage: clean(body.percentage, 12),
    experience_type: experienced ? 'experienced' : 'fresher',
    experience_years: experienced ? Number.parseFloat(body.experience_years) : 0,
    last_company: experienced ? clean(body.last_company, 100) : '',
    last_role: experienced ? clean(body.last_role, 80) : '',
    skills: clean(body.skills, 300),
    languages: clean(body.languages, 120),
    preferred_role: clean(body.preferred_role, 120),
  };

  if (v.full_name.length < 2) errors.full_name = 'Enter your full name';
  // Only a 10-digit mobile number is accepted (a +91 or 0 typed in front has already been dropped).
  if (!/^\d{10}$/.test(v.mobile)) errors.mobile = 'Enter your 10-digit mobile number';
  else if (!/^[6-9]/.test(v.mobile)) errors.mobile = 'A mobile number starts with 6, 7, 8 or 9. Please check it.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) errors.email = 'Enter a valid email address';
  if (!GENDERS.includes(v.gender)) errors.gender = 'Select your gender';

  const dob = /^\d{4}-\d{2}-\d{2}$/.test(v.dob) ? new Date(`${v.dob}T00:00:00Z`) : null;
  if (!dob || Number.isNaN(dob.getTime())) {
    errors.dob = 'Enter your date of birth';
  } else {
    const age = (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (age < 15 || age > 70) errors.dob = 'Check your date of birth';
  }

  if (v.pincode && !/^[1-9]\d{5}$/.test(v.pincode)) errors.pincode = 'Enter your 6-digit pincode';
  if (!v.city) errors.city = 'Enter your city or town';
  if (!v.languages) errors.languages = 'Select at least one language';
  if (!v.qualification) errors.qualification = 'Select your highest qualification';
  if (!v.college) errors.college = 'Enter your college or institute';

  const thisYear = new Date().getFullYear();
  if (!Number.isInteger(v.passing_year) || v.passing_year < 1970 || v.passing_year > thisYear + 3) {
    errors.passing_year = 'Select the year of passing';
  }
  // Marks are required: any wording ("72%", "7.8 CGPA") with a sensible number in it.
  const marks = Number((/\d+(\.\d+)?/.exec(v.percentage) || [])[0]);
  if (!v.percentage) errors.percentage = 'Enter your percentage or CGPA';
  else if (!(marks > 0 && marks <= 100)) errors.percentage = 'Enter a percentage (like 72%) or a CGPA (like 7.8)';
  if (experienced && !(v.experience_years > 0 && v.experience_years <= 50)) {
    errors.experience_years = 'Enter your years of experience';
  }
  return { values: v, errors };
}

const RESUME_EXT = new Set(['.pdf', '.doc', '.docx']);
const resumeStore = multer({
  storage: multer.diskStorage({
    destination: RESUME_DIR,
    filename: (req, file, cb) =>
      cb(null, `${crypto.randomBytes(12).toString('hex')}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (RESUME_EXT.has(path.extname(file.originalname).toLowerCase())) return cb(null, true);
    cb(new Error('Resume must be a PDF, DOC or DOCX file'));
  },
});

function resumeUpload(req, res, next) {
  resumeStore.single('resume')(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Resume must be 2 MB or smaller' : err.message || 'Upload failed';
    res.status(400).json({ error: message, fields: { resume: message } });
  });
}

const removeResume = (name) => {
  if (name) fs.rm(path.join(RESUME_DIR, path.basename(name)), { force: true }, () => {});
};

function sendResume(res, row) {
  if (!row?.resume_file) return res.status(404).json({ error: 'No resume uploaded' });
  const file = path.join(RESUME_DIR, path.basename(row.resume_file));
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'The resume file is missing' });
  const safe = row.full_name.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'resume';
  res.download(file, `${regNo(row.id)}_${safe}${path.extname(row.resume_file)}`);
}

// ───────────────────────── companies ─────────────────────────

const COMPANY_COLS = [
  'name', 'industry', 'about', 'room_no', 'location', 'roles', 'eligibility', 'salary', 'vacancies',
  'job_location', 'website', 'active',
];

const findCompany = (id) => companies.findOne({ id }, NO_ID);

function parseRoles(input) {
  const list = Array.isArray(input) ? input : String(input ?? '').split(/[\n,;]/);
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const role = clean(item, 80);
    const key = role.toLowerCase();
    if (role && !seen.has(key)) {
      seen.add(key);
      out.push(role);
    }
  }
  return out.slice(0, 25);
}

// Returns '' when empty, null when it is not a usable web address.
function normUrl(input) {
  const raw = clean(input, 200);
  if (!raw) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return ['http:', 'https:'].includes(url.protocol) && url.hostname.includes('.') ? url.toString() : null;
  } catch {
    return null;
  }
}

// A company's job openings are kept in its "roles" field as a list of
// { id, title, description, openings, ctc, eligibility, location }: eligibility is who can apply
// for that job and location is where the job is. A plain title in the list (as typed by the
// organisers or brought over from older data) is read as a job with no details.
const JOB_DETAILS = ['title', 'description', 'openings', 'ctc', 'eligibility', 'location'];
const toCount = (v) => Math.max(0, Math.min(100000, Number.parseInt(v, 10) || 0));
const newJobId = () => `j${crypto.randomBytes(4).toString('hex')}`;
// A plain title has no id of its own, so it gets one worked out from the title: the same every time it is read.
const titleJobId = (title) => `t${crypto.createHash('sha1').update(title.toLowerCase()).digest('hex').slice(0, 8)}`;

function parseJobs(input) {
  let list = input;
  if (typeof input === 'string') {
    try {
      list = JSON.parse(input);
    } catch {
      list = [];
    }
  }
  if (!Array.isArray(list)) return [];
  const jobs = [];
  for (const item of list) {
    const plain = typeof item === 'string';
    const title = clean(plain ? item : item?.title, 80);
    if (!title) continue;
    jobs.push({
      id: (!plain && clean(item.id, 20)) || titleJobId(title),
      title,
      description: plain ? '' : cleanText(item.description, 1500),
      openings: plain ? 0 : toCount(item.openings),
      ctc: plain ? '' : clean(item.ctc, 80),
      eligibility: plain ? '' : clean(item.eligibility, 300),
      location: plain ? '' : clean(item.location, 120),
    });
  }
  return jobs;
}

// Organisers type only job titles (in the company form or in Excel). The description, open
// positions and CTC a company has already entered for a title are kept.
function jobsFromTitles(titles, existing = []) {
  const byTitle = new Map(existing.map((job) => [job.title.toLowerCase(), job]));
  return titles.map((title) => {
    const known = byTitle.get(title.toLowerCase());
    return known ? { ...known, title } : { id: newJobId(), title, description: '', openings: 0, ctc: '', eligibility: '', location: '' };
  });
}

// deskOnly: a desk QR code, which has a desk number and no name (see db.js).
function validateCompany(body = {}, existingJobs = [], { deskOnly = false } = {}) {
  const errors = {};
  const v = {
    name: clean(body.name, 120),
    industry: clean(body.industry, 60),
    about: cleanText(body.about, 1500),
    room_no: clean(body.room_no, 20),
    location: clean(body.location, 80),
    roles: jobsFromTitles(parseRoles(body.roles), existingJobs),
    eligibility: clean(body.eligibility, 300),
    salary: clean(body.salary, 80),
    vacancies: Math.max(0, Math.min(100000, Number.parseInt(body.vacancies, 10) || 0)),
    job_location: clean(body.job_location, 120),
    website: normUrl(body.website),
    active: !isOff(body.active),
  };
  const emptyDesk = deskOnly && !v.name && v.room_no;
  if (v.name.length < 2 && !emptyDesk) {
    errors.name = deskOnly ? 'Enter the desk number' : 'Enter the company name';
  }
  if (v.website === null) {
    errors.website = 'Enter a valid website address';
    v.website = '';
  }
  return { values: v, errors };
}

function companyOut(row) {
  const jobs = parseJobs(row.roles);
  // Once a company has entered open positions for its jobs, their total is the vacancy count.
  const openings = jobs.reduce((sum, job) => sum + job.openings, 0);
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    about: row.about,
    room_no: row.room_no,
    location: row.location,
    roles: jobs.map((job) => job.title),
    jobs,
    eligibility: row.eligibility,
    salary: row.salary,
    vacancies: openings || row.vacancies,
    job_location: row.job_location,
    website: row.website,
    active: Boolean(row.active),
    // The token the company has called in to its desk last (0: no one called yet), and whether
    // that interview is over (it has a result).
    now_serving: row.now_serving ?? 0,
    now_serving_started: Boolean(row.now_serving_started), // the company pressed Start interview
    now_serving_done: Boolean(row.now_serving_done),
  };
}

// Companies first (by name), then the desk QR codes (by desk number).
function companyOrder(a, b) {
  return (
    (a.name === '') - (b.name === '') ||
    nocase(a.name, b.name) ||
    (Number.parseInt(a.room_no, 10) || 0) - (Number.parseInt(b.room_no, 10) || 0) ||
    nocase(a.room_no, b.room_no)
  );
}

// Every candidate's phone asks for the company list again and again, so it is
// kept in memory for a few seconds instead of hitting the database each time.
const CACHE_MS = 5000;
let companyCache = null;

// When many phones ask at the same moment and the list is out of date, they all wait for one
// reading of the database instead of each starting its own.
let companyLoading = null;

async function allCompanies() {
  if (companyCache && Date.now() - companyCache.at < CACHE_MS) return companyCache.list;
  companyLoading ??= loadCompanies().finally(() => {
    companyLoading = null;
  });
  return (await companyLoading).list;
}

// Goes up whenever a company changes, so a reading that started before the change is not kept.
let companyVersion = 0;

async function loadCompanies() {
  const version = companyVersion;
  const [rows, applicants] = await Promise.all([companies.find({}, NO_ID).toArray(), countBy(applications, 'company_id')]);
  rows.sort(companyOrder);
  const cache = {
    at: Date.now(),
    list: rows.map((r) => {
      const company = companyOut(r);
      // Job descriptions can be long, so they are left out of this list and sent only with one company's page.
      return { ...company, jobs: company.jobs.map(({ description: _text, ...job }) => job), applicants: applicants.get(r.id) ?? 0 };
    }),
    // Which company has activated which desk QR code: desk id -> company id.
    holders: new Map(rows.filter((r) => r.desk_id).map((r) => [r.desk_id, r.id])),
  };
  if (version === companyVersion) companyCache = cache;
  else cache.at = 0; // out of date already: used for this answer only
  return cache;
}

// A desk QR code that a company has activated leads to that company; any other number is the company itself.
async function resolveCompany(id) {
  await allCompanies();
  return (companyCache ?? (await companyLoading) ?? (await loadCompanies())).holders.get(id) ?? id;
}

// The desk's queue changes all the time during the fair (every call and every result), so the
// company kept in memory is updated in place instead of reading every company again.
function patchCachedCompany(companyId, changes) {
  const entry = companyCache?.list.find((c) => c.id === companyId);
  if (entry) Object.assign(entry, changes);
}

function bumpApplicants(companyId, by) {
  const entry = companyCache?.list.find((c) => c.id === companyId);
  if (entry) entry.applicants = Math.max(0, entry.applicants + by);
}

const dropCompanyCache = () => {
  companyCache = null;
  companyVersion += 1;
  companyLoading = null; // the next request reads the database again
};

// Candidates only see a company that is switched on and has a name. A desk QR code is a record
// without a name, so it stays out of every candidate list.
const listed = (company) => company.active && company.name !== '';

// Adds a company or desk QR code and returns its id. A duplicate desk_id throws (see isDuplicate).
async function insertCompany(values) {
  const id = await nextId('companies');
  const t = now();
  await companies.insertOne({
    id,
    name: '',
    industry: '',
    about: '',
    room_no: '',
    location: '',
    roles: [],
    eligibility: '',
    salary: '',
    vacancies: 0,
    job_location: '',
    website: '',
    active: true,
    desk_id: null,
    ...Object.fromEntries(Object.entries(values).filter(([key]) => COMPANY_COLS.includes(key) || key === 'desk_id')),
    next_token: 1,
    access_code: await newAccessCode(),
    created_at: t,
  });
  return id;
}

// A new company typed in by the organisers (or uploaded from Excel). It never gets a desk here: the
// desk QR posters are already printed and on the desks, so the organisers hand the company its
// access code, and the company links the poster at its own desk by scanning it from its dashboard.
const addCompany = (values) => insertCompany({ ...values, room_no: '', location: '', desk_id: null });

// The page a candidate lands on after scanning the QR code at a desk (the id has already been
// through resolveCompany). A hidden company is only shown to a candidate who has already applied to it.
async function companyPage(id, application = null) {
  const list = await allCompanies();
  const company = list.find((c) => c.id === id && (c.active || application));
  if (!company) return null;
  // A desk QR code that no company has activated yet.
  if (!company.name) return { id: company.id, pending: true, room_no: company.room_no, location: company.location };
  const room = company.room_no.toLowerCase();
  const others = room
    ? list
        .filter((c) => listed(c) && c.id !== company.id && c.room_no.toLowerCase() === room)
        .map((c) => ({ id: c.id, name: c.name, industry: c.industry }))
    : [];
  const full = await companies.findOne({ id }, { projection: { _id: 0, roles: 1 } });
  return { ...company, jobs: parseJobs(full?.roles), others };
}

// ───────────────────────── public ─────────────────────────

router.get(
  '/public/info',
  wrap(async (req, res) => {
    const list = (await allCompanies()).filter(listed).map((c) => ({ name: c.name, industry: c.industry }));
    res.json({ ...(await settingsOut()), companies: list });
  }),
);

// Pincode → areas, district and state, from the India Post pincode service. Used to fill in
// City / town on the registration form. Answers are kept for a day; the list rarely changes.
const pincodeCache = new Map();
router.get(
  '/public/pincode/:pin',
  wrap(async (req, res) => {
    const pin = req.params.pin;
    if (!/^[1-9]\d{5}$/.test(pin)) return res.status(400).json({ error: 'Enter a 6-digit pincode' });
    const hit = pincodeCache.get(pin);
    if (hit && hit.at > Date.now() - 86400000) return res.json(hit.data);
    let list;
    try {
      const r = await fetch(`https://api.postalpincode.in/pincode/${pin}`, { signal: AbortSignal.timeout(6000) });
      list = (await r.json())?.[0];
    } catch {
      return res.status(502).json({ error: 'Could not look up the pincode right now. Please type your city.' });
    }
    const offices = list?.Status === 'Success' ? list.PostOffice || [] : [];
    if (!offices.length) return res.status(404).json({ error: 'This pincode was not found. Please check it.' });
    const data = {
      pincode: pin,
      district: offices[0].District,
      state: offices[0].State,
      areas: [...new Set(offices.map((o) => o.Name))].sort(),
    };
    if (pincodeCache.size > 5000) pincodeCache.clear();
    pincodeCache.set(pin, { at: Date.now(), data });
    res.json(data);
  }),
);

router.get(
  '/public/companies/:id',
  wrap(async (req, res) => {
    const page = await companyPage(await resolveCompany(toId(req.params.id)));
    if (!page) return res.status(404).json({ error: 'This company is not in the list' });
    res.json(page);
  }),
);

router.post(
  '/auth/register',
  resumeUpload,
  wrap(async (req, res) => {
    const discard = () => removeResume(req.file?.filename);
    if ((await getSettings()).registration_open !== '1') {
      discard();
      return res.status(403).json({ error: 'Registration is closed right now' });
    }

    const { values, errors } = validateCandidate(req.body);
    if (!errors.mobile && (await candidates.findOne({ mobile: values.mobile }))) {
      errors.mobile = 'This mobile number is already registered. Please log in.';
    }
    if (!errors.email && (await candidates.findOne({ email: values.email }))) {
      errors.email = 'This email is already registered. Please log in.';
    }
    if (Object.keys(errors).length) {
      discard();
      return res.status(400).json({ error: 'Please check the highlighted fields', fields: errors });
    }

    const row = {
      id: await nextId('candidates'),
      ...values,
      login_key: newLoginKey(), // there is no password; see auth.js
      resume_file: req.file?.filename ?? null,
      resume_name: req.file ? clean(req.file.originalname, 120) : null,
      created_at: now(),
    };
    try {
      await candidates.insertOne(row);
    } catch (err) {
      discard();
      if (isDuplicate(err)) {
        return res.status(400).json({ error: 'This mobile number or email is already registered. Please log in.' });
      }
      throw err;
    }
    // Interested in the Government Certified AI Course: save their details in a separate list.
    if (String(req.body.ai_course) === 'yes') {
      const { login_key, resume_file, resume_name, id, created_at, ...details } = row;
      await aiCourseLeads.updateOne(
        { candidate_id: id },
        { $setOnInsert: { candidate_id: id, ...details, created_at } },
        { upsert: true },
      );
    }
    res.status(201).json({ token: candidateToken(row), candidate: candidateOut(row) });
  }),
);

// A candidate logs in with the mobile number they registered with. There is no password.
// Everyone at the venue may share one internet address, so the limit on numbers that are not
// registered is per address and generous (300 in 15 minutes): enough to stop a program that
// tries numbers one after another, without ever locking out a busy hall.
router.post(
  '/auth/login',
  wrap(async (req, res) => {
    const key = `c|${req.ip}`;
    if (tooManyAttempts(key, 300)) {
      return res.status(429).json({ error: 'Too many wrong attempts. Please try again after 15 minutes.' });
    }
    const mobile = normMobile(req.body?.mobile ?? req.body?.login);
    if (!/^[6-9]\d{9}$/.test(mobile)) {
      return res.status(400).json({ error: 'Enter your 10-digit mobile number' });
    }
    const row = await candidates.findOne({ mobile }, NO_ID);
    if (!row) {
      recordFailure(key);
      return res.status(404).json({ error: 'This mobile number is not registered. Check the number, or register first.' });
    }
    res.json({ token: candidateToken(row), candidate: candidateOut(row) });
  }),
);

// ───────────────────────── candidate area ─────────────────────────

router.get('/me', requireCandidate, (req, res) => res.json(candidateOut(req.candidate)));

router.put(
  '/me',
  requireCandidate,
  wrap(async (req, res) => {
    const me = req.candidate;
    const { values, errors } = validateCandidate(req.body);
    if (!errors.mobile && (await candidates.findOne({ mobile: values.mobile, id: { $ne: me.id } }))) {
      errors.mobile = 'This mobile number is used by another registration';
    }
    if (!errors.email && (await candidates.findOne({ email: values.email, id: { $ne: me.id } }))) {
      errors.email = 'This email is used by another registration';
    }
    if (Object.keys(errors).length) {
      return res.status(400).json({ error: 'Please check the highlighted fields', fields: errors });
    }
    await candidates.updateOne({ id: me.id }, { $set: values });
    res.json(candidateOut(await findCandidate(me.id)));
  }),
);

router.post(
  '/me/resume',
  requireCandidate,
  resumeUpload,
  wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Choose a resume file to upload' });
    await candidates.updateOne(
      { id: req.candidate.id },
      { $set: { resume_file: req.file.filename, resume_name: clean(req.file.originalname, 120) } },
    );
    removeResume(req.candidate.resume_file);
    res.json(candidateOut(await findCandidate(req.candidate.id)));
  }),
);

router.get('/me/resume', requireCandidate, (req, res) => sendResume(res, req.candidate));

const APPLICATION_OUT = { _id: 0, id: 1, role: 1, token_no: 1, status: 1, created_at: 1, called_at: 1 };

// ───────────────────────── the queue at a desk ─────────────────────────
// The company calls candidates in by token. "Call next" takes the lowest waiting token after the
// one being served, so a candidate who is not there does not hold up the queue: their token is
// "missed", and the company calls them in by their token when they come.
// A waiting candidate: has a token, no result yet, and has not been called in.
const waitingFilter = (companyId) => ({ company_id: companyId, status: 'applied', called_at: null });

// A candidate still without a result whose turn has gone by: a later token was called while they
// were not there, or they were called in but the company has moved on to another token without
// giving them a result. They are called in again by their token.
const missedFilter = (companyId, serving) => ({
  company_id: companyId,
  status: 'applied',
  token_no: { $ne: serving },
  $or: [{ called_at: { $ne: null } }, { token_no: { $lt: serving } }],
});

// Where one candidate stands in the queue of a company that is serving token `serving`.
async function queuePlace(application, serving) {
  if (!application || application.status !== 'applied') return null;
  if (application.called_at && application.token_no === serving) return { state: 'called', ahead: 0 };
  if (application.called_at || application.token_no < serving) return { state: 'missed', ahead: 0 };
  const ahead = await applications.countDocuments({
    ...waitingFilter(application.company_id ?? 0),
    token_no: { $gt: serving, $lt: application.token_no },
  });
  return { state: 'waiting', ahead };
}

// The company's own view of its queue.
async function queueOf(companyId) {
  const company = await companies.findOne({ id: companyId }, { projection: { _id: 0, now_serving: 1 } });
  const serving = company?.now_serving ?? 0;
  const [current, next, missed, waiting] = await Promise.all([
    serving ? applications.findOne({ company_id: companyId, token_no: serving }, { projection: { _id: 0, id: 1, candidate_id: 1 } }) : null,
    applications.findOne({ ...waitingFilter(companyId), token_no: { $gt: serving } }, { projection: { _id: 0, token_no: 1 }, sort: { token_no: 1 } }),
    applications.find(missedFilter(companyId, serving), { projection: { _id: 0, id: 1, token_no: 1 }, sort: { token_no: 1 } }).toArray(),
    applications.countDocuments({ ...waitingFilter(companyId), token_no: { $gt: serving } }),
  ]);
  let name = '';
  if (current) name = (await candidates.findOne({ id: current.candidate_id }, { projection: { _id: 0, full_name: 1 } }))?.full_name ?? '';
  return {
    now_serving: serving,
    now_serving_name: name,
    next_token: next?.token_no ?? null,
    waiting,
    missed: missed.map((m) => ({ id: m.id, token_no: m.token_no })),
  };
}

// Calls one candidate in: their token is the one now being served.
async function callIn(application) {
  const t = now();
  await applications.updateOne({ id: application.id }, { $set: { called_at: t, updated_at: t } });
  await companies.updateOne(
    { id: application.company_id },
    {
      $set: {
        now_serving: application.token_no,
        now_serving_at: t,
        now_serving_started: Boolean(application.interview?.started_at),
        now_serving_done: application.status !== 'applied',
      },
    },
  );
  patchCachedCompany(application.company_id, {
    now_serving: application.token_no,
    now_serving_started: Boolean(application.interview?.started_at),
    now_serving_done: application.status !== 'applied',
  });
}

// After a result is given: if it is the token at the desk, its interview shows as done to everyone.
async function resultGiven(companyId, tokenNo, status) {
  const changed = await companies.updateOne({ id: companyId, now_serving: tokenNo }, { $set: { now_serving_done: status !== 'applied' } });
  if (changed.matchedCount) patchCachedCompany(companyId, { now_serving_done: status !== 'applied' });
}

router.get(
  '/companies',
  requireCandidate,
  wrap(async (req, res) => {
    const rows = await applications
      .find({ candidate_id: req.candidate.id }, { projection: { ...APPLICATION_OUT, company_id: 1 } })
      .toArray();
    const list = await allCompanies();
    const serving = new Map(list.map((c) => [c.id, c.now_serving]));
    const mine = new Map(
      await Promise.all(
        rows.map(async ({ company_id, ...application }) => [
          company_id,
          { ...application, queue: await queuePlace({ ...application, company_id }, serving.get(company_id) ?? 0) },
        ]),
      ),
    );
    res.json(list.filter((c) => listed(c) || mine.has(c.id)).map((c) => ({ ...c, application: mine.get(c.id) ?? null })));
  }),
);

router.get(
  '/companies/:id',
  requireCandidate,
  wrap(async (req, res) => {
    const id = await resolveCompany(toId(req.params.id));
    const found = await applications.findOne({ candidate_id: req.candidate.id, company_id: id }, { projection: APPLICATION_OUT });
    const page = await companyPage(id, found);
    if (!page) return res.status(404).json({ error: 'This company is not in the list' });
    const application = found ? { ...found, queue: await queuePlace({ ...found, company_id: id }, page.now_serving ?? 0) } : null;
    res.json({ ...page, application });
  }),
);

router.post(
  '/companies/:id/apply',
  requireCandidate,
  wrap(async (req, res) => {
    const settings = await getSettings();
    if (settings.applications_open !== '1') {
      return res.status(403).json({ error: 'Applications are closed right now' });
    }
    const candidateId = req.candidate.id;
    const company = await companies.findOne(
      { id: await resolveCompany(toId(req.params.id)), active: true, name: { $ne: '' } },
      NO_ID,
    );
    if (!company) return res.status(404).json({ error: 'This company is no longer in the list' });

    const already = () => res.status(409).json({ error: 'You have already applied to this company' });
    if (await applications.findOne({ candidate_id: candidateId, company_id: company.id })) return already();
    const limit = Number(settings.max_applications) || 0;
    if (limit > 0) {
      const used = await applications.countDocuments({ candidate_id: candidateId });
      if (used >= limit) {
        return res.status(400).json({ error: `You can apply to a maximum of ${limit} companies` });
      }
    }

    const roles = companyOut(company).roles;
    let role = clean(req.body?.role, 80);
    if (roles.length === 1) role = roles[0];
    else if (roles.length === 0) role = '';
    else if (!roles.includes(role)) {
      return res.status(400).json({ error: 'Choose the role you want to apply for' });
    }

    // The candidate's token here (see takeToken). The unique index on the token is a last safety net.
    const t = now();
    let application = null;
    let duplicate = false;
    // Worked out before taking a turn, so each turn is short: the candidate's tokens at other desks
    // still waiting, and the application's own number.
    const [mine, applicationId] = await Promise.all([
      applications.distinct('token_no', { candidate_id: candidateId, company_id: { $ne: company.id }, status: 'applied' }),
      nextId('applications'),
    ]);
    await oneAtATime(company.id, async () => {
    for (let attempt = 0; attempt < 5 && !application && !duplicate; attempt += 1) {
      const token_no = await takeToken(company.id, mine);
      if (!token_no) break;
      const candidateApp = {
        id: applicationId,
        candidate_id: candidateId,
        company_id: company.id,
        role,
        token_no,
        status: 'applied',
        called_at: null,
        created_at: t,
        updated_at: t,
      };
      try {
        await applications.insertOne(candidateApp);
        application = candidateApp;
      } catch (err) {
        if (!isDuplicate(err)) throw err;
        if (err.keyPattern?.candidate_id) {
          // The same candidate pressed Apply twice at once: the number goes to the next person instead.
          await companies.updateOne({ id: company.id }, { $addToSet: { skipped_tokens: token_no } });
          duplicate = true;
        }
      }
    }
    });
    if (duplicate) return already();
    if (!application) return res.status(503).json({ error: 'Many people are applying right now. Please try again.' });
    bumpApplicants(company.id, 1);
    const { id, token_no, status, created_at } = application;
    const queue = await queuePlace(application, company.now_serving ?? 0);
    res.status(201).json({ id, role, token_no, status, created_at, called_at: null, queue });
  }),
);

// Applications to the same company take turns inside this server (each takes a few milliseconds),
// so hundreds of people applying to one desk at once do not keep getting in each other's way.
const turns = new Map();
async function oneAtATime(key, fn) {
  const before = turns.get(key) ?? Promise.resolve();
  let done;
  const mine = new Promise((resolve) => {
    done = resolve;
  });
  const last = before.then(() => mine);
  turns.set(key, last);
  await before;
  try {
    return await fn();
  } finally {
    done();
    if (turns.get(key) === last) turns.delete(key);
  }
}

// The token a candidate gets at a desk. Tokens go 1, 2, 3 ... in the order people apply, except
// that a number within 1 of a token the candidate already holds at another desk (still waiting
// there) is skipped, so two desks do not call the same person at the same moment: they get +2 or
// +3 instead. A skipped number is kept and given to the next person who applies, as long as the
// desk has not passed it yet. A number that was given out and then withdrawn is never given again.
// Every change to the counter is conditional on what was read, so two people applying at the same
// moment never get the same number; the loser of such a race simply tries again.
// `mine`: the tokens the candidate holds at other desks, still waiting there.
async function takeToken(companyId, mine) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const company = await companies.findOne({ id: companyId }, { projection: { _id: 0, next_token: 1, now_serving: 1, skipped_tokens: 1 } });
    if (!company) return 0;
    const serving = company.now_serving ?? 0;
    const near = (n) => mine.some((t) => Math.abs(t - n) <= 1);
    // A number skipped earlier, if one suits this candidate
    const free = (company.skipped_tokens ?? []).filter((n) => n > serving && !near(n)).sort((a, b) => a - b)[0];
    if (free !== undefined) {
      const taken = await companies.updateOne({ id: companyId, skipped_tokens: free }, { $pull: { skipped_tokens: free } });
      if (taken.modifiedCount) return free;
      continue;
    }
    // Otherwise the next new number, skipping any that are too close to the candidate's other tokens
    const first = Math.max(company.next_token ?? 1, serving + 1);
    let n = first;
    const skipped = [];
    while (near(n)) skipped.push(n++);
    // One update: the counter moves on, and the skipped list keeps the numbers still of use
    // (the desk has not passed them) plus the ones skipped now.
    const keep = [...new Set([...(company.skipped_tokens ?? []).filter((k) => k > serving), ...skipped])];
    const moved = await companies.updateOne(
      { id: companyId, next_token: company.next_token ?? { $exists: false }, skipped_tokens: company.skipped_tokens ?? { $exists: false } },
      { $set: { next_token: n + 1, skipped_tokens: keep } },
    );
    if (!moved.modifiedCount) continue;
    return n;
  }
  return 0;
}

router.delete(
  '/applications/:id',
  requireCandidate,
  wrap(async (req, res) => {
    const row = await applications.findOne({ id: toId(req.params.id), candidate_id: req.candidate.id });
    if (!row) return res.status(404).json({ error: 'Application not found' });
    if (row.status !== 'applied') {
      return res.status(400).json({ error: 'This application is already being processed and cannot be withdrawn' });
    }
    await applications.deleteOne({ id: row.id });
    bumpApplicants(row.company_id, -1);
    res.json({ ok: true });
  }),
);

// ───────────────────────── admin ─────────────────────────

router.post('/admin/login', (req, res) => {
  const username = clean(req.body?.username, 60);
  const password = String(req.body?.password ?? '');
  const key = `a|${req.ip}|${username.toLowerCase()}`;
  if (tooManyAttempts(key)) {
    return res.status(429).json({ error: 'Too many wrong attempts. Please try again after 15 minutes.' });
  }
  if (!checkAdmin(username, password)) {
    recordFailure(key);
    return res.status(401).json({ error: 'Wrong username or password' });
  }
  clearFailures(key);
  res.json({ token: adminToken(), username: ADMIN_USER });
});

const statusSum = (status) => ({ $sum: { $cond: [{ $eq: ['$status', status] }, 1, 0] } });

// Numbers for the charts on the admin overview. Candidate details are bucketed here in one pass
// (a job fair has thousands of candidates at most). Days and hours are in the fair's time zone.
const dayHour = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
function localParts(utc) {
  const p = Object.fromEntries(dayHour.formatToParts(new Date(`${utc.replace(' ', 'T')}Z`)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) };
}
function topCounts(values, limit) {
  const m = new Map();
  for (const raw of values) {
    const v = String(raw ?? '').trim();
    if (!v) continue;
    const key = v.toLowerCase();
    const hit = m.get(key) || { label: v, value: 0 };
    hit.value += 1;
    m.set(key, hit);
  }
  const all = [...m.values()].sort((a, b) => b.value - a.value || nocase(a.label, b.label));
  if (all.length <= limit) return all;
  const rest = all.slice(limit - 1).reduce((n, x) => n + x.value, 0);
  return [...all.slice(0, limit - 1), { label: 'Other', value: rest, other: true }];
}

async function overviewCharts(appliedIds, named) {
  const [rows, aiCount, perCandidate, appTimes] = await Promise.all([
    candidates
      .find({}, { projection: { _id: 0, id: 1, created_at: 1, qualification: 1, gender: 1, experience_type: 1, experience_years: 1, passing_year: 1, city: 1, dob: 1, resume_file: 1, languages: 1 } })
      .toArray(),
    aiCourseLeads.countDocuments(),
    applications.aggregate([{ $group: { _id: '$candidate_id', n: { $sum: 1 } } }, { $group: { _id: '$n', people: { $sum: 1 } } }]).toArray(),
    applications.find({}, { projection: { _id: 0, created_at: 1 } }).toArray(),
  ]);

  const today = localParts(new Date().toISOString().replace('T', ' ').slice(0, 19)).day;
  const byDay = new Map();
  const byHour = Array.from({ length: 24 }, () => 0);
  const ages = { 'Under 20': 0, '20–24': 0, '25–29': 0, '30–34': 0, '35+': 0 };
  const now = Date.now();
  let resumes = 0;
  for (const r of rows) {
    if (r.created_at) {
      const { day, hour } = localParts(r.created_at);
      byDay.set(day, (byDay.get(day) || 0) + 1);
      if (day === today) byHour[hour] += 1;
    }
    const dob = /^\d{4}-\d{2}-\d{2}$/.test(r.dob || '') ? Date.parse(`${r.dob}T00:00:00Z`) : NaN;
    if (!Number.isNaN(dob)) {
      const age = (now - dob) / (365.25 * 86400000);
      ages[age < 20 ? 'Under 20' : age < 25 ? '20–24' : age < 30 ? '25–29' : age < 35 ? '30–34' : '35+'] += 1;
    }
    if (r.resume_file) resumes += 1;
  }
  // Applications per day, same days as registrations when possible.
  const appsByDay = new Map();
  const appsByHour = Array.from({ length: 24 }, () => 0);
  for (const a of appTimes) {
    if (!a.created_at) continue;
    const { day, hour } = localParts(a.created_at);
    appsByDay.set(day, (appsByDay.get(day) || 0) + 1);
    if (day === today) appsByHour[hour] += 1;
  }
  for (const d of appsByDay.keys()) if (!byDay.has(d)) byDay.set(d, 0);
  // Year of passing: the last 8 years one by one, older ones together.
  const thisYear = new Date().getFullYear();
  const years = new Map();
  for (const r of rows) {
    const y = Number(r.passing_year);
    if (!y) continue;
    const key = y < thisYear - 6 ? `Before ${thisYear - 6}` : String(y);
    years.set(key, (years.get(key) || 0) + 1);
  }
  const yearOrder = [`Before ${thisYear - 6}`, ...Array.from({ length: 10 }, (_, i) => String(thisYear - 6 + i))];
  const passing = yearOrder.filter((k) => years.has(k)).map((label) => ({ label, value: years.get(label) }));
  const exp = { Fresher: 0, 'Under 1 yr': 0, '1–2 yrs': 0, '3–5 yrs': 0, '6–10 yrs': 0, '10+ yrs': 0 };
  for (const r of rows) {
    const y = Number(r.experience_years) || 0;
    exp[r.experience_type !== 'experienced' ? 'Fresher' : y < 1 ? 'Under 1 yr' : y <= 2 ? '1–2 yrs' : y <= 5 ? '3–5 yrs' : y <= 10 ? '6–10 yrs' : '10+ yrs'] += 1;
  }

  // The last 14 days that had registrations, oldest first, with empty days in between filled in.
  const days = [...byDay.keys()].sort();
  const timeline = [];
  if (days.length) {
    const end = new Date(`${days[days.length - 1]}T00:00:00Z`);
    const start = new Date(Math.max(Date.parse(`${days[0]}T00:00:00Z`), end - 13 * 86400000));
    for (let d = start; d <= end; d = new Date(d.getTime() + 86400000)) {
      const key = d.toISOString().slice(0, 10);
      timeline.push({ day: key, value: byDay.get(key) || 0, applications: appsByDay.get(key) || 0 });
    }
  }

  const applied = new Set(appliedIds);
  const spread = Object.fromEntries(perCandidate.map((x) => [x._id, x.people]));
  return {
    registrations_by_day: timeline,
    registrations_today_by_hour: byHour,
    applications_today_by_hour: appsByHour,
    passing_year: passing,
    experience: Object.entries(exp).map(([label, value]) => ({ label, value })),
    today,
    candidates: {
      total: rows.length,
      applied: rows.filter((r) => applied.has(r.id)).length,
      with_resume: resumes,
      ai_course: aiCount,
      freshers: rows.filter((r) => r.experience_type !== 'experienced').length,
    },
    applications_per_candidate: [
      { label: 'Not applied', value: rows.length - applied.size },
      { label: '1 company', value: spread[1] || 0 },
      { label: '2 companies', value: spread[2] || 0 },
      { label: '3–4 companies', value: (spread[3] || 0) + (spread[4] || 0) },
      { label: '5+ companies', value: Object.entries(spread).filter(([n]) => Number(n) >= 5).reduce((a, [, v]) => a + v, 0) },
    ],
    qualification: topCounts(rows.map((r) => r.qualification), 8),
    city: topCounts(rows.map((r) => (r.city || '').split(',')[0]), 8),
    gender: topCounts(rows.map((r) => r.gender), 4),
    age: Object.entries(ages).map(([label, value]) => ({ label, value })),
    languages: topCounts(rows.flatMap((r) => (r.languages || '').split(',')), 8),
    industry: topCounts(named.map((c) => c.industry), 8),
    companies: {
      total: named.length,
      listed: named.filter((c) => c.active).length,
      with_desk: named.filter((c) => c.room_no).length,
      with_applicants: 0, // filled in by the caller
    },
  };
}

router.get(
  '/admin/overview',
  requireAdmin,
  wrap(async (req, res) => {
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0]));
    for (const [status, n] of await countBy(applications, 'status')) byStatus[status] = n;

    const [named, perCompany, recent, candidateCount, appliedCandidates, held, settings] = await Promise.all([
      companies.find({ name: { $ne: '' } }, { projection: { _id: 0, id: 1, name: 1, room_no: 1, active: 1, industry: 1 } }).toArray(),
      applications
        .aggregate([
          {
            $group: {
              _id: '$company_id',
              applicants: { $sum: 1 },
              waiting: statusSum('applied'),
              interviewed: statusSum('interviewed'),
              shortlisted: statusSum('shortlisted'),
              selected: statusSum('selected'),
            },
          },
        ])
        .toArray(),
      candidates
        .find({}, { projection: { _id: 0, id: 1, full_name: 1, qualification: 1, city: 1, created_at: 1 }, sort: { id: -1 }, limit: 6 })
        .toArray(),
      candidates.countDocuments(),
      applications.distinct('candidate_id'),
      heldDesks(),
      getSettings(),
    ]);
    const counts = new Map(perCompany.map(({ _id, ...c }) => [_id, c]));
    const none = { applicants: 0, waiting: 0, interviewed: 0, shortlisted: 0, selected: 0 };
    const list = named
      .map((c) => ({ ...c, ...(counts.get(c.id) ?? none), active: Boolean(c.active) }))
      .sort((a, b) => b.applicants - a.applicants || nocase(a.name, b.name));
    const charts = await overviewCharts(appliedCandidates, named);
    charts.companies.with_applicants = list.filter((c) => c.applicants > 0).length;

    res.json({
      totals: {
        candidates: candidateCount,
        applied_candidates: appliedCandidates.length,
        companies: list.length,
        // Desk QR codes that no company has activated yet.
        empty_desks: await companies.countDocuments({ name: '', id: { $nin: held } }),
        applications: Object.values(byStatus).reduce((a, b) => a + b, 0),
        ...byStatus,
      },
      companies: list,
      charts,
      recent: recent.map((r) => ({ ...r, reg_no: regNo(r.id) })),
      demo_data: settings.demo_data === '1',
    });
  }),
);

// Companies

router.get(
  '/admin/companies',
  requireAdmin,
  wrap(async (req, res) => {
    dropCompanyCache();
    // Access codes are only ever sent to the organisers, never to candidates.
    const all = await companies.find({}, { projection: { _id: 0, id: 1, name: 1, access_code: 1, desk_id: 1 } }).toArray();
    const rows = new Map(all.map((r) => [r.id, r]));
    // For a desk QR code: the company that has activated it.
    const holders = new Map(all.filter((r) => r.desk_id).map((r) => [r.desk_id, { id: r.id, name: r.name }]));
    res.json(
      (await allCompanies()).map((c) => {
        const row = rows.get(c.id);
        return { ...c, access_code: row.access_code, desk_id: row.desk_id ?? null, holder: holders.get(c.id) ?? null };
      }),
    );
  }),
);

router.post(
  '/admin/companies',
  requireAdmin,
  wrap(async (req, res) => {
    // With no name and a desk number, this adds one desk QR code.
    const isDeskOnly = !clean(req.body?.name);
    const { values, errors } = validateCompany(req.body, [], { deskOnly: isDeskOnly });
    if (Object.keys(errors).length) {
      return res.status(400).json({ error: Object.values(errors)[0], fields: errors });
    }
    const id = isDeskOnly ? await insertCompany(values) : await addCompany(values);
    dropCompanyCache();
    const row = await findCompany(id);
    // The access code comes back straight away, so the organisers can hand it to the company.
    res.status(201).json({ ...companyOut(row), access_code: row.access_code, desk_id: null, holder: null });
  }),
);

// Desk QR codes in one go ("desks 1 to 40"), so the posters can be printed before any company
// has arrived. Numbers already in use are left alone.
const deskNumber = (v) => (/^\d{1,4}$/.test(String(v ?? '').trim()) ? Number(v) : 0);

router.post(
  '/admin/desks',
  requireAdmin,
  wrap(async (req, res) => {
    const body = req.body ?? {};
    const from = deskNumber(body.from);
    const to = deskNumber(body.to);
    const errors = {};
    if (!from) errors.from = 'Enter the first desk number';
    if (!to) errors.to = 'Enter the last desk number';
    else if (from && to < from) errors.to = 'The last desk number must not be smaller than the first';
    else if (from && to - from >= 300) errors.to = 'Add up to 300 desks at a time';
    if (Object.keys(errors).length) {
      return res.status(400).json({ error: Object.values(errors)[0], fields: errors });
    }
    const location = clean(body.location, 80);
    const taken = new Set((await companies.distinct('room_no')).map((r) => r.toLowerCase()));
    const skipped = [];
    let added = 0;
    for (let n = from; n <= to; n += 1) {
      if (taken.has(String(n))) {
        skipped.push(String(n));
        continue;
      }
      await insertCompany(validateCompany({ room_no: String(n), location }, [], { deskOnly: true }).values);
      added += 1;
    }
    dropCompanyCache();
    res.status(201).json({ added, skipped });
  }),
);

router.put(
  '/admin/companies/:id',
  requireAdmin,
  wrap(async (req, res) => {
    const id = toId(req.params.id);
    const current = await findCompany(id);
    if (!current) return res.status(404).json({ error: 'Company not found' });
    // A desk QR code stays a desk QR code, and a company stays a company.
    const isDesk = current.name === '';
    const { values, errors } = validateCompany(isDesk ? { ...req.body, name: '' } : req.body, parseJobs(current.roles), { deskOnly: isDesk });
    if (Object.keys(errors).length) {
      return res.status(400).json({ error: Object.values(errors)[0], fields: errors });
    }
    if (!isDesk) {
      // A company's desk number and floor come only from the desk QR code it scans (or types) itself.
      delete values.room_no;
      delete values.location;
    }
    await companies.updateOne({ id }, { $set: values });
    // The company that activated a desk QR code follows it when its number or floor is changed.
    if (isDesk) await companies.updateMany({ desk_id: id }, { $set: { room_no: values.room_no, location: values.location } });
    dropCompanyCache();
    res.json(companyOut(await findCompany(id)));
  }),
);

router.delete(
  '/admin/companies/:id',
  requireAdmin,
  wrap(async (req, res) => {
    const id = toId(req.params.id);
    const result = await companies.deleteOne({ id });
    if (!result.deletedCount) return res.status(404).json({ error: 'Company not found' });
    // When a desk QR code is deleted, the company that activated it has no desk any more.
    await companies.updateMany({ desk_id: id }, { $set: { desk_id: null, room_no: '', location: '' } });
    await applications.deleteMany({ company_id: id });
    dropCompanyCache();
    res.json({ ok: true });
  }),
);

// Takes the desk QR code away from a company: it scanned the poster of the wrong desk, or it has
// left. The QR code is free again for the company that really sits there.
router.post(
  '/admin/companies/:id/desk/free',
  requireAdmin,
  wrap(async (req, res) => {
    const id = toId(req.params.id);
    if (!(await companies.findOne({ id, name: { $ne: '' } }))) {
      return res.status(404).json({ error: 'Company not found' });
    }
    await companies.updateOne({ id, desk_id: { $type: 'number' } }, { $set: { desk_id: null, room_no: '', location: '' } });
    dropCompanyCache();
    res.json({ ok: true });
  }),
);

// The company registration link (what the company registration QR code contains).
router.get('/admin/company-link', requireAdmin, wrap(async (req, res) => res.json({ code: await companyLinkCode() })));

// A new link: the old one, and every printed copy of the old QR code, stops working.
router.post('/admin/company-link/renew', requireAdmin, wrap(async (req, res) => res.json({ code: await companyLinkCode(true) })));

// A new access code replaces the old one, which stops working straight away.
router.post(
  '/admin/companies/:id/access-code',
  requireAdmin,
  wrap(async (req, res) => {
    const access_code = await newAccessCode();
    const result = await companies.updateOne({ id: toId(req.params.id) }, { $set: { access_code } });
    if (!result.matchedCount) return res.status(404).json({ error: 'Company not found' });
    res.json({ access_code });
  }),
);

// Bulk upload of companies from Excel / CSV

const IMPORT_HEADERS = {
  name: ['company name', 'company', 'name', 'organisation', 'organization', 'name of the company'],
  industry: ['industry', 'sector', 'category'],
  room_no: ['desk no', 'desk', 'desk number', 'interview desk', 'interview desk no', 'room no', 'room', 'room number', 'stall', 'stall no', 'counter'],
  location: ['floor block', 'floor', 'block', 'building', 'floor or block'],
  roles: ['roles', 'role', 'job roles', 'job role', 'positions', 'position', 'designation', 'designations', 'posts'],
  eligibility: ['eligibility', 'qualification', 'qualifications', 'qualification required'],
  salary: ['salary', 'package', 'ctc', 'salary package'],
  vacancies: ['vacancies', 'vacancy', 'openings', 'no of vacancies', 'number of vacancies'],
  job_location: ['job location', 'work location', 'place of posting', 'posting'],
  website: ['website', 'web', 'url'],
  about: ['about', 'description', 'about company', 'about the company'],
};
const TEMPLATE_HEADER = [
  'Company Name', 'Industry', 'Roles', 'Eligibility', 'Salary', 'Vacancies', 'Job Location', 'Website', 'About',
];
const normHeader = (h) => String(h).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const sheetUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 3 * 1024 * 1024, files: 1 } });

router.get('/admin/companies/template', requireAdmin, (req, res) => {
  sendSheet(res, 'companies-template.xlsx', 'Companies', TEMPLATE_HEADER, [
    [
      'Example Motors Pvt Ltd', 'Automobile & Mobile', 'Sales Executive, Service Advisor', 'Any degree / Diploma', '₹15,000 – ₹22,000 per month', 12,
      'Udupi, Mangaluru', 'www.example.com', 'Delete this example row before uploading.',
    ],
  ]);
});

router.post(
  '/admin/companies/import',
  requireAdmin,
  (req, res, next) =>
    sheetUpload.single('file')(req, res, (err) => {
      if (!err) return next();
      res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'The file must be 3 MB or smaller' : 'Upload failed' });
    }),
  wrap(async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Choose an Excel or CSV file' });
    let table;
    try {
      // Excel files start with "PK" (xlsx) or D0 CF (xls); anything else is read as UTF-8 CSV text.
      const buf = req.file.buffer;
      const isExcel = (buf[0] === 0x50 && buf[1] === 0x4b) || (buf[0] === 0xd0 && buf[1] === 0xcf);
      const wb = isExcel
        ? XLSX.read(buf, { type: 'buffer' })
        : XLSX.read(buf.toString('utf8').replace(/^﻿/, ''), { type: 'string', raw: true });
      table = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false, blankrows: false });
    } catch {
      return res.status(400).json({ error: 'This file could not be read. Upload an Excel (.xlsx) or CSV file.' });
    }
    if (table.length < 2) return res.status(400).json({ error: 'The file has no company rows' });

    const header = table[0].map(normHeader);
    const colOf = {};
    for (const [field, names] of Object.entries(IMPORT_HEADERS)) {
      const index = header.findIndex((h) => names.includes(h));
      if (index >= 0) colOf[field] = index;
    }
    if (colOf.name === undefined) {
      return res.status(400).json({ error: 'No "Company Name" column found. Use the template to see the column names.' });
    }
    const rows = table.slice(1, 1001);
    const present = Object.keys(colOf);
    // Desk numbers and floors in the file are not used: each company links its desk by scanning the QR code there.
    const updatable = present.filter((f) => !['name', 'room_no', 'location'].includes(f));
    const skipped = [];
    let added = 0;
    let updated = 0;

    for (const [i, cells] of rows.entries()) {
      const raw = Object.fromEntries(present.map((f) => [f, cells[colOf[f]] ?? '']));
      const { values, errors } = validateCompany(raw);
      if (errors.name) {
        if (cells.some((c) => String(c).trim())) skipped.push({ row: i + 2, reason: 'Company name is missing' });
        continue;
      }
      const existing = await companies.findOne({ name: sameText(values.name) }, { projection: { _id: 0, id: 1, roles: 1 } });
      if (existing) {
        values.roles = jobsFromTitles(parseRoles(raw.roles), parseJobs(existing.roles));
        // Only the columns present in the file are overwritten.
        if (updatable.length) {
          await companies.updateOne({ id: existing.id }, { $set: Object.fromEntries(updatable.map((f) => [f, values[f]])) });
        }
        updated += 1;
      } else {
        await addCompany(values);
        added += 1;
      }
    }
    dropCompanyCache();
    res.json({ added, updated, skipped });
  }),
);

// Candidates

router.get(
  '/admin/candidates',
  requireAdmin,
  wrap(async (req, res) => {
    const q = clean(req.query.q, 80);
    const { offset, limit } = pageOf(req.query);
    let filter = {};
    if (q) {
      const reg = /^jf-?0*(\d{1,9})$/i.exec(q);
      if (reg) filter = { id: Number(reg[1]) };
      else {
        const cols = ['full_name', 'mobile', 'email', 'qualification', 'specialization', 'skills', 'city'];
        filter = { $or: cols.map((c) => ({ [c]: containing(q) })) };
      }
    }
    const [total, rows] = await Promise.all([
      candidates.countDocuments(filter),
      candidates.find(filter, { ...NO_ID, sort: { id: -1 }, skip: offset, limit }).toArray(),
    ]);
    const counts = await countBy(applications, 'candidate_id', { candidate_id: { $in: rows.map((r) => r.id) } });
    res.json({ total, rows: rows.map((r) => ({ ...candidateOut(r), applications: counts.get(r.id) ?? 0 })) });
  }),
);

router.get(
  '/admin/candidates/:id',
  requireAdmin,
  wrap(async (req, res) => {
    const row = await findCandidate(toId(req.params.id));
    if (!row) return res.status(404).json({ error: 'Candidate not found' });
    const list = await applications
      .find({ candidate_id: row.id }, { projection: { ...APPLICATION_OUT, company_id: 1 }, sort: { id: 1 } })
      .toArray();
    const named = new Map(
      (await companies.find({ id: { $in: list.map((a) => a.company_id) } }, { projection: { _id: 0, id: 1, name: 1, room_no: 1 } }).toArray()).map(
        (c) => [c.id, c],
      ),
    );
    const applied = list
      .filter((a) => named.has(a.company_id))
      .map(({ company_id, ...a }) => ({ ...a, company_name: named.get(company_id).name, room_no: named.get(company_id).room_no }));
    res.json({ ...candidateOut(row), applications: applied });
  }),
);

router.get(
  '/admin/candidates/:id/resume',
  requireAdmin,
  wrap(async (req, res) => sendResume(res, await findCandidate(toId(req.params.id)))),
);

router.delete(
  '/admin/candidates/:id',
  requireAdmin,
  wrap(async (req, res) => {
    const row = await findCandidate(toId(req.params.id));
    if (!row) return res.status(404).json({ error: 'Candidate not found' });
    await candidates.deleteOne({ id: row.id });
    await applications.deleteMany({ candidate_id: row.id });
    await aiCourseLeads.deleteOne({ candidate_id: row.id });
    removeResume(row.resume_file);
    dropCompanyCache();
    res.json({ ok: true });
  }),
);

// Applications, with the candidate's and the company's details alongside each one.

function applicationPipeline(query, { byToken = false } = {}) {
  const match = {};
  let person = null;
  const companyId = toId(query.company);
  if (companyId) match.company_id = companyId;
  if (STATUSES.includes(query.status)) match.status = query.status;
  const q = clean(query.q, 80);
  if (q) {
    const reg = /^jf-?0*(\d{1,9})$/i.exec(q);
    if (reg) match.candidate_id = Number(reg[1]);
    else if (byToken && /^\d{1,4}$/.test(q)) {
      // A short number typed at a company's desk is a token number. Matching it against
      // mobile numbers as well would bring up many unrelated candidates.
      match.token_no = Number(q);
    } else {
      person = { $or: [{ 'c.full_name': containing(q) }, { 'c.mobile': containing(q) }] };
    }
  }
  return [
    { $match: match },
    { $lookup: { from: 'candidates', localField: 'candidate_id', foreignField: 'id', as: 'c' } },
    { $unwind: '$c' },
    ...(person ? [{ $match: person }] : []),
    { $lookup: { from: 'companies', localField: 'company_id', foreignField: 'id', as: 'co' } },
    { $unwind: '$co' },
  ];
}

// The application's own fields win over the candidate's (id, created_at).
const APPLICATION_ROW = {
  $replaceWith: {
    $mergeObjects: [
      '$c',
      {
        company_name: '$co.name',
        room_no: '$co.room_no',
        company_key: { $toLower: '$co.name' },
        has_resume: { $gt: ['$c.resume_file', null] },
      },
      '$$ROOT',
    ],
  },
};

async function findApplications(query, options, fields, { offset = 0, limit = 0, count = false } = {}) {
  const base = applicationPipeline(query, options);
  const rows = applications
    .aggregate([
      ...base,
      APPLICATION_ROW,
      { $sort: { company_key: 1, token_no: 1, id: 1 } },
      ...(offset ? [{ $skip: offset }] : []),
      ...(limit ? [{ $limit: limit }] : []),
      { $project: { _id: 0, ...Object.fromEntries(fields.map((f) => [f, 1])) } },
    ])
    .toArray();
  const total = count ? applications.aggregate([...base, { $count: 'n' }]).toArray() : null;
  return { rows: await rows, total: count ? ((await total)[0]?.n ?? 0) : undefined };
}

const PERSON_FIELDS = [
  'full_name', 'mobile', 'email', 'gender', 'city', 'qualification', 'specialization', 'college', 'passing_year',
  'percentage', 'experience_type', 'experience_years', 'last_company', 'last_role', 'skills', 'languages',
];
const EXPORT_FIELDS = ['id', 'candidate_id', 'company_id', 'role', 'token_no', 'status', 'created_at', 'updated_at', ...PERSON_FIELDS, 'company_name', 'room_no'];

router.get(
  '/admin/applications',
  requireAdmin,
  wrap(async (req, res) => {
    const { offset, limit } = pageOf(req.query);
    const { rows, total } = await findApplications(
      req.query,
      {},
      [
        'id', 'role', 'token_no', 'status', 'created_at', 'candidate_id', 'company_id', 'full_name', 'mobile',
        'qualification', 'specialization', 'experience_type', 'experience_years', 'has_resume', 'company_name', 'room_no',
      ],
      { offset, limit, count: true },
    );
    res.json({ total, rows: rows.map((r) => ({ ...r, reg_no: regNo(r.candidate_id) })) });
  }),
);

router.put(
  '/admin/applications/:id',
  requireAdmin,
  wrap(async (req, res) => {
    const status = String(req.body?.status ?? '');
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status' });
    const application = await applications.findOneAndUpdate({ id: toId(req.params.id) }, { $set: { status, updated_at: now() } });
    if (!application) return res.status(404).json({ error: 'Application not found' });
    await resultGiven(application.company_id, application.token_no, status);
    res.json({ ok: true, status });
  }),
);

// Excel downloads

const experienceText = (r) =>
  r.experience_type === 'experienced' ? `${r.experience_years} yr${r.experience_years === 1 ? '' : 's'}` : 'Fresher';

router.get(
  '/admin/export/candidates',
  requireAdmin,
  wrap(async (req, res) => {
    const [rows, counts] = await Promise.all([
      candidates.find({}, { ...NO_ID, sort: { id: 1 } }).toArray(),
      countBy(applications, 'candidate_id'),
    ]);
    sendSheet(
      res,
      'job-fair-candidates.xlsx',
      'Candidates',
      [
        'Reg No', 'Name', 'Mobile', 'Email', 'Gender', 'Date of Birth', 'Pincode', 'City', 'Qualification', 'Course / Stream',
        'College', 'Year of Passing', 'Percentage / CGPA', 'Experience', 'Last Company', 'Last Role', 'Skills',
        'Languages', 'Preferred Role', 'Resume', 'Companies Applied', 'Registered At',
      ],
      rows.map((r) => [
        regNo(r.id), r.full_name, r.mobile, r.email, r.gender, r.dob, r.pincode ?? '', r.city, r.qualification, r.specialization,
        r.college, r.passing_year, r.percentage, experienceText(r), r.last_company, r.last_role, r.skills,
        r.languages, r.preferred_role, r.resume_file ? 'Yes' : 'No', counts.get(r.id) ?? 0, localTime(r.created_at),
      ]),
    );
  }),
);

// AI Course: candidates who said Yes to the Government Certified AI Course when registering.

function aiLeadFilter(q) {
  if (!q) return {};
  const reg = /^jf-?0*(\d{1,9})$/i.exec(q);
  if (reg) return { candidate_id: Number(reg[1]) };
  const cols = ['full_name', 'mobile', 'email', 'qualification', 'specialization', 'city', 'pincode', 'college'];
  return { $or: cols.map((c) => ({ [c]: containing(q) })) };
}

router.get(
  '/admin/ai-course',
  requireAdmin,
  wrap(async (req, res) => {
    const filter = aiLeadFilter(clean(req.query.q, 80));
    const { offset, limit } = pageOf(req.query);
    const [total, rows] = await Promise.all([
      aiCourseLeads.countDocuments(filter),
      aiCourseLeads.find(filter, { ...NO_ID, sort: { candidate_id: -1 }, skip: offset, limit }).toArray(),
    ]);
    res.json({ total, rows: rows.map((r) => ({ ...r, reg_no: regNo(r.candidate_id) })) });
  }),
);

router.get(
  '/admin/export/ai-course',
  requireAdmin,
  wrap(async (req, res) => {
    const rows = await aiCourseLeads.find({}, { ...NO_ID, sort: { candidate_id: 1 } }).toArray();
    sendSheet(
      res,
      'ai-course-interested.xlsx',
      'AI Course',
      [
        'Reg No', 'Name', 'Mobile', 'Email', 'Gender', 'Date of Birth', 'Pincode', 'City', 'Qualification',
        'Course / Stream', 'College', 'Year of Passing', 'Percentage / CGPA', 'Experience', 'Last Company', 'Last Role',
        'Skills', 'Languages', 'Preferred Role', 'Signed Up At',
      ],
      rows.map((r) => [
        regNo(r.candidate_id), r.full_name, r.mobile, r.email, r.gender, r.dob, r.pincode ?? '', r.city, r.qualification,
        r.specialization, r.college, r.passing_year, r.percentage, experienceText(r), r.last_company, r.last_role,
        r.skills, r.languages, r.preferred_role, localTime(r.created_at),
      ]),
    );
  }),
);

router.get(
  '/admin/export/applications',
  requireAdmin,
  wrap(async (req, res) => {
    const { rows } = await findApplications(req.query, {}, EXPORT_FIELDS);
    sendSheet(
      res,
      'job-fair-applications.xlsx',
      'Applications',
      [
        'Company', 'Desk No', 'Token', 'Reg No', 'Name', 'Mobile', 'Email', 'Gender', 'City', 'Qualification',
        'Course / Stream', 'College', 'Year of Passing', 'Percentage / CGPA', 'Experience', 'Last Company', 'Skills',
        'Role Applied', 'Status', 'Applied At',
      ],
      rows.map((r) => [
        r.company_name, r.room_no, r.token_no, regNo(r.candidate_id), r.full_name, r.mobile, r.email, r.gender,
        r.city, r.qualification, r.specialization, r.college, r.passing_year, r.percentage, experienceText(r),
        r.last_company, r.skills, r.role, STATUS_LABEL[r.status] ?? r.status, localTime(r.created_at),
      ]),
    );
  }),
);

const formatCode = (code) => `${code.slice(0, 4)}-${code.slice(4)}`;

// One sheet the organisers can use to hand every company its login.
router.get(
  '/admin/export/company-logins',
  requireAdmin,
  wrap(async (req, res) => {
    const site = (await getSettings()).site_url || '';
    const rows = await companies
      .find({ name: { $ne: '' } }, { projection: { _id: 0, id: 1, name: 1, room_no: 1, location: 1, access_code: 1, desk_id: 1 } })
      .toArray();
    rows.sort((a, b) => nocase(a.name, b.name));
    sendSheet(
      res,
      'job-fair-company-logins.xlsx',
      'Company logins',
      ['Company', 'Desk No', 'Floor / Block', 'Access Code', ...(site ? ['Company Login Page', 'Desk QR Link'] : [])],
      rows.map((r) => [
        r.name, r.room_no, r.location, formatCode(r.access_code),
        ...(site ? [`${site}/company`, `${site}/c/${r.desk_id || r.id}`] : []),
      ]),
    );
  }),
);

// Settings

router.get('/admin/settings', requireAdmin, wrap(async (req, res) => res.json(await settingsOut())));

router.put(
  '/admin/settings',
  requireAdmin,
  wrap(async (req, res) => {
    const body = req.body ?? {};
    const errors = {};
    const next = {};
    for (const [key, max] of Object.entries(TEXT_SETTINGS)) {
      next[key] = ['highlights', 'notice', 'eligibility'].includes(key) ? cleanText(body[key], max) : clean(body[key], max);
    }
    if (next.fair_name.length < 2) errors.fair_name = 'Enter the job fair name';
    next.fair_date = clean(body.fair_date, 10);
    if (next.fair_date && !/^\d{4}-\d{2}-\d{2}$/.test(next.fair_date)) errors.fair_date = 'Choose a valid date';
    next.registration_open = isOff(body.registration_open) ? '0' : '1';
    next.applications_open = isOff(body.applications_open) ? '0' : '1';
    const limit = Number.parseInt(body.max_applications, 10) || 0;
    if (limit < 0 || limit > 500) errors.max_applications = 'Enter a number between 0 and 500';
    next.max_applications = String(limit);
    // The address printed inside the desk QR codes. Only the site itself is kept, without any page path.
    const site = normUrl(body.site_url);
    if (site === null) errors.site_url = 'Enter the website address, for example https://jobfair.example.com';
    next.site_url = site ? new URL(site).origin : '';
    if (Object.keys(errors).length) {
      return res.status(400).json({ error: Object.values(errors)[0], fields: errors });
    }
    for (const [key, value] of Object.entries(next)) await setSetting(key, value);
    res.json(await settingsOut());
  }),
);

// Sample data (from `npm run seed:demo`) can be wiped in one go before the real event.
router.post(
  '/admin/demo/clear',
  requireAdmin,
  wrap(async (req, res) => {
    if ((await getSettings()).demo_data !== '1') {
      return res.status(400).json({ error: 'There is no sample data to clear' });
    }
    await Promise.all([applications.deleteMany({}), candidates.deleteMany({}), companies.deleteMany({}), aiCourseLeads.deleteMany({})]);
    await resetIds(['applications', 'candidates', 'companies']);
    await setSetting('demo_data', '0');
    for (const file of fs.readdirSync(RESUME_DIR)) fs.rmSync(path.join(RESUME_DIR, file), { force: true });
    dropCompanyCache();
    res.json({ ok: true });
  }),
);

// ───────────────────────── company dashboard ─────────────────────────
// A company logs in with its access code and sees only the candidates who applied to it.

// Codes are typed by hand, so lower case, dashes and the look-alikes O/0 and I/L/1 are forgiven.
const normCode = (v) =>
  String(v ?? '').toUpperCase().replace(/O/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-Z]/g, '').slice(0, 16);

async function recruiterCounts(companyId) {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  for (const [status, n] of await countBy(applications, 'status', { company_id: companyId })) counts[status] = n;
  return { total: Object.values(counts).reduce((a, b) => a + b, 0), ...counts };
}

// Everyone at the venue may share one internet address, so this limit is per address and
// generous: 40 wrong codes in 15 minutes. A code has over a million million possibilities.
router.post(
  '/recruiter/login',
  wrap(async (req, res) => {
    const key = `r|${req.ip}`;
    if (tooManyAttempts(key, 40)) {
      return res.status(429).json({ error: 'Too many wrong attempts. Please try again after 15 minutes.' });
    }
    const code = normCode(req.body?.code);
    // Only a company can be logged in to, never a desk QR code.
    const row = code.length === 8 ? await companies.findOne({ access_code: code, name: { $ne: '' } }, NO_ID) : null;
    if (!row) {
      recordFailure(key);
      return res.status(401).json({ error: 'This access code is not correct. Please check it with the organisers.' });
    }
    res.json({ token: recruiterToken(row), company: await recruiterCompany(row) });
  }),
);

// ── Company registration ──
// Companies register themselves through one link, the one inside the company registration QR
// code. A company types its name, is logged in to its dashboard, and adds its details there.

// What a company types as its floor. A bare number ("2") is shown to candidates as "Floor 2".
const floorText = (v) => {
  const text = clean(v, 80);
  return /^\d{1,2}$/.test(text) ? `Floor ${text}` : text;
};

const deskTaken = (desk, holder) =>
  `Desk ${desk.room_no} is already activated by ${holder.name}. If that is a mistake, please ask the organisers at the help desk.`;

const deskHolder = (deskId, companyId) =>
  companies.findOne({ desk_id: deskId, id: { $ne: companyId } }, { projection: { _id: 0, name: 1 } });

// A company types its desk number itself (when it registers, in its details, or instead of
// scanning). The number is the one printed on the desk QR poster at its desk, so typing it is the
// same as scanning that poster. Returns
//   { desk }                the desk QR code with that number, free for this company
//   { desk: null }          no desk QR codes are in use at all: the number is simply kept
//   { error, status }       there is no such desk, or another company has it
async function deskByNumber(deskNo, companyId) {
  const desk = await companies.findOne(
    { name: '', room_no: sameText(deskNo) },
    { projection: { _id: 0, id: 1, room_no: 1, location: 1 }, sort: { id: 1 } },
  );
  if (!desk) {
    return (await companies.findOne({ name: '' }))
      ? { status: 404, error: `There is no desk ${deskNo}. Check the number printed on the poster at your desk.` }
      : { desk: null };
  }
  const holder = await deskHolder(desk.id, companyId);
  return holder ? { status: 409, error: deskTaken(desk, holder) } : { desk };
}

async function companyLinkOk(req, res) {
  const key = `s|${req.ip}`;
  if (tooManyAttempts(key, 40)) {
    res.status(429).json({ error: 'Too many wrong attempts. Please try again after 15 minutes.' });
    return false;
  }
  if (normCode(req.params.code) !== (await companyLinkCode())) {
    recordFailure(key);
    res.status(404).json({ error: 'This company registration link does not work any more. Please ask the organisers for the new one.' });
    return false;
  }
  return true;
}

router.get(
  '/public/company-register/:code',
  wrap(async (req, res) => {
    if (await companyLinkOk(req, res)) res.json({ ok: true });
  }),
);

router.post(
  '/public/company-register/:code',
  wrap(async (req, res) => {
    if (!(await companyLinkOk(req, res))) return;
    const body = req.body ?? {};
    const { values } = validateCompany({ name: body.name, industry: body.industry });
    const refuse = (status, error) => res.status(status).json({ error, fields: { name: error } });
    if (values.name.length < 2) return refuse(400, 'Enter your company name');
    // A company registers once. Someone who registers it again (a colleague, or after losing the
    // page) would split its candidates over two lists, so they are sent to the access code instead.
    if (await companies.findOne({ name: sameText(values.name) })) {
      return refuse(409, 'This company is already registered. To open its dashboard, use its access code: ask your colleague, or the organisers at the help desk.');
    }
    // The desk number and the floor can be given straight away, by a company that is already at its desk.
    const wanted = clean(body.room_no, 20);
    const found = wanted ? await deskByNumber(wanted, 0) : { desk: null };
    if (found.error) return res.status(400).json({ error: found.error, fields: { room_no: found.error } });
    values.room_no = found.desk ? found.desk.room_no : wanted;
    values.location = floorText(body.location) || found.desk?.location || '';
    let id;
    try {
      // The desk is taken in the same step as the company is added, so a desk that another company
      // took in the same moment leaves nothing half-done.
      id = await insertCompany({ ...values, desk_id: found.desk ? found.desk.id : null });
    } catch (err) {
      if (!isDuplicate(err)) throw err;
      const error = 'That desk has just been activated by another company. Check the desk number.';
      return res.status(400).json({ error, fields: { room_no: error } });
    }
    dropCompanyCache();
    const company = await findCompany(id);
    res.status(201).json({ token: recruiterToken(company), company: await recruiterCompany(company), access_code: company.access_code });
  }),
);

// ── Activating a desk QR code ──
// The desk QR posters are put at the desks in any order. A company makes the one at its own desk
// its own by scanning it from its dashboard (or by typing the desk number printed on it). From then
// on candidates who scan that poster see this company, and the company has that desk number.
// A company that moves simply scans the poster at its new desk; the old one is free again.
const DESK_LINK = /\/c\/(\d{1,12})\/?(?:[?#].*)?$/;

router.post(
  '/recruiter/desk',
  requireRecruiter,
  wrap(async (req, res) => {
    const company = req.company;
    const qr = clean(req.body?.qr, 300);
    const typed = clean(req.body?.desk_no, 20);
    let desk;
    if (qr) {
      const link = DESK_LINK.exec(qr);
      if (!link) {
        const error = /\/r\/[0-9A-Za-z]{6,16}\/?$/.test(qr)
          ? 'That is the company registration QR code. Scan the other one at your desk: the desk QR code with the big desk number.'
          : 'That is not a desk QR code of this job fair. Scan the QR code on the poster at your interview desk.';
        return res.status(400).json({ error });
      }
      desk = await companies.findOne({ id: Number(link[1]) }, { projection: { _id: 0, id: 1, name: 1, room_no: 1, location: 1 } });
      if (!desk) return res.status(404).json({ error: 'This desk QR code is not in use any more. Please ask the organisers for a new poster.' });
      if (desk.id === company.id) return res.json({ company: await recruiterCompany(company) }); // its own QR code
      if (desk.name !== '') {
        return res.status(409).json({ error: `That QR code belongs to ${desk.name}. Scan the QR code on the poster at your own interview desk.` });
      }
    } else if (typed) {
      const found = await deskByNumber(typed, company.id);
      if (found.error) return res.status(found.status).json({ error: found.error });
      if (!found.desk) return res.status(404).json({ error: `There is no desk ${typed}. Check the number printed on the poster at your desk.` });
      desk = found.desk;
    } else {
      return res.status(400).json({ error: 'Scan the QR code on the poster at your desk, or type its desk number.' });
    }

    const taken = async () => {
      const holder = await deskHolder(desk.id, company.id);
      return holder ? deskTaken(desk, holder) : '';
    };
    let problem = await taken();
    if (!problem) {
      // The floor is what the company says it is; otherwise the floor it already has at this desk,
      // or what the organisers entered for the desk.
      const location = floorText(req.body?.location) || (desk.id === company.desk_id ? company.location : desk.location);
      try {
        await companies.updateOne({ id: company.id }, { $set: { desk_id: desk.id, room_no: desk.room_no, location } });
      } catch (err) {
        // Two companies scanned the same poster at the same moment: the first one has it.
        if (!isDuplicate(err)) throw err;
        problem = (await taken()) || 'This desk QR code has just been activated by another company.';
      }
    }
    if (problem) return res.status(409).json({ error: problem });
    dropCompanyCache();
    res.json({ company: await recruiterCompany(await findCompany(company.id)) });
  }),
);

// ── Interviews ──
// A company can rate each candidate on its own list of interview questions (optional). Until it
// changes the list, it uses these suggested ones. Ratings go from 1 (poor) to 5 (excellent).
const DEFAULT_QUESTIONS = [
  'Tell us about yourself',
  'Why do you want to join our company?',
  'What do you know about this role?',
  'Explain a project or work you have done',
  'What are your strengths and weaknesses?',
  'Communication and confidence',
  'Are you willing to relocate or work in shifts?',
  'What salary do you expect?',
].map((text, i) => ({ id: `d${i + 1}`, text }));
const MAX_QUESTIONS = 30;
const questionsOf = (company) => (Array.isArray(company.questions) ? company.questions : DEFAULT_QUESTIONS);

// The saved interview of one candidate: each rated question keeps its own wording, so changing the
// question list later does not change what was recorded. score is the average rating (1 to 5).
function interviewOut(saved) {
  if (!saved) return null;
  const ratings = Array.isArray(saved.ratings) ? saved.ratings : [];
  return {
    ratings,
    notes: saved.notes ?? '',
    score: ratings.length ? Math.round((ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length) * 10) / 10 : null,
    started_at: saved.started_at ?? null,
    saved_at: saved.saved_at ?? null,
  };
}

// The company's own view of itself: its jobs also say how many candidates applied for each.
async function recruiterCompany(row) {
  const company = companyOut(row);
  const applied = await countBy(applications, 'role', { company_id: row.id });
  // desk_id: the desk QR code the company has activated (its poster opens /c/<desk_id>), or null.
  return {
    ...company,
    desk_id: row.desk_id ?? null,
    jobs: company.jobs.map((job) => ({ ...job, applicants: applied.get(job.title) ?? 0 })),
    questions: questionsOf(row),
    questions_custom: Array.isArray(row.questions),
  };
}

router.get(
  '/recruiter/me',
  requireRecruiter,
  wrap(async (req, res) => {
    // Its own access code is shown to the company, so it can open the dashboard on another phone.
    res.json({
      company: await recruiterCompany(req.company),
      counts: await recruiterCounts(req.company.id),
      queue: await queueOf(req.company.id),
      access_code: req.company.access_code,
    });
  }),
);

// A company fills in its own details and job openings. The name is typed once, when the company
// registers; after that the name stays with the organisers. Its desk number and floor it can
// change: the desk number is the one on the poster at its desk, so typing it has the same effect
// as scanning that poster (see deskByNumber). Only what is sent is changed.
router.put(
  '/recruiter/company',
  requireRecruiter,
  wrap(async (req, res) => {
    const body = req.body ?? {};
    const company = req.company;
    const errors = {};
    const next = {};
    if ('industry' in body) next.industry = clean(body.industry, 60);
    if ('about' in body) next.about = cleanText(body.about, 1500);
    // Desk number and floor
    let moved = false;
    let deskFloor = '';
    if ('room_no' in body) {
      const wanted = clean(body.room_no, 20);
      if (wanted.toLowerCase() !== company.room_no.toLowerCase()) {
        const found = wanted ? await deskByNumber(wanted, company.id) : { desk: null };
        if (found.error) errors.room_no = found.error;
        else {
          moved = true;
          next.room_no = found.desk ? found.desk.room_no : wanted;
          next.desk_id = found.desk ? found.desk.id : null;
          deskFloor = found.desk?.location || '';
        }
      }
    }
    // At a new desk the old floor no longer holds, unless the company gives the floor as well.
    if ('location' in body) next.location = floorText(body.location) || deskFloor;
    else if (moved) next.location = deskFloor;
    if ('eligibility' in body) next.eligibility = clean(body.eligibility, 300);
    if ('job_location' in body) next.job_location = clean(body.job_location, 120);
    if ('website' in body) {
      const url = normUrl(body.website);
      if (url === null) errors.website = 'Enter a valid website address';
      else next.website = url;
    }

    const before = parseJobs(company.roles);
    const renamed = [];
    if ('jobs' in body) {
      const list = Array.isArray(body.jobs) ? body.jobs : [];
      if (list.length > 25) errors.jobs = 'A company can list up to 25 job openings';
      const jobs = [];
      const titles = new Set();
      const ids = new Set();
      list.slice(0, 25).forEach((item, i) => {
        const title = clean(item?.title, 80);
        if (title.length < 2) {
          errors.jobs ??= `Job opening ${i + 1}: enter the job role`;
          return;
        }
        if (titles.has(title.toLowerCase())) {
          errors.jobs ??= `"${title}" is listed twice`;
          return;
        }
        titles.add(title.toLowerCase());
        // A job keeps its id when it is edited, which is how a changed title is recognised.
        const old = before.find((job) => job.id === clean(item?.id, 20) && !ids.has(job.id));
        const id = old ? old.id : newJobId();
        ids.add(id);
        if (old && old.title !== title) renamed.push([old.title, title]);
        const job = {
          id,
          title,
          description: cleanText(item?.description, 1500),
          openings: toCount(item?.openings),
          ctc: clean(item?.ctc, 80),
          eligibility: clean(item?.eligibility, 300),
          location: clean(item?.location, 120),
        };
        // Who can apply and the job location must be given for every job opening. One that was
        // saved before they were asked for is left alone until the company changes it.
        const untouched = old && JOB_DETAILS.every((field) => old[field] === job[field]);
        if (!untouched && !job.eligibility) errors.jobs ??= `${title}: enter who can apply`;
        else if (!untouched && !job.location) errors.jobs ??= `${title}: enter the job location`;
        jobs.push(job);
      });
      next.roles = jobs;
    }
    if (Object.keys(errors).length) {
      return res.status(400).json({ error: Object.values(errors)[0], fields: errors });
    }

    if (Object.keys(next).length) {
      try {
        await companies.updateOne({ id: company.id }, { $set: next });
      } catch (err) {
        // Another company took that desk in the same moment.
        if (!isDuplicate(err)) throw err;
        const error = 'That desk has just been activated by another company. Check the desk number.';
        return res.status(400).json({ error, fields: { room_no: error } });
      }
    }
    // Candidates who applied for a job that was renamed see its new name.
    for (const [from, to] of renamed) {
      await applications.updateMany({ company_id: company.id, role: from }, { $set: { role: to } });
    }
    dropCompanyCache();
    res.json({ company: await recruiterCompany(await findCompany(company.id)) });
  }),
);

router.get(
  '/recruiter/applications',
  requireRecruiter,
  wrap(async (req, res) => {
    // The company always comes from the login, never from the request.
    const limit = Math.min(2000, Math.max(1, Number.parseInt(req.query.limit, 10) || 100));
    const offset = Math.max(0, Number.parseInt(req.query.offset, 10) || 0);
    const { rows, total } = await findApplications(
      { company: req.company.id, status: req.query.status, q: req.query.q },
      { byToken: true },
      ['id', 'role', 'token_no', 'status', 'created_at', 'called_at', 'interview', 'candidate_id', ...PERSON_FIELDS, 'dob', 'preferred_role'],
      { offset, limit, count: true },
    );
    res.json({
      total,
      counts: await recruiterCounts(req.company.id),
      queue: await queueOf(req.company.id),
      rows: rows.map((r) => ({ ...r, interview: interviewOut(r.interview), reg_no: regNo(r.candidate_id) })),
    });
  }),
);

// One candidate who applied to this company, for its interview page.
router.get(
  '/recruiter/applications/:id',
  requireRecruiter,
  wrap(async (req, res) => {
    const application = await applications.findOne({ id: toId(req.params.id), company_id: req.company.id }, NO_ID);
    if (!application) return res.status(404).json({ error: 'This candidate did not apply to your company' });
    const person = await findCandidate(application.candidate_id);
    if (!person) return res.status(404).json({ error: 'This candidate did not apply to your company' });
    const { _id, login_key: _key, resume_file: _file, resume_name: _name, id: _cid, created_at: _at, ...details } = person;
    res.json({
      row: { ...details, ...application, interview: interviewOut(application.interview), reg_no: regNo(application.candidate_id) },
      queue: await queueOf(req.company.id),
    });
  }),
);

// The company's interview questions, for all its interviews. { reset: true } goes back to the suggested ones.
router.put(
  '/recruiter/questions',
  requireRecruiter,
  wrap(async (req, res) => {
    const body = req.body ?? {};
    if (body.reset) {
      await companies.updateOne({ id: req.company.id }, { $unset: { questions: '' } });
    } else {
      const list = Array.isArray(body.questions) ? body.questions : null;
      if (!list) return res.status(400).json({ error: 'Send the list of questions' });
      if (list.length > MAX_QUESTIONS) return res.status(400).json({ error: `Up to ${MAX_QUESTIONS} questions` });
      const questions = [];
      const seen = new Set();
      for (const item of list) {
        const text = cleanText(item?.text, 200).replace(/\s+/g, ' ');
        if (!text) continue;
        if (text.length < 3) return res.status(400).json({ error: `"${text}" is too short for a question` });
        if (seen.has(text.toLowerCase())) return res.status(400).json({ error: `"${text}" is listed twice` });
        seen.add(text.toLowerCase());
        // A question keeps its id when its wording is edited.
        const id = /^[a-z0-9]{2,20}$/i.test(String(item?.id ?? '')) ? String(item.id) : `q${crypto.randomBytes(4).toString('hex')}`;
        questions.push({ id, text });
      }
      await companies.updateOne({ id: req.company.id }, { $set: { questions } });
    }
    res.json({ company: await recruiterCompany(await findCompany(req.company.id)) });
  }),
);

// Starts a candidate's interview: they are called in, so their token shows as "now" to everyone.
router.post(
  '/recruiter/applications/:id/start',
  requireRecruiter,
  wrap(async (req, res) => {
    const application = await applications.findOne({ id: toId(req.params.id), company_id: req.company.id }, NO_ID);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    await applications.updateOne({ id: application.id, 'interview.started_at': { $exists: false } }, { $set: { 'interview.started_at': now() } });
    await callIn(await applications.findOne({ id: application.id }, NO_ID)); // shows "Interview going on" at the desk
    const saved = await applications.findOne({ id: application.id }, NO_ID);
    res.json({ called_at: saved.called_at, interview: interviewOut(saved.interview), queue: await queueOf(req.company.id) });
  }),
);

// Saves the interview: the ratings (all optional), notes and, if given, the result.
router.put(
  '/recruiter/applications/:id/interview',
  requireRecruiter,
  wrap(async (req, res) => {
    const application = await applications.findOne({ id: toId(req.params.id), company_id: req.company.id }, NO_ID);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    const body = req.body ?? {};
    const status = body.status === undefined ? application.status : String(body.status);
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown result' });
    const ratings = [];
    for (const item of Array.isArray(body.ratings) ? body.ratings.slice(0, MAX_QUESTIONS * 2) : []) {
      const rating = Number(item?.rating);
      const text = clean(item?.text, 200);
      if (!text || !Number.isInteger(rating) || rating < 1 || rating > 5) continue;
      ratings.push({ id: clean(item?.id, 20), text, rating });
    }
    const t = now();
    const interview = {
      ratings,
      notes: cleanText(body.notes, 2000),
      started_at: application.interview?.started_at ?? t,
      saved_at: t,
    };
    await applications.updateOne(
      { id: application.id },
      { $set: { interview, status, updated_at: t, called_at: application.called_at ?? t } },
    );
    await resultGiven(req.company.id, application.token_no, status);
    res.json({
      status,
      interview: interviewOut(interview),
      counts: await recruiterCounts(req.company.id),
      queue: await queueOf(req.company.id),
    });
  }),
);

router.put(
  '/recruiter/applications/:id',
  requireRecruiter,
  wrap(async (req, res) => {
    const status = String(req.body?.status ?? '');
    if (!STATUSES.includes(status)) return res.status(400).json({ error: 'Unknown status' });
    const id = toId(req.params.id);
    const t = now();
    const result = await applications.updateOne({ id, company_id: req.company.id }, { $set: { status, updated_at: t } });
    if (!result.matchedCount) return res.status(404).json({ error: 'Application not found' });
    // A candidate who has a result has been seen, so they are no longer "missed".
    if (status !== 'applied') await applications.updateOne({ id, called_at: null }, { $set: { called_at: t } });
    const changed = await applications.findOne({ id }, { projection: { _id: 0, token_no: 1 } });
    await resultGiven(req.company.id, changed.token_no, status);
    res.json({ ok: true, status, counts: await recruiterCounts(req.company.id), queue: await queueOf(req.company.id) });
  }),
);

// Calls in the next waiting token after the one being served. Missed tokens are not called again
// here: the company calls them in one by one when they come (below).
router.post(
  '/recruiter/queue/next',
  requireRecruiter,
  wrap(async (req, res) => {
    const company = await findCompany(req.company.id);
    const next = await applications.findOne(
      { ...waitingFilter(company.id), token_no: { $gt: company.now_serving ?? 0 } },
      { projection: { _id: 0 }, sort: { token_no: 1 } },
    );
    if (!next) return res.status(404).json({ error: 'No one is waiting after this token.', queue: await queueOf(company.id) });
    await callIn(next);
    const person = await candidates.findOne({ id: next.candidate_id }, { projection: { _id: 0, full_name: 1 } });
    res.json({ called: { id: next.id, token_no: next.token_no, full_name: person?.full_name ?? '' }, queue: await queueOf(company.id) });
  }),
);

// Calls in one candidate by their application: a missed token who has now come, or anyone out of turn.
router.post(
  '/recruiter/applications/:id/call',
  requireRecruiter,
  wrap(async (req, res) => {
    const application = await applications.findOne({ id: toId(req.params.id), company_id: req.company.id }, NO_ID);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    await callIn(application);
    res.json({ ok: true, called_at: now(), queue: await queueOf(req.company.id) });
  }),
);

router.get(
  '/recruiter/export',
  requireRecruiter,
  wrap(async (req, res) => {
    const { rows } = await findApplications({ company: req.company.id }, {}, [...EXPORT_FIELDS, 'interview']);
    const name = req.company.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'company';
    sendSheet(
      res,
      `${name}-candidates.xlsx`,
      'Candidates',
      [
        'Token', 'Reg No', 'Name', 'Mobile', 'Email', 'Gender', 'City', 'Qualification', 'Course / Stream', 'College',
        'Year of Passing', 'Percentage / CGPA', 'Experience', 'Last Company', 'Last Role', 'Skills', 'Languages',
        'Role Applied', 'Status', 'Interview Score (out of 5)', 'Questions Rated', 'Interview Notes', 'Applied At',
      ],
      rows.map((r) => [
        r.token_no, regNo(r.candidate_id), r.full_name, r.mobile, r.email, r.gender, r.city, r.qualification,
        r.specialization, r.college, r.passing_year, r.percentage, experienceText(r), r.last_company, r.last_role,
        r.skills, r.languages, r.role, STATUS_LABEL[r.status] ?? r.status,
        interviewOut(r.interview)?.score ?? '', r.interview?.ratings?.length ?? '', r.interview?.notes ?? '', localTime(r.created_at),
      ]),
    );
  }),
);
