// Opens every page of the job fair at phone, tablet and desktop widths, takes a full-page screenshot
// and checks the layout: page scrolling sideways, things sticking out of the screen, cut-off text,
// text spilling out of its box, and text overlapping other text.
// Usage: node ui-audit.mjs <base url> <output folder>
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE = process.argv[2] || 'http://127.0.0.1:8199';
const OUT = process.argv[3] || './ui';
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });

const WIDTHS = [
  { name: 'phone-360', width: 360, height: 780, mobile: true },
  { name: 'phone-390', width: 390, height: 844, mobile: true },
  { name: 'tablet-768', width: 768, height: 1024, mobile: true },
  { name: 'laptop-1024', width: 1024, height: 768, mobile: false },
  { name: 'desktop-1440', width: 1440, height: 900, mobile: false },
];

const api = async (method, url, token, body) => {
  const res = await fetch(`${BASE}/api${url}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
};

// Logins and ids to visit
const admin = (await api('POST', '/admin/login', null, { username: 'admin', password: process.env.ADMIN_PASS || 'LoadTest@123' })).token;
const companyList = await api('GET', '/admin/companies', admin);
const firstCompany = companyList.find((c) => c.name);
const freeDesk = companyList.find((c) => !c.name && !c.holder);
const recruiter = (await api('POST', '/recruiter/login', null, { code: firstCompany.access_code })).token;
const candidate = (await api('POST', '/auth/login', null, { mobile: process.env.MOBILE || '9100000001' })).token;
const linkCode = (await api('GET', '/admin/company-link', admin)).code;
const rows = (await api('GET', '/recruiter/applications?limit=500', recruiter)).rows;
const done = rows.find((r) => r.interview?.ratings?.length) ?? rows[0];
const waiting = rows.find((r) => r.status === 'applied') ?? rows[0];

const PAGES = [
  { group: 'Public', name: 'Landing', url: '/' },
  { group: 'Public', name: 'Register', url: '/register' },
  { group: 'Public', name: 'Candidate login', url: '/login' },
  { group: 'Public', name: 'Desk QR page (not logged in)', url: `/c/${firstCompany.desk_id || firstCompany.id}` },
  ...(freeDesk ? [{ group: 'Public', name: 'Desk QR not activated yet', url: `/c/${freeDesk.id}` }] : []),
  { group: 'Public', name: 'Company registration', url: `/r/${linkCode}` },
  { group: 'Candidate', name: 'Companies', url: '/dashboard', role: 'candidate' },
  { group: 'Candidate', name: 'My applications', url: '/dashboard/applications', role: 'candidate' },
  { group: 'Candidate', name: 'Profile', url: '/dashboard/profile', role: 'candidate' },
  { group: 'Candidate', name: 'Company page (applied)', url: `/c/${firstCompany.desk_id || firstCompany.id}`, role: 'candidate' },
  { group: 'Company', name: 'Company login', url: '/company/login' },
  { group: 'Company', name: 'Candidates and queue', url: '/company', role: 'recruiter' },
  { group: 'Company', name: 'Company and jobs', url: '/company', role: 'recruiter', click: 'Company and jobs' },
  { group: 'Company', name: 'Desk QR', url: '/company', role: 'recruiter', click: 'Desk QR' },
  { group: 'Company', name: 'Interview (saved)', url: `/company/interview/${done.id}`, role: 'recruiter' },
  { group: 'Company', name: 'Interview (new)', url: `/company/interview/${waiting.id}`, role: 'recruiter' },
  { group: 'Organiser', name: 'Organiser login', url: '/admin/login' },
  { group: 'Organiser', name: 'Overview', url: '/admin', role: 'admin' },
  { group: 'Organiser', name: 'Companies', url: '/admin/companies', role: 'admin' },
  { group: 'Organiser', name: 'QR codes', url: '/admin/qr', role: 'admin' },
  { group: 'Organiser', name: 'Candidates', url: '/admin/candidates', role: 'admin' },
  { group: 'Organiser', name: 'Applications', url: '/admin/applications', role: 'admin' },
  { group: 'Organiser', name: 'Settings', url: '/admin/settings', role: 'admin' },
].filter((p) => !ONLY || ONLY.test(p.name));

const KEYS = { candidate: 'jobfair_token', admin: 'jobfair_admin_token', recruiter: 'jobfair_company_token' };
const TOKENS = { candidate, admin, recruiter };

// Runs inside the page: finds layout problems.
function audit() {
  const vw = document.documentElement.clientWidth;
  const issues = [];
  const label = (el) => {
    const text = (el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ');
    return text ? `"${text.slice(0, 50)}${text.length > 50 ? '…' : ''}"` : `<${el.tagName.toLowerCase()} class="${String(el.className).slice(0, 40)}">`;
  };
  const visible = (el, st) => st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity) > 0.05;
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (/(auto|scroll)/.test(getComputedStyle(p).overflowX)) return true;
    }
    return false;
  };
  const isSrOnly = (el) => el.closest('.sr-only') || getComputedStyle(el).clip.startsWith('rect(0');
  const isFloating = (el) => {
    for (let p = el; p && p !== document.body; p = p.parentElement) {
      const pos = getComputedStyle(p).position;
      if (pos === 'fixed' || pos === 'sticky') return true;
    }
    return false;
  };

  const docOverflow = document.documentElement.scrollWidth - vw;
  if (docOverflow > 1) issues.push({ type: 'Page scrolls sideways', detail: `the page is ${docOverflow}px wider than the screen` });

  let truncated = 0;
  const texts = [];
  for (const el of document.body.querySelectorAll('*')) {
    const st = getComputedStyle(el);
    if (!visible(el, st) || isSrOnly(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    if ((r.right > vw + 1 || r.left < -1) && !inScroller(el)) {
      issues.push({ type: 'Sticks out of the screen', detail: `${label(el)} reaches ${Math.round(r.left)}–${Math.round(r.right)}px (screen ${vw}px)` });
    }
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!ownText || st.display === 'inline') continue;
    if (el.scrollWidth > el.clientWidth + 1) {
      if (st.textOverflow === 'ellipsis') {
        truncated += 1;
        // Shortened with "…" on purpose, but squeezed so much that it cannot be read
        const text = el.innerText.trim();
        if (el.clientWidth < 60 && text.length > 4) issues.push({ type: 'Text squeezed to a few letters', detail: `${label(el)} gets only ${el.clientWidth}px` });
        // A short label (one or two words) is something people must read in full, unlike a long description
        else if (text.split(/\s+/).length <= 2 && text.length <= 16 && !/^[\d\s,.+-]+$/.test(text)) issues.push({ type: 'Short label cut short', detail: `${label(el)} needs ${el.scrollWidth}px, has ${el.clientWidth}px` });
      }
      else if (st.overflowX !== 'visible') issues.push({ type: 'Text cut off', detail: `${label(el)} needs ${el.scrollWidth}px, has ${el.clientWidth}px` });
      else if (!inScroller(el) && el.tagName !== 'TEXTAREA' && el.tagName !== 'SELECT') issues.push({ type: 'Text spills out of its box', detail: `${label(el)} needs ${el.scrollWidth}px, has ${el.clientWidth}px` });
    }
    if (!isFloating(el)) texts.push({ el, r });
  }
  // Text on top of other text
  for (let i = 0; i < texts.length; i += 1) {
    for (let j = i + 1; j < texts.length; j += 1) {
      const a = texts[i];
      const b = texts[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (x > 4 && y > 4) issues.push({ type: 'Text overlaps other text', detail: `${label(a.el)} and ${label(b.el)}` });
    }
  }
  return { issues: issues.slice(0, 25), count: issues.length, truncated, height: document.documentElement.scrollHeight };
}

const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-x64/chrome-headless-shell`,
});
const results = [];
for (const size of WIDTHS) {
  for (const page of PAGES) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: size.mobile ? 2 : 1,
      isMobile: size.mobile && size.width < 700,
      hasTouch: size.mobile,
    });
    if (page.role) {
      await context.addInitScript(([key, token]) => localStorage.setItem(key, token), [KEYS[page.role], TOKENS[page.role]]);
    }
    const tab = await context.newPage();
    const errors = [];
    tab.on('pageerror', (err) => errors.push(err.message));
    await tab.goto(`${BASE}${page.url}`, { waitUntil: 'networkidle' });
    if (page.click) {
      await tab.getByRole('tab', { name: page.click }).click();
      await tab.waitForLoadState('networkidle');
    }
    await tab.evaluate(() => document.fonts.ready);
    await tab.waitForTimeout(400);
    const found = await tab.evaluate(audit);
    const file = `shots/${size.name}--${page.group}-${page.name}`.replace(/[^a-z0-9/-]+/gi, '-').toLowerCase() + '.jpg';
    await tab.screenshot({ path: path.join(OUT, file), fullPage: true, type: 'jpeg', quality: 70 });
    results.push({ ...page, size: size.name, width: size.width, file, ...found, errors });
    process.stdout.write(found.count || errors.length ? 'x' : '.');
    await context.close();
  }
}
await browser.close();
fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
const bad = results.filter((r) => r.count || r.errors.length);
console.log(`\n${results.length} page views checked, ${bad.length} with problems`);
for (const r of bad) {
  console.log(`- ${r.group} / ${r.name} @ ${r.size}: ${r.count} problem(s)${r.errors.length ? `, JS error: ${r.errors[0]}` : ''}`);
  for (const i of r.issues.slice(0, 4)) console.log(`    ${i.type}: ${i.detail}`);
}
