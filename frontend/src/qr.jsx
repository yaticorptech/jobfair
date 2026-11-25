import { useMemo } from 'react';
import QRCode from 'qrcode';
import { DEVELOPER } from './lib.jsx';
import { cx } from './ui.jsx';

// Two kinds of QR code are printed:
//   - desk QR codes: one poster for every interview desk, each with its own desk number. They are
//     put at the desks in any order. Candidates scan one to see the company at that desk and apply.
//   - the company registration QR code: the same one for every company. A company scans it to
//     register, and then scans the desk QR code at its own desk to make that desk its own.
// The organisers print both (Admin > QR codes); a company also sees its desk QR code in its dashboard.

// Drawn as one SVG path so it stays sharp at any print size.
export function QrCode({ value, className }) {
  const { size, path } = useMemo(() => {
    const { modules } = QRCode.create(value, { errorCorrectionLevel: 'Q' });
    let d = '';
    for (let row = 0; row < modules.size; row += 1) {
      for (let col = 0; col < modules.size; col += 1) {
        if (modules.get(row, col)) d += `M${col} ${row}h1v1h-1z`;
      }
    }
    return { size: modules.size, path: d };
  }, [value]);
  const quiet = 3; // white border the scanner needs around the code
  return (
    <svg viewBox={`${-quiet} ${-quiet} ${size + quiet * 2} ${size + quiet * 2}`} shapeRendering="crispEdges" role="img" aria-label="QR code" className={className}>
      <rect x={-quiet} y={-quiet} width={size + quiet * 2} height={size + quiet * 2} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}

// Long desk names and company names get smaller letters so they still fit.
const roomSize = (room) => (room.length <= 4 ? 22 : room.length <= 7 ? 14 : room.length <= 12 ? 9 : 6.5);
const nameSize = (name) => (name.length <= 40 ? 5.6 : name.length <= 80 ? 4.6 : 3.8);

// kind "candidate": a desk QR code. A desk that no company has activated yet shows only its number.
// kind "company": the company registration QR code, which has no desk number.
export function Poster({ company = {}, url, fairName, kind = 'candidate' }) {
  const forCompany = kind === 'company';
  return (
    <div className={cx('poster', forCompany && 'poster-company')}>
      <p className="poster-head">{fairName}</p>
      <div className="poster-body">
        <div>
          <p className="poster-tag">{forCompany ? 'For companies' : 'For candidates'}</p>
          {forCompany ? (
            <p className="poster-title">Company registration</p>
          ) : company.room_no ? (
            <>
              <p className="poster-label">Interview desk</p>
              <p className="poster-room" style={{ fontSize: `${roomSize(company.room_no)}cqw` }}>
                {company.room_no}
              </p>
            </>
          ) : null}
          {!forCompany && company.name && (
            <p className="poster-name" style={{ fontSize: `${nameSize(company.name)}cqw` }}>
              {company.name}
            </p>
          )}
          {!forCompany && (company.industry || company.location) && <p className="poster-sub">{[company.industry, company.location].filter(Boolean).join(' · ')}</p>}
        </div>
        <QrCode value={url} className="poster-qr" />
        <div>
          <p className="poster-cta">{forCompany ? 'Companies: scan to register' : 'Scan to see the jobs and apply'}</p>
          {forCompany ? (
            <p className="poster-note">Register, add your jobs, then scan the desk QR code at your own desk.</p>
          ) : (
            !company.name && <p className="poster-note poster-note-quiet">Company at this desk: scan this code from your dashboard to activate it.</p>
          )}
          <p className="poster-url">{url.replace(/^https?:\/\//, '')}</p>
        </div>
      </div>
      <p className="poster-foot">Developed by {DEVELOPER.name}</p>
    </div>
  );
}

// Desk 2 comes before desk 10; desks without a number go last.
export const byDesk = (a, b) =>
  Number(!a.room_no) - Number(!b.room_no) ||
  a.room_no.localeCompare(b.room_no, undefined, { numeric: true, sensitivity: 'base' }) ||
  a.name.localeCompare(b.name);
