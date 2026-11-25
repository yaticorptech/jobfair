// Copies the data from the old SQLite database (data/jobfair.db, used before the switch to MongoDB)
// into MongoDB: candidates, companies, applications and settings. Their numbers stay the same, so
// registration numbers (JF-0001) and printed desk QR codes keep working.
// Only runs into an empty MongoDB database. Usage: npm run import:sqlite
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  DATA_DIR, MONGODB_LABEL, applications, candidates, closeDb, companies, db, setLastId, settings,
} from '../src/db.js';

const file = path.join(DATA_DIR, 'jobfair.db');
const stop = async (message, code = 0) => {
  console.log(message);
  await closeDb();
  process.exit(code);
};

if (!fs.existsSync(file)) await stop(`There is no old database at ${file}. Nothing to import.`);
if ((await companies.countDocuments()) || (await candidates.countDocuments()) || (await applications.countDocuments())) {
  await stop(`MongoDB (${db.databaseName}) already has data. Nothing was imported. Run "npm run reset -- --yes" first to start over.`, 1);
}

const old = new DatabaseSync(file, { readOnly: true });
const all = (table) => old.prepare(`SELECT * FROM ${table} ORDER BY 1`).all().map((row) => ({ ...row }));

const candidateDocs = all('candidates').map(({ password_hash, ...row }) => ({ ...row, login_key: password_hash }));
const companyDocs = all('companies').map((row) => {
  let roles;
  try {
    roles = JSON.parse(row.roles);
  } catch {
    roles = [];
  }
  return { ...row, roles: Array.isArray(roles) ? roles : [], active: Boolean(row.active), desk_id: row.desk_id ?? null };
});
const applicationDocs = all('applications');
// Every setting except the defaults the server has just written is taken from the old database.
const settingRows = all('settings');

if (candidateDocs.length) await candidates.insertMany(candidateDocs);
if (companyDocs.length) await companies.insertMany(companyDocs);
if (applicationDocs.length) await applications.insertMany(applicationDocs);
for (const { key, value } of settingRows) await settings.updateOne({ _id: key }, { $set: { value } }, { upsert: true });

const last = (docs) => docs.reduce((m, d) => Math.max(m, d.id), 0);
// SQLite never reuses a number, even of a deleted row; carry on after the highest it gave out.
const sequences = Object.fromEntries(old.prepare('SELECT name, seq FROM sqlite_sequence').all().map((r) => [r.name, r.seq]));
await setLastId('candidates', Math.max(last(candidateDocs), sequences.candidates ?? 0));
await setLastId('companies', Math.max(last(companyDocs), sequences.companies ?? 0));
await setLastId('applications', Math.max(last(applicationDocs), sequences.applications ?? 0));
old.close();

await stop(
  `Imported ${candidateDocs.length} candidates, ${companyDocs.length} companies and desks, ${applicationDocs.length} applications ` +
    `and ${settingRows.length} settings into "${db.databaseName}" at ${MONGODB_LABEL}.\n` +
    `The old file ${file} was not changed; it can be deleted once everything looks right.`,
);
