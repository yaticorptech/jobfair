import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, LoaderCircle, MapPin, Plus } from 'lucide-react';
import { GENDERS, QUALIFICATIONS, QUALIFICATION_GROUPS, api } from '../lib.jsx';
import { Card, Choice, Field, Input, Select, cx } from '../ui.jsx';

export const emptyCandidate = {
  full_name: '',
  mobile: '',
  email: '',
  gender: '',
  dob: '',
  pincode: '',
  city: '',
  qualification: '',
  specialization: '',
  college: '',
  passing_year: '',
  percentage: '',
  experience_type: 'fresher',
  experience_years: '',
  last_company: '',
  last_role: '',
  skills: '',
  languages: '',
  preferred_role: '',
};

/** Picks the editable fields out of a saved candidate, as strings for the form. */
export function toForm(candidate) {
  const out = {};
  for (const key of Object.keys(emptyCandidate)) out[key] = candidate?.[key] == null ? '' : String(candidate[key]);
  if (out.experience_type !== 'experienced') out.experience_years = '';
  return out;
}

// The mobile number box keeps only digits, and never more than 10. A number that the phone fills
// in or that is pasted with the country code or a zero in front (+91 98450 12345, 098450 12345)
// loses that part, so what is left is the 10-digit number itself.
export function tenDigits(text) {
  let digits = String(text ?? '').replace(/\D/g, '');
  if (digits.length > 10) digits = digits.replace(/^0+/, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  return digits.slice(0, 10);
}

// Empty when the number is fine, otherwise what is wrong with it.
export function mobileProblem(mobile) {
  if (!/^\d{10}$/.test(mobile)) return 'Enter your 10-digit mobile number';
  if (!/^[6-9]/.test(mobile)) return 'A mobile number starts with 6, 7, 8 or 9. Please check it.';
  return '';
}

// Marks are typed freely ("72%", "7.8 CGPA", "68.5"). They must be filled in, and there must be
// a sensible number in them: a percentage up to 100 or a CGPA up to 10.
export function marksProblem(text) {
  const marks = String(text ?? '').trim();
  if (!marks) return 'Enter your percentage or CGPA';
  const number = Number((/\d+(\.\d+)?/.exec(marks) || [])[0]);
  if (!(number > 0 && number <= 100)) return 'Enter a percentage (like 72%) or a CGPA (like 7.8)';
  return '';
}

// Quick checks on the phone; the server checks everything again.
export function candidateErrors(v) {
  const e = {};
  const badMobile = mobileProblem(v.mobile);
  if (v.full_name.trim().length < 2) e.full_name = 'Enter your full name';
  if (badMobile) e.mobile = badMobile;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email.trim())) e.email = 'Enter a valid email address';
  if (!v.gender) e.gender = 'Select your gender';
  if (!v.dob) e.dob = 'Enter your date of birth';
  if (!/^[1-9]\d{5}$/.test(v.pincode || '')) e.pincode = 'Enter your 6-digit pincode';
  if (!v.city.trim()) e.city = 'Enter your city or town';
  if (!(v.languages || '').trim()) e.languages = 'Select at least one language';
  if (!v.qualification) e.qualification = 'Select your highest qualification';
  if (!v.college.trim()) e.college = 'Enter your college or institute';
  if (!v.passing_year) e.passing_year = 'Select the year of passing';
  const badMarks = marksProblem(v.percentage);
  if (badMarks) e.percentage = badMarks;
  if (v.experience_type === 'experienced' && !(Number(v.experience_years) > 0)) {
    e.experience_years = 'Enter your years of experience';
  }
  return e;
}

export function Section({ title, sub, children }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-extrabold leading-tight text-slate-900">{title}</h2>
        {sub && <p className="text-sm text-slate-500">{sub}</p>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </Card>
  );
}

// Compact: three lists share one field's width.
const DOB_SELECT = 'px-2.5! pr-1! text-[15px]!';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Date of birth as three lists: Year, Month (Jan, Feb ...), Day. The saved value is still
// "YYYY-MM-DD", and only once all three are picked; until then it is empty.
function DateOfBirth({ value, onChange, error, max }) {
  const split = (d) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
    return m ? { y: m[1], m: String(+m[2]), d: String(+m[3]) } : { y: '', m: '', d: '' };
  };
  const [parts, setParts] = useState(() => split(value));
  // A saved date loaded later (for example on "Edit my details").
  useEffect(() => {
    if (value) setParts(split(value));
  }, [value]);

  const [maxY, maxM, maxD] = max.split('-').map(Number);
  const years = useMemo(() => Array.from({ length: maxY - 1950 + 1 }, (_, i) => String(maxY - i)), [maxY]);
  const y = +parts.y;
  const months = MONTHS.map((name, i) => ({ name, n: i + 1 })).filter((mo) => !y || y < maxY || mo.n <= maxM);
  const inMonth = parts.m ? new Date(y || 2000, +parts.m, 0).getDate() : 31; // 2000 is a leap year, so 29 Feb stays possible
  const lastDay = y === maxY && +parts.m === maxM ? Math.min(inMonth, maxD) : inMonth;
  const days = Array.from({ length: lastDay }, (_, i) => String(i + 1));

  function pick(key, val) {
    const next = { ...parts, [key]: val };
    // Drop a day or month that no longer exists (31 Feb, or a month after the latest allowed date).
    const ny = +next.y;
    if (next.m && ny === maxY && +next.m > maxM) next.m = '';
    if (next.d && next.m) {
      const nd = new Date(ny || 2000, +next.m, 0).getDate();
      const cap = ny === maxY && +next.m === maxM ? Math.min(nd, maxD) : nd;
      if (+next.d > cap) next.d = '';
    }
    setParts(next);
    const full = next.y && next.m && next.d ? `${next.y}-${next.m.padStart(2, '0')}-${next.d.padStart(2, '0')}` : '';
    if (full !== value) onChange(full);
  }

  return (
    <div className="grid grid-cols-[1.2fr_1fr_0.9fr] gap-1.5">
      <Select aria-label="Year of birth" className={DOB_SELECT} value={parts.y} onChange={(e) => pick('y', e.target.value)} error={error && !parts.y} autoComplete="bday-year">
        <option value="">Year</option>
        {years.map((yr) => (
          <option key={yr}>{yr}</option>
        ))}
      </Select>
      <Select aria-label="Month of birth" className={DOB_SELECT} value={parts.m} onChange={(e) => pick('m', e.target.value)} error={error && !parts.m} autoComplete="bday-month">
        <option value="">Month</option>
        {months.map((mo) => (
          <option key={mo.n} value={String(mo.n)}>
            {mo.name}
          </option>
        ))}
      </Select>
      <Select aria-label="Day of birth" className={DOB_SELECT} value={parts.d} onChange={(e) => pick('d', e.target.value)} error={error && !parts.d} autoComplete="bday-day">
        <option value="">Day</option>
        {days.map((dd) => (
          <option key={dd}>{dd}</option>
        ))}
      </Select>
    </div>
  );
}

// Pincode first; City / town is then filled in from it (India Post data, through our server).
// The candidate can tap their area to make it exact, or type over it.
function PincodeCity({ v, set, errors }) {
  const [look, setLook] = useState({ pin: '', busy: false, data: null, error: '' });
  const [autoCity, setAutoCity] = useState('');

  useEffect(() => {
    const pin = v.pincode;
    if (!/^[1-9]\d{5}$/.test(pin || '') || look.pin === pin) return;
    let gone = false;
    setLook({ pin, busy: true, data: null, error: '' });
    api(`/public/pincode/${pin}`)
      .then((data) => {
        if (gone) return;
        setLook({ pin, busy: false, data, error: '' });
        // Fill City / town unless the candidate typed their own.
        if (!v.city.trim() || v.city === autoCity) {
          set('city', data.district);
          setAutoCity(data.district);
        }
      })
      .catch((err) => !gone && setLook({ pin, busy: false, data: null, error: err.message }));
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.pincode]);

  const found = look.data && look.pin === v.pincode ? look.data : null;
  const pickArea = (area) => {
    const city = `${area}, ${found.district}`;
    set('city', city);
    setAutoCity(city);
  };

  return (
    <>
      <Field label="Pincode" required error={errors.pincode || (look.pin === v.pincode && look.error) || undefined}>
        <div className="relative">
          <Input
            type="tel"
            inputMode="numeric"
            pattern="[0-9]{6}"
            value={v.pincode}
            onChange={(e) => set('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))}
            error={errors.pincode}
            autoComplete="postal-code"
            placeholder="6-digit pincode"
          />
          <span className="pointer-events-none absolute inset-y-0 right-4 grid place-items-center" aria-live="polite">
            {look.busy && look.pin === v.pincode ? (
              <LoaderCircle className="size-5 animate-spin text-slate-400" aria-label="Finding your area" />
            ) : found ? (
              <Check className="size-5 text-emerald-600" aria-label="Pincode found" />
            ) : null}
          </span>
        </div>
      </Field>
      <Field label="City / town" required error={errors.city} hint={found ? `${found.district} district, ${found.state}` : 'Filled in from your pincode'}>
        <Input value={v.city} onChange={(e) => set('city', e.target.value)} error={errors.city} autoComplete="address-level2" placeholder="e.g. Kaup, Udupi" maxLength={60} />
      </Field>
      {/* A few areas: tap one. Many areas: a dropdown, so the form stays tidy. */}
      {found && found.areas.length > 0 && found.areas.length <= 6 && (
        <div className="sm:col-span-2">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-700">
            <MapPin className="size-4 text-slate-400" aria-hidden="true" /> Tap your area
          </p>
          <div className="flex flex-wrap gap-2">
            {found.areas.map((area) => {
              const active = v.city === `${area}, ${found.district}`;
              return (
                <button
                  key={area}
                  type="button"
                  onClick={() => pickArea(area)}
                  aria-pressed={active}
                  className={cx(
                    'min-h-10 rounded-full border px-3.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600',
                    active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50',
                  )}
                >
                  {area}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {found && found.areas.length > 6 && (
        <Field label="Your area" hint={`${found.areas.length} areas under ${found.pincode}`} className="sm:col-span-2">
          <Select
            value={found.areas.find((area) => v.city === `${area}, ${found.district}`) || ''}
            onChange={(e) => e.target.value && pickArea(e.target.value)}
          >
            <option value="">Select your area</option>
            {found.areas.map((area) => (
              <option key={area}>{area}</option>
            ))}
          </Select>
        </Field>
      )}
    </>
  );
}

function PersonalFields({ v, set, errors }) {
  const on = (key) => (e) => set(key, e.target.value);
  const maxDob = useMemo(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 15);
    return d.toISOString().slice(0, 10);
  }, []);
  return (
    <>
      <Field label="Full name" required error={errors.full_name} className="sm:col-span-2">
        <Input value={v.full_name} onChange={on('full_name')} error={errors.full_name} autoComplete="name" placeholder="As in your certificates" maxLength={80} />
      </Field>
      <Field label="Mobile number" required error={errors.mobile}>
        {/* Only digits can be typed, and only 10 of them. */}
        <Input
          type="tel"
          inputMode="numeric"
          pattern="[0-9]{10}"
          value={v.mobile}
          onChange={(e) => set('mobile', tenDigits(e.target.value))}
          error={errors.mobile}
          autoComplete="tel-national"
          placeholder="10-digit number"
        />
      </Field>
      <Field label="Email" required error={errors.email}>
        <Input type="email" inputMode="email" value={v.email} onChange={on('email')} error={errors.email} autoComplete="email" placeholder="name@example.com" maxLength={120} />
      </Field>
      <Field as="div" label="Gender" required error={errors.gender}>
        <div className="flex gap-2">
          {GENDERS.map((g) => (
            <Choice key={g} name="gender" value={g} current={v.gender} onPick={(val) => set('gender', val)}>
              {g}
            </Choice>
          ))}
        </div>
      </Field>
      <Field as="div" label="Date of birth" required error={errors.dob}>
        <DateOfBirth value={v.dob} onChange={(val) => set('dob', val)} error={errors.dob} max={maxDob} />
      </Field>
      <PincodeCity v={v} set={set} errors={errors} />
    </>
  );
}

function EducationFields({ v, set, errors }) {
  const on = (key) => (e) => set(key, e.target.value);
  const years = useMemo(() => {
    const latest = new Date().getFullYear() + 2;
    return Array.from({ length: latest - 1979 }, (_, i) => latest - i);
  }, []);
  return (
    <>
      <Field label="Highest qualification" required error={errors.qualification} className="sm:col-span-2">
        <Select value={v.qualification} onChange={on('qualification')} error={errors.qualification}>
          <option value="">Select</option>
          {/* A long list, so it is split under headings. */}
          {QUALIFICATION_GROUPS.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.items.map((q) => (
                <option key={q}>{q}</option>
              ))}
            </optgroup>
          ))}
          <option>Other</option>
          {/* A qualification saved earlier that is no longer in the list stays selectable. */}
          {v.qualification && !QUALIFICATIONS.includes(v.qualification) && <option>{v.qualification}</option>}
        </Select>
      </Field>
      <Field label="Course / stream" error={errors.specialization} hint="e.g. BCom, Computer Science, Finance. If you chose Other, type your qualification here.">
        <Input value={v.specialization} onChange={on('specialization')} error={errors.specialization} maxLength={80} />
      </Field>
      <Field label="College / institute" required error={errors.college}>
        <Input value={v.college} onChange={on('college')} error={errors.college} autoComplete="organization" maxLength={120} />
      </Field>
      <Field label="Year of passing" required error={errors.passing_year} hint="Choose the expected year if you are still studying">
        <Select value={v.passing_year} onChange={on('passing_year')} error={errors.passing_year}>
          <option value="">Select</option>
          {years.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </Select>
      </Field>
      <Field label="Percentage / CGPA" required error={errors.percentage}>
        <Input value={v.percentage} onChange={on('percentage')} error={errors.percentage} placeholder="e.g. 72% or 7.8 CGPA" maxLength={12} />
      </Field>
    </>
  );
}

// Common languages around Udupi first, then other Indian languages. Saved as "Kannada, English".
const LANGUAGES = [
  'Kannada', 'English', 'Hindi', 'Tulu', 'Konkani', 'Malayalam', 'Beary', 'Tamil', 'Telugu', 'Marathi',
  'Urdu', 'Bengali', 'Gujarati', 'Punjabi', 'Odia', 'Arabic',
];

// A dropdown with a tick box per language; the button shows what is picked.
function LanguagePicker({ value, onChange }) {
  const picked = (value || '').split(',').map((x) => x.trim()).filter(Boolean);
  const has = (lang) => picked.some((p) => p.toLowerCase() === lang.toLowerCase());
  // Languages typed in earlier (or added below) that are not in the list.
  const extra = picked.filter((p) => !LANGUAGES.some((l) => l.toLowerCase() === p.toLowerCase()));
  const [open, setOpen] = useState(false);
  const [other, setOther] = useState('');
  const box = useRef(null);

  // Close on a tap outside, or on Escape.
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => !box.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const toggle = (lang) => onChange((has(lang) ? picked.filter((p) => p.toLowerCase() !== lang.toLowerCase()) : [...picked, lang]).join(', '));
  function addOther() {
    const name = other.trim().replace(/,/g, ' ').slice(0, 30);
    if (name && !has(name)) onChange([...picked, name].join(', ').slice(0, 120));
    setOther('');
  }

  const summary = picked.length === 0 ? '' : picked.length <= 3 ? picked.join(', ') : `${picked.slice(0, 2).join(', ')} +${picked.length - 2} more`;

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cx(
          'flex min-h-13 w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3 text-left text-base outline-none transition focus-visible:border-blue-600 focus-visible:ring-4 focus-visible:ring-blue-100',
          open ? 'border-blue-600 ring-4 ring-blue-100' : 'border-slate-200',
        )}
      >
        <span className={cx('truncate', summary ? 'text-slate-900' : 'text-slate-400')}>{summary || 'Select languages'}</span>
        <span className="flex shrink-0 items-center gap-2">
          {picked.length > 0 && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">{picked.length}</span>}
          <ChevronDown className={cx('size-5 text-slate-500 transition-transform', open && 'rotate-180')} aria-hidden="true" />
        </span>
      </button>

      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl bg-white shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/10">
          <div role="listbox" aria-multiselectable="true" aria-label="Languages" className="max-h-64 overflow-y-auto overscroll-contain p-1.5">
            {[...LANGUAGES, ...extra].map((lang) => {
              const on = has(lang);
              return (
                <label
                  key={lang}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 text-[15px] font-semibold text-slate-800 hover:bg-slate-50 has-focus-visible:bg-blue-50"
                >
                  <input type="checkbox" checked={on} onChange={() => toggle(lang)} className="sr-only" />
                  <span className={cx('grid size-5 shrink-0 place-items-center rounded-md border-2 transition', on ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300 bg-white')}>
                    {on && <Check className="size-3.5" strokeWidth={3.5} aria-hidden="true" />}
                  </span>
                  {lang}
                </label>
              );
            })}
          </div>
          <div className="flex gap-2 border-t border-slate-100 p-2">
            <input
              value={other}
              onChange={(e) => setOther(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addOther();
                }
              }}
              placeholder="Other language"
              maxLength={30}
              aria-label="Other language"
              className="min-h-11 w-full min-w-0 rounded-xl border border-slate-200 px-3 text-base outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100"
            />
            <button
              type="button"
              onClick={addOther}
              disabled={!other.trim()}
              className="inline-flex min-h-11 shrink-0 cursor-pointer items-center gap-1 rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-700 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="size-4" aria-hidden="true" /> Add
            </button>
            <button type="button" onClick={() => setOpen(false)} className="inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExperienceFields({ v, set, errors }) {
  const on = (key) => (e) => set(key, e.target.value);
  const experienced = v.experience_type === 'experienced';
  return (
    <>
      <Field as="div" label="Are you a fresher or experienced?" required className="sm:col-span-2">
        <div className="flex gap-2">
          <Choice name="experience_type" value="fresher" current={v.experience_type} onPick={(val) => set('experience_type', val)}>
            Fresher
          </Choice>
          <Choice name="experience_type" value="experienced" current={v.experience_type} onPick={(val) => set('experience_type', val)}>
            Experienced
          </Choice>
        </div>
      </Field>
      {experienced && (
        <>
          <Field label="Years of experience" required error={errors.experience_years}>
            <Input type="number" inputMode="decimal" min="0" max="50" step="0.5" value={v.experience_years} onChange={on('experience_years')} error={errors.experience_years} placeholder="e.g. 2" />
          </Field>
          <Field label="Current / last company" error={errors.last_company}>
            <Input value={v.last_company} onChange={on('last_company')} maxLength={100} />
          </Field>
          <Field label="Current / last job role" error={errors.last_role} className="sm:col-span-2">
            <Input value={v.last_role} onChange={on('last_role')} maxLength={80} />
          </Field>
        </>
      )}
      <Field label="Key skills" error={errors.skills} hint="Optional. Separate with commas" className="sm:col-span-2">
        <Input value={v.skills} onChange={on('skills')} placeholder="e.g. Tally, MS Excel, Communication" maxLength={300} />
      </Field>
      <Field as="div" label="Languages known" required error={errors.languages} hint="Tick all you can speak">
        <LanguagePicker value={v.languages} onChange={(val) => set('languages', val)} />
      </Field>
      <Field label="Job role you are looking for" error={errors.preferred_role} hint="Optional">
        <Input value={v.preferred_role} onChange={on('preferred_role')} placeholder="e.g. Accountant, Sales" maxLength={120} />
      </Field>
    </>
  );
}

// The candidate's details in three small groups. Registration shows one group per screen;
// "Edit my details" shows all three, one below the other.
export const FIELD_GROUPS = [
  { title: 'Your details', sub: 'Tell us who you are', fields: ['full_name', 'mobile', 'email', 'gender', 'dob', 'pincode', 'city'], Fields: PersonalFields },
  { title: 'Education', sub: 'Your highest qualification', fields: ['qualification', 'specialization', 'college', 'passing_year', 'percentage'], Fields: EducationFields },
  {
    title: 'Experience and skills',
    sub: 'This helps companies shortlist you',
    fields: ['experience_type', 'experience_years', 'last_company', 'last_role', 'skills', 'languages', 'preferred_role'],
    Fields: ExperienceFields,
  },
];

export function CandidateFields({ v, set, errors }) {
  return (
    <>
      {FIELD_GROUPS.map(({ title, sub, Fields }) => (
        <Section key={title} title={title} sub={sub}>
          <Fields v={v} set={set} errors={errors} />
        </Section>
      ))}
    </>
  );
}
