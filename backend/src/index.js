import { createApp, servesPages } from './app.js';
import { ADMIN_USER, usingDefaultAdminPassword } from './auth.js';
import { DATA_DIR, MONGODB_LABEL, dataIsTemporary, db } from './db.js';

const port = Number(process.env.PORT) || 8170;

const server = createApp().listen(port, () => {
  console.log(`Blue Chip Connect server running at http://localhost:${port}`);
  if (servesPages) console.log(`Admin panel: http://localhost:${port}/admin  (user: ${ADMIN_USER})`);
  else console.log('Serving the API only. The website runs separately (the frontend folder).');
  console.log(`Database: MongoDB "${db.databaseName}" at ${MONGODB_LABEL}`);
  console.log(`Resumes are kept in ${DATA_DIR}`);
  if (dataIsTemporary) {
    console.log('WARNING: no volume is attached, so uploaded resumes will be LOST the next time this server is deployed. Add a volume to this service in Railway.');
  }
  if (usingDefaultAdminPassword) {
    console.log('WARNING: using the default admin password. Set ADMIN_PASS before going live.');
  }
});

// The usual reason the server cannot start: it is already running in another window.
server.on('error', (err) => {
  if (err.code !== 'EADDRINUSE') throw err;
  console.error(`\nPort ${port} is already in use: the Blue Chip Connect server is already running in another window.`);
  console.error('Close that one (press Ctrl+C in its window), then start this one again.\n');
  process.exit(1);
});
