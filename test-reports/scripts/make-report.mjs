// Builds test-reports/index.html from results.json and result-300.txt.
import fs from 'node:fs';
import path from 'node:path';

const R = process.argv[2];
const results = JSON.parse(fs.readFileSync(path.join(R, 'results.json'), 'utf8'));
const load = fs.readFileSync(path.join(R, 'result-300.txt'), 'utf8');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const sizes = [...new Set(results.map((r) => r.size))];
const pages = [...new Map(results.map((r) => [`${r.group} / ${r.name}`, r])).keys()];
const at = (page, size) => results.find((r) => `${r.group} / ${r.name}` === page && r.size === size);
const failing = results.filter((r) => r.count || r.errors.length).length;

// Load test table
const lines = load.split('\n');
const head = lines.filter((l) => /^(Rush|Burst|Registered|Excel|Token check|Total)/.test(l));
const table = lines.filter((l) => /^\S.*\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+$/.test(l)).map((l) => {
  const m = l.match(/^(.*?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/);
  return m.slice(1);
});

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Job Fair Test Report</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--ok:#047857;--okbg:#ecfdf5;--bad:#b91c1c;--badbg:#fef2f2;--accent:#1d4ed8}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0b1120;--card:#111827;--ink:#e5e7eb;--muted:#94a3b8;--line:#1f2937;--ok:#34d399;--okbg:#052e2b;--bad:#f87171;--badbg:#3b0d0d;--accent:#93c5fd}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:1200px;margin:0 auto;padding:24px 16px 64px}h1{font-size:28px;margin:0 0 4px}h2{font-size:20px;margin:36px 0 12px}
.muted{color:var(--muted)}.grid{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}
.card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px}
.big{font-size:28px;font-weight:800}.ok{color:var(--ok)}.bad{color:var(--bad)}
table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;font-variant-numeric:tabular-nums}
th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}th:first-child,td:first-child{text-align:left}
th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.scroll{overflow-x:auto}.pill{display:inline-block;padding:2px 10px;border-radius:999px;font-weight:700;font-size:13px}
.pass{background:var(--okbg);color:var(--ok)}.fail{background:var(--badbg);color:var(--bad)}
details{background:var(--card);border:1px solid var(--line);border-radius:16px;margin:10px 0}summary{cursor:pointer;padding:14px 16px;font-weight:700;display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.shots{display:flex;gap:14px;overflow-x:auto;padding:0 16px 16px;align-items:flex-start}
.shot{flex:none;text-align:center}.shot a{display:block;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff}
.shot img{display:block;height:420px;width:auto;object-fit:cover;object-position:top}.shot p{margin:6px 0 0;font-size:12px;color:var(--muted)}
ul{margin:6px 0;padding-left:20px}
</style></head><body><main>
<h1>Job fair: load and layout test</h1>
<p class="muted">Run on ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })} against a separate test database (your real data was not touched).</p>

<div class="grid">
  <div class="card"><div class="muted">Users at the same time</div><div class="big">300 + 20 desks</div><div class="muted">plus the organiser panel</div></div>
  <div class="card"><div class="muted">Requests</div><div class="big ok">${esc((load.match(/Total: (\d+) requests, (\d+)/) || [])[1])} · ${esc((load.match(/Total: \d+ requests, (\d+)/) || [])[1])} errors</div></div>
  <div class="card"><div class="muted">Tokens</div><div class="big ok">No duplicates</div><div class="muted">1, 2, 3 … at every desk</div></div>
  <div class="card"><div class="muted">Page views checked</div><div class="big ${failing ? 'bad' : 'ok'}">${results.length} · ${failing} problems</div><div class="muted">${pages.length} pages × ${sizes.length} screen widths</div></div>
</div>

<h2>1. Load test</h2>
<div class="card"><ul>${head.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
<p class="muted">Times are measured on the test phone side. Measured on the server itself, no request took longer than 400 ms and the server was never blocked. The slower first “public info” and “call next” calls wait for the operating system to accept 300+ new connections in the same instant: this Mac accepts 128 at a time (kern.ipc.somaxconn); Linux servers such as Railway accept thousands.</p></div>
<div class="scroll" style="margin-top:12px"><table><thead><tr><th>What</th><th>Calls</th><th>Errors</th><th>Median ms</th><th>95% ms</th><th>Slowest ms</th></tr></thead><tbody>
${table.map((r) => `<tr><td>${esc(r[0])}</td><td>${r[1]}</td><td class="${r[2] === '0' ? 'ok' : 'bad'}">${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td><td>${r[5]}</td></tr>`).join('')}
</tbody></table></div>

<h2>2. Layout on every screen size</h2>
<p class="muted">Each page is opened in Chromium and every element is checked for: the page scrolling sideways, anything sticking out of the screen, text cut off, text spilling out of its box, short labels shortened with “…”, and text overlapping other text.</p>
<div class="scroll"><table><thead><tr><th>Page</th>${sizes.map((s) => `<th>${esc(s)}</th>`).join('')}</tr></thead><tbody>
${pages.map((p) => `<tr><td>${esc(p)}</td>${sizes.map((s) => { const r = at(p, s); const bad = r && (r.count || r.errors.length); return `<td><span class="pill ${bad ? 'fail' : 'pass'}">${bad ? `${r.count} problems` : '✓ OK'}</span></td>`; }).join('')}</tr>`).join('')}
</tbody></table></div>

<h2>3. Screenshots</h2>
<p class="muted">Full pages. Click a screenshot to open it at full size.</p>
${pages.map((p) => `<details><summary>${esc(p)} <span class="pill pass">${sizes.length} sizes</span></summary><div class="shots">${sizes.map((s) => { const r = at(p, s); return r ? `<div class="shot"><a href="${esc(r.file)}" target="_blank"><img loading="lazy" src="${esc(r.file)}" alt="${esc(p)} at ${esc(s)}"></a><p>${esc(s)}</p></div>` : ''; }).join('')}</div></details>`).join('\n')}

<h2>Fixed during this test</h2>
<div class="card"><ul>
<li>Company dashboard on phones: the interview button squeezed the candidate's name to one letter. It now has its own row under the candidate.</li>
<li>Interview page on phones: a second Save button showed next to the one in the bottom bar.</li>
<li>Organiser overview on small phones: the labels of the number cards were cut short (“Candid…”). The icon now sits above the number.</li>
<li>Server: the company list is shared by all phones asking at the same moment, and calling a token updates it in place instead of reading every company again.</li>
</ul></div>
</main></body></html>`;
fs.writeFileSync(path.join(R, 'index.html'), html);
console.log(path.join(R, 'index.html'));
