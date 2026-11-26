import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './db.js';
import { router } from './routes.js';

// The website, when it has been built on this same computer (npm run build). Online, the website
// lives somewhere else (the frontend folder on Vercel) and this server only answers the API.
const PAGES = path.resolve(ROOT, '../frontend/dist');
export const servesPages = fs.existsSync(path.join(PAGES, 'index.html'));

// The website may be on another address (Vercel) than this server (Railway), so browsers must be
// told that pages from there may call it. Logins travel in a header, never in cookies, so letting
// any address call the API does not let another website act as a logged-in visitor.
// CORS_ORIGIN (comma separated addresses) limits the callers to the listed websites.
function crossOrigin() {
  const only = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return (req, res, next) => {
    const origin = req.get('origin');
    const allowed = Boolean(origin) && (only.length === 0 || only.includes(origin));
    if (only.length) res.vary('Origin');
    if (allowed) {
      res.setHeader('Access-Control-Allow-Origin', only.length ? origin : '*');
      // Lets the page read the file name of an Excel or resume download.
      res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
    }
    if (req.method !== 'OPTIONS') return next();
    // The browser's question before a real request: "may I send this?"
    if (allowed) {
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Max-Age', '7200');
    }
    res.status(204).end();
  };
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Behind nginx / a hosting proxy, set TRUST_PROXY=1 so each visitor's own address is seen.
  if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

  // "upgrade-insecure-requests" is switched off so the app also opens over plain http
  // (for example from a phone on the same Wi-Fi while testing). Use HTTPS when it goes live.
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { 'upgrade-insecure-requests': null } },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));

  app.use('/api', crossOrigin());
  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use('/api', router);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  if (servesPages) {
    // The service worker (push alerts) is always checked for a newer copy.
    app.use(
      express.static(PAGES, {
        index: false,
        maxAge: '1h',
        setHeaders: (res, file) => {
          if (file.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
        },
      }),
    );
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(PAGES, 'index.html'));
    });
  } else {
    app.get('/', (req, res) => res.type('text').send('The Blue Chip Connect server is running. The website is served separately (the frontend folder).'));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Request is too large' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
  });

  return app;
}
