import { createContext, useCallback, useContext, useEffect, useState } from 'react';

// ───────── login tokens (kept on the phone / browser) ─────────

// "recruiter" is a company's own login for the company dashboard.
const KEYS = { candidate: 'jobfair_token', admin: 'jobfair_admin_token', recruiter: 'jobfair_company_token' };

export function getToken(role) {
  try {
    return localStorage.getItem(KEYS[role]);
  } catch {
    return null;
  }
}

export function setToken(role, token) {
  try {
    if (token) localStorage.setItem(KEYS[role], token);
    else localStorage.removeItem(KEYS[role]);
  } catch {
    /* private mode: the session simply will not be remembered */
  }
}

const roleFor = (path) => (path.startsWith('/admin') ? 'admin' : path.startsWith('/recruiter') ? 'recruiter' : 'candidate');

const LOGIN_PAGE = { candidate: '/login', admin: '/admin/login', recruiter: '/company/login' };

// A candidate who scanned a desk QR code (/c/12) is brought back to that company after
// logging in or registering. Only these pages are accepted, so "next" cannot lead anywhere else.
const COMPANY_PAGE = /^\/c\/\d{1,12}$/;

export function nextPath(search) {
  const next = new URLSearchParams(search).get('next');
  return next && COMPANY_PAGE.test(next) ? next : null;
}

export const withNext = (page, next) => (next ? `${page}?next=${encodeURIComponent(next)}` : page);

function sessionExpired(role) {
  setToken(role, null);
  const here = window.location.pathname;
  window.location.assign(role === 'candidate' && COMPANY_PAGE.test(here) ? withNext('/login', here) : LOGIN_PAGE[role]);
}

// ───────── API calls ─────────

// Where the server is. Empty when the pages and the server share one address (on your own
// computer, or one server doing both). When the pages are on Vercel and the server is on
// Railway, the Railway address is given when the pages are built, as VITE_API_URL.
const API_BASE = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');

const UNREACHABLE = 'Could not reach the server. Check your internet connection and try again.';

// The server always answers with data, also when it refuses something. Anything else coming back
// means the server is down (an error page from the host in front of it), or there is no server
// behind this address at all: the pages were put online without VITE_API_URL.
function mustBeData(res) {
  if ((res.headers.get('content-type') || '').includes('json')) return;
  throw new Error(
    res.status >= 500
      ? 'The server is not answering right now. Please try again in a minute.'
      : 'This website is not connected to its server yet. Organisers: set VITE_API_URL to the server address and deploy the website again.',
  );
}

export async function api(path, { method = 'GET', body, form } = {}) {
  const role = roleFor(path);
  const token = getToken(role);
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, { method, headers, body: payload });
  } catch {
    throw new Error(UNREACHABLE);
  }
  mustBeData(res);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token && !path.endsWith('/login')) sessionExpired(role);
  if (!res.ok) {
    const err = new Error(data.error || 'Something went wrong. Please try again.');
    err.fields = data.fields;
    err.status = res.status;
    throw err;
  }
  return data;
}

export async function download(path, fallbackName) {
  const role = roleFor(path);
  const token = getToken(role);
  let res;
  try {
    res = await fetch(`${API_BASE}/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  } catch {
    throw new Error(UNREACHABLE);
  }
  if (res.status === 401 && token) sessionExpired(role);
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Download failed');
  }
  // A download is a file, never a web page.
  if ((res.headers.get('content-type') || '').includes('text/html')) throw new Error('Download failed');
  const blob = await res.blob();
  const match = /filename="?([^";]+)"?/.exec(res.headers.get('content-disposition') || '');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = match ? match[1] : fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 5000);
}

// ───────── event details, shared by every screen ─────────

const InfoContext = createContext({ info: null, failed: '', refresh: () => {} });

export function InfoProvider({ children }) {
  const [info, setInfo] = useState(null);
  const [failed, setFailed] = useState(''); // why the details could not be loaded

  const refresh = useCallback(
    () =>
      api('/public/info')
        .then((data) => {
          setInfo(data);
          setFailed('');
        })
        .catch((err) => setFailed(err.message)),
    [],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (info?.fair_name) document.title = info.fair_name;
  }, [info?.fair_name]);

  return <InfoContext.Provider value={{ info, failed, refresh }}>{children}</InfoContext.Provider>;
}

export const useInfo = () => useContext(InfoContext);

// ───────── who made this ─────────

// Shown as "Developed by ..." at the foot of every screen and on every printed poster.
// With a website address in "url", the name becomes a link to it.
export const DEVELOPER = { name: 'Yaticorp', url: '' };

// ───────── fixed lists ─────────

// The "Highest qualification" list on the registration form, under these headings and in this
// order. The wording of a choice is what gets saved, so change one only if nobody has picked it yet.
export const QUALIFICATION_GROUPS = [
  { label: 'Degree', items: ["Bachelor's Degree (BA / BCom / BSc / BBA / BCA)", 'Engineering (BE / BTech)', 'BSW', 'Hotel Management'] },
  { label: 'Postgraduate', items: ['MBA', 'Postgraduate Degree (MA / MCom / MSc / MCA / MTech)', 'MSW', 'PhD'] },
  { label: 'Diploma and ITI', items: ['Diploma', 'ITI'] },
  { label: 'School', items: ['PUC / 12th', 'SSLC / 10th', 'Below 10th'] },
  { label: 'Teaching', items: ['B.Ed', 'D.Ed'] },
  { label: 'Nursing, pharmacy and medical', items: ['GNM (Nursing)', 'BSc Nursing', 'D.Pharm', 'B.Pharm', 'MBBS', 'BDS', 'BAMS'] },
  { label: 'Law and commerce', items: ['LLB', 'CA', 'CS', 'ICWA / CMA'] },
];

export const QUALIFICATIONS = [...QUALIFICATION_GROUPS.flatMap((group) => group.items), 'Other'];

export const GENDERS = ['Male', 'Female', 'Other'];

// The Industry drop-down list, under these headings: the sectors named on the job fair poster
// first, then the rest in alphabetical order. "Others" comes last and lets a company type its own.
export const INDUSTRY_GROUPS = [
  {
    label: 'Main sectors of this job fair',
    items: [
      'B2B & B2C',
      'BPO',
      'Automobile & Mobile',
      'Education',
      'Retail',
      'Marketing',
      'Housekeeping',
      'Hospitality',
    ],
  },
  {
    label: 'More industries (A to Z)',
    items: [
      'Accounting & Tax',
      'Agriculture & Fisheries',
      'Architecture & Interior Design',
      'Aviation & Airlines',
      'Banking & Finance',
      'Beauty & Wellness',
      'Biotechnology',
      'Cement & Building Materials',
      'Chemicals & Fertilisers',
      'Co-operative Society',
      'Construction & Real Estate',
      'Consulting',
      'Consumer Durables & Appliances',
      'Courier & Delivery',
      'Dairy',
      'Design & Animation',
      'Digital Marketing',
      'E-commerce',
      'EdTech & Coaching',
      'Electrical & Electronics',
      'Energy & Power',
      'Engineering',
      'Environment & Waste Management',
      'Events & Entertainment',
      'Facility Management',
      'Fitness & Sports',
      'FMCG & Food',
      'Food Processing',
      'Furniture & Home Decor',
      'Government & Public Sector',
      'Hardware & Networking',
      'Healthcare & Hospitals',
      'Hotels & Restaurants',
      'Import & Export',
      'Insurance',
      'IT & Software',
      'Jewellery',
      'KPO & Analytics',
      'Legal Services',
      'Logistics & Transport',
      'Machinery & Tools',
      'Manufacturing',
      'Media & Advertising',
      'Medical Devices & Diagnostics',
      'Metals & Mining',
      'Microfinance & NBFC',
      'NGO & Social Service',
      'Oil & Gas',
      'Pharma',
      'Plastics & Rubber',
      'Printing & Packaging',
      'Publishing',
      'Research & Development',
      'Sales & Distribution',
      'Security Services',
      'Shipping & Marine',
      'Solar & Renewable Energy',
      'Staffing & HR Services',
      'Stock Broking & Investments',
      'Telecom',
      'Textiles & Garments',
      'Trading & Wholesale',
      'Training & Skill Development',
      'Travel & Tourism',
    ],
  },
];

export const INDUSTRIES = [...INDUSTRY_GROUPS.flatMap((group) => group.items), 'Others'];

export const STATUS = {
  applied: { label: 'Applied', cls: 'bg-blue-50 text-blue-700 ring-blue-200' },
  interviewed: { label: 'Interview done', cls: 'bg-violet-50 text-violet-800 ring-violet-200' },
  shortlisted: { label: 'Shortlisted', cls: 'bg-amber-50 text-amber-800 ring-amber-300' },
  selected: { label: 'Selected', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-300' },
  rejected: { label: 'Not selected', cls: 'bg-slate-100 text-slate-600 ring-slate-200' },
};

// ───────── formatting ─────────

const parseUtc = (s) => (s ? new Date(`${s.replace(' ', 'T')}Z`) : null);

export function fmtTime(s) {
  const d = parseUtc(s);
  if (!d || Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

export function fmtDate(s, long = true) {
  if (!s) return '';
  const d = new Date(`${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(
    'en-IN',
    long ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' } : { day: 'numeric', month: 'short', year: 'numeric' },
  );
}

export const experienceText = (c) =>
  c.experience_type === 'experienced'
    ? `${c.experience_years} year${Number(c.experience_years) === 1 ? '' : 's'} experience`
    : 'Fresher';

// Company access codes are shown as K7M4-P2XQ.
export const formatCode = (code) => (code ? `${code.slice(0, 4)}-${code.slice(4)}` : '');

export const splitList = (text, separator = /[\n,]/) =>
  String(text || '')
    .split(separator)
    .map((s) => s.trim())
    .filter(Boolean);

export const initials = (name) =>
  String(name || '')
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
