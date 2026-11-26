import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { NO_ID, candidates, companies, setSetting, settings } from './db.js';

// Signing secret: from .env if given, otherwise generated once and kept in the database.
async function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const row = await settings.findOne({ _id: 'jwt_secret' });
  if (row) return row.value;
  const secret = crypto.randomBytes(48).toString('hex');
  await setSetting('jwt_secret', secret);
  return secret;
}

const SECRET = await loadSecret();

export const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'JobFair@123';
export const usingDefaultAdminPassword = !process.env.ADMIN_PASS;

export function checkAdmin(username, password) {
  const digest = (u, p) => crypto.createHash('sha256').update(`${u}\n${p}`).digest();
  return crypto.timingSafeEqual(digest(username, password), digest(ADMIN_USER, ADMIN_PASS));
}

// Candidates log in with their mobile number alone: there are no candidate passwords.
// Every registration holds a random key, and a short piece of it goes into the login token, so
// a token only works for the registration it was made for (login_key; registrations made when
// there were passwords hold their old password hash there, which serves as the key just as well).
export const newLoginKey = () => crypto.randomBytes(24).toString('hex');
const tokenKey = (key) => key.slice(-16);

export function candidateToken(row) {
  return jwt.sign({ role: 'candidate', id: row.id, k: tokenKey(row.login_key) }, SECRET, { expiresIn: '14d' });
}

export function adminToken() {
  return jwt.sign({ role: 'admin' }, SECRET, { expiresIn: '12h' });
}

function readToken(req) {
  const header = req.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  try {
    return jwt.verify(header.slice(7), SECRET);
  } catch {
    return null;
  }
}

export async function requireCandidate(req, res, next) {
  try {
    const data = readToken(req);
    if (data?.role === 'candidate') {
      const row = await candidates.findOne({ id: data.id }, NO_ID);
      if (row && tokenKey(row.login_key) === data.k) {
        req.candidate = row;
        return next();
      }
    }
    res.status(401).json({ error: 'Please log in again' });
  } catch (err) {
    next(err);
  }
}

// Everything a company does needs its desk first: until it has scanned its desk QR code, nothing else opens.
export function requireAtDesk(req, res, next) {
  if (req.atDesk) return next();
  res.status(403).json({ error: 'First scan the QR code at your desk to activate it.', code: 'scan_desk' });
}

export function requireAdmin(req, res, next) {
  if (readToken(req)?.role === 'admin') return next();
  res.status(401).json({ error: 'Please log in again' });
}

// A company's dashboard session is tied to its access code, so giving the company a new code
// logs out everyone who used the old one.
const codeKey = (code) => crypto.createHash('sha256').update(String(code)).digest('hex').slice(0, 16);

// `desk`: the desk whose QR code the company scanned in this session. Every login starts without one,
// and the candidates, queue and interviews open only once the company has scanned its desk QR code.
export function recruiterToken(company, desk = null) {
  const body = { role: 'recruiter', id: company.id, k: codeKey(company.access_code) };
  if (desk) body.desk = desk;
  return jwt.sign(body, SECRET, { expiresIn: '3d' });
}

// The desk a company sits at: the desk QR code it activated, or (placed by the organisers) its own.
export const deskOf = (company) => company.desk_id ?? (company.room_no ? company.id : null);

export async function requireRecruiter(req, res, next) {
  try {
    const data = readToken(req);
    if (data?.role === 'recruiter') {
      const row = await companies.findOne({ id: data.id }, NO_ID);
      if (row && codeKey(row.access_code) === data.k) {
        req.company = row;
        // A company scans its desk QR code once, straight after registering; from then on that
        // desk is its own and every login opens the dashboard.
        req.atDesk = Boolean(deskOf(row));
        return next();
      }
    }
    res.status(401).json({ error: 'Please log in again' });
  } catch (err) {
    next(err);
  }
}

// Failed-login throttle, kept in memory: 8 wrong tries per login id + address in 15 minutes.
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 8;
const failures = new Map();

export function tooManyAttempts(key, max = MAX_FAILURES) {
  const entry = failures.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > WINDOW_MS) {
    failures.delete(key);
    return false;
  }
  return entry.count >= max;
}

export function recordFailure(key) {
  const now = Date.now();
  if (failures.size > 5000) {
    for (const [k, v] of failures) if (now - v.first > WINDOW_MS) failures.delete(k);
  }
  const entry = failures.get(key);
  if (!entry || now - entry.first > WINDOW_MS) failures.set(key, { first: now, count: 1 });
  else entry.count += 1;
}

export function clearFailures(key) {
  failures.delete(key);
}
