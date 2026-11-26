import { MongoClient } from 'mongodb';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// The backend folder itself.
export const ROOT = path.resolve(here, '..');

// Where the uploaded resumes are kept: DATA_DIR if it is set; on Railway the attached volume
// (Railway tells the app where it is mounted); otherwise the data folder next to the code.
export const DATA_DIR = path.resolve(process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(ROOT, 'data'));
// On Railway, files outside a volume are lost every time the server is deployed again.
export const dataIsTemporary = Boolean(process.env.RAILWAY_ENVIRONMENT_NAME) && !process.env.DATA_DIR && !process.env.RAILWAY_VOLUME_MOUNT_PATH;
export const RESUME_DIR = path.join(DATA_DIR, 'resumes');

fs.mkdirSync(RESUME_DIR, { recursive: true });

// ───────────────────────── MongoDB ─────────────────────────
// MONGODB_URI (or MONGO_URL, the name Railway's MongoDB uses). Without one, the MongoDB running
// on this computer is used. The database is the one named in the address, otherwise "jobfair".
export const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL || 'mongodb://127.0.0.1:27017/jobfair';
// The address without any password in it, for messages.
export const MONGODB_LABEL = MONGODB_URI.replace(/\/\/[^@/]*@/, '//***@');

export const client = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
try {
  await client.connect();
} catch (err) {
  console.error(`\nCould not connect to MongoDB at ${MONGODB_LABEL}`);
  console.error('Start MongoDB first (on a Mac: mongod --config /usr/local/etc/mongod.conf), or set MONGODB_URI.');
  console.error(`(${err.message})\n`);
  process.exit(1);
}

const named = client.db().databaseName;
export const db = client.db(process.env.MONGODB_DB || (named === 'test' && !/\/test(\?|$)/.test(MONGODB_URI) ? 'jobfair' : named));

export const settings = db.collection('settings'); // { _id: key, value }
export const candidates = db.collection('candidates');
export const companies = db.collection('companies');
export const applications = db.collection('applications');
// Candidates who said Yes to the Government Certified AI Course when registering. Kept apart
// from candidates; nothing is saved here for a candidate who said No.
export const aiCourseLeads = db.collection('ai_course_leads');
const counters = db.collection('counters'); // { _id: collection name, seq: last number given out }

export const closeDb = () => client.close();

// Leaves MongoDB's own _id out of what is read: every record has its own number in "id".
export const NO_ID = Object.freeze({ projection: { _id: 0 } });

// A duplicate key: a mobile number, email, access code, desk or application that already exists.
export const isDuplicate = (err) => err?.code === 11000;

// Times are kept as text in UTC, "2026-11-27 09:15:00".
export const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

// Candidates, companies and applications are numbered 1, 2, 3 ... The numbers matter: a
// candidate's registration number is JF-0001, and a desk QR code poster opens /c/<number>.
export async function nextId(name) {
  const row = await counters.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' });
  return row.seq;
}

/** Makes the next number handed out for a collection follow on from `last`. */
export async function setLastId(name, last) {
  await counters.updateOne({ _id: name }, { $max: { seq: last } }, { upsert: true });
}

export async function resetIds(names) {
  await counters.deleteMany({ _id: { $in: names } });
}

// Desk QR codes. A desk is a record in the companies collection with an empty name: it has a desk
// number and its own QR code (/c/<id>), and nothing else. The posters are put at the desks in any
// order. A company registers through the company registration link, and then makes a desk its own
// by scanning the poster at that desk from its dashboard: desk_id on the company then points at
// the desk, and candidates who scan that poster see that company. One desk, one company.
// A token number belongs to one candidate at a desk. (Databases made before this have the same
// index without "unique", which is replaced.)
const tokenIndex = (await applications.indexes().catch(() => [])).find((i) => i.name === 'company_id_1_token_no_1');
if (tokenIndex && !tokenIndex.unique) await applications.dropIndex('company_id_1_token_no_1');

await Promise.all([
  candidates.createIndex({ id: 1 }, { unique: true }),
  candidates.createIndex({ mobile: 1 }, { unique: true }),
  candidates.createIndex({ email: 1 }, { unique: true }),
  companies.createIndex({ id: 1 }, { unique: true }),
  companies.createIndex({ access_code: 1 }, { unique: true }),
  companies.createIndex({ desk_id: 1 }, { unique: true, partialFilterExpression: { desk_id: { $type: 'number' } } }),
  applications.createIndex({ id: 1 }, { unique: true }),
  applications.createIndex({ candidate_id: 1, company_id: 1 }, { unique: true }),
  applications.createIndex({ company_id: 1, token_no: 1 }, { unique: true }),
  aiCourseLeads.createIndex({ candidate_id: 1 }, { unique: true }),
]);

// Each company logs in to its dashboard with an access code that the organisers hand out.
// Letters that are easy to misread (I, L, O, U) are left out.
const CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export async function newAccessCode() {
  for (;;) {
    let code = '';
    for (let i = 0; i < 8; i += 1) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    if (!(await companies.findOne({ access_code: code }, { projection: { _id: 1 } }))) return code;
  }
}

// The one link through which companies register themselves; it is what the company registration
// QR code contains. Making a new one stops the old link and every printed copy of that QR code.
export async function companyLinkCode(renew = false) {
  const saved = renew ? null : await settings.findOne({ _id: 'company_link' });
  if (saved?.value) return saved.value;
  let code = '';
  for (let i = 0; i < 10; i += 1) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  await setSetting('company_link', code);
  return code;
}

// Event details as printed on the job fair poster. All of it can be changed in Admin > Settings.
const DEFAULT_SETTINGS = {
  fair_name: 'Blue Chip Connect',
  fair_date: '2026-11-27',
  fair_time: '8:30 AM to 2:30 PM',
  venue: 'Dandatheertha PU College & Dandatheertha High School Premises, Kaup',
  organiser: 'KPCC Publicity Committee, Kaup Assembly Constituency',
  contacts: '98452 23866, 96864 24519, 99664 13103, 98453 53331, 99008 44999',
  highlights: 'Free Entry\n200+ Recruiters\n10,000+ Vacancies\nDirect Recruitment',
  eligibility:
    "Candidates with qualifications such as Bachelor's Degree (BA), Postgraduate Degree, MBA, Engineering and other relevant qualifications.",
  notice: 'Please bring 10 copies of your Resume (CV).',
  registration_open: '1',
  applications_open: '1',
  max_applications: '0',
  site_url: '',
  demo_data: '0',
};

await settings.bulkWrite(
  Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({
    updateOne: { filter: { _id: key }, update: { $setOnInsert: { value } }, upsert: true },
  })),
);

export async function getSettings() {
  const rows = await settings.find().toArray();
  return Object.fromEntries(rows.map((r) => [r._id, r.value]));
}

export async function setSetting(key, value) {
  await settings.updateOne({ _id: key }, { $set: { value: String(value) } }, { upsert: true });
}
