// Deletes ALL data: candidates, companies, applications, resumes and settings.
// Usage: npm run reset -- --yes
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// The same folder the server keeps resumes in (see src/db.js).
const dataDir = path.resolve(process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || path.join(root, 'data'));

if (!process.argv.includes('--yes')) {
  console.log(`This deletes the whole job fair database in MongoDB and every resume in ${dataDir}.`);
  console.log('Stop the server first, then run:  npm run reset -- --yes');
  process.exit(1);
}

const { db, closeDb, MONGODB_LABEL } = await import('../src/db.js');
await db.dropDatabase();
await closeDb();
fs.rmSync(path.join(dataDir, 'resumes'), { recursive: true, force: true });
console.log(`All data deleted (database "${db.databaseName}" at ${MONGODB_LABEL}).`);
console.log('A fresh, empty database is set up the next time the server starts.');
