// Runs before `npm run dev`: makes sure the local MongoDB is up, so the server does not stop at start.
// If MongoDB is already running, or backend/.env points to a MongoDB elsewhere, it does nothing.
// Otherwise it starts mongod in the background (it keeps running after dev stops) and waits for it.
import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, openSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');

function configuredUri() {
  const envFile = path.join(root, 'backend/.env');
  const fromFile = existsSync(envFile)
    ? readFileSync(envFile, 'utf8').match(/^\s*(?:MONGODB_URI|MONGO_URL)\s*=\s*['"]?([^'"\s]+)/m)?.[1]
    : undefined;
  return process.env.MONGODB_URI || process.env.MONGO_URL || fromFile;
}

const portOpen = () =>
  new Promise((resolve) => {
    const s = net.connect(27017, '127.0.0.1');
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
  });

const uri = configuredUri();
if (uri && !/\/\/(127\.0\.0\.1|localhost)(:27017)?\//.test(uri)) process.exit(0);
if (await portOpen()) { console.log('MongoDB is already running.'); process.exit(0); }

try { execSync('command -v mongod', { stdio: 'ignore' }); } catch {
  console.error('MongoDB is not installed (mongod not found). Install it, or set MONGODB_URI in backend/.env.');
  process.exit(1);
}

const config = ['/opt/homebrew/etc/mongod.conf', '/usr/local/etc/mongod.conf'].find(existsSync);
let args;
if (config) {
  args = ['--config', config];
} else {
  const dbPath = path.join(root, 'backend/data/mongo');
  mkdirSync(dbPath, { recursive: true });
  args = ['--dbpath', dbPath, '--bind_ip', '127.0.0.1'];
}

const log = openSync(path.join(root, 'backend/data/mongod-dev.log'), 'a');
spawn('mongod', args, { detached: true, stdio: ['ignore', log, log] }).unref();
console.log('Starting MongoDB…');

for (let i = 0; i < 60; i++) {
  if (await portOpen()) { console.log('MongoDB is running.'); process.exit(0); }
  await new Promise((r) => setTimeout(r, 500));
}
console.error('MongoDB did not start within 30 seconds. See backend/data/mongod-dev.log.');
process.exit(1);
