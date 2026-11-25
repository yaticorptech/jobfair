import { useMemo } from 'react';
import { GENDERS, QUALIFICATIONS, QUALIFICATION_GROUPS } from '../lib.jsx';
import { Card, Choice, Field, Input, Select } from '../ui.jsx';

export const emptyCandidate = {
  full_name: '',
  mobile: '',
  email: '',
  gender: '',
  dob: '',
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
  if (!v.city.trim()) e.city = 'Enter your city or town';
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
      <Field label="Date of birth" required error={errors.dob}>
        <Input type="date" value={v.dob} onChange={on('dob')} error={errors.dob} max={maxDob} min="1950-01-01" autoComplete="bday" />
      </Field>
      <Field label="City / town" required error={errors.city} className="sm:col-span-2">
        <Input value={v.city} onChange={on('city')} error={errors.city} autoComplete="address-level2" placeholder="e.g. Kaup, Udupi" maxLength={60} />
      </Field>
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
      <Field label="Languages known" error={errors.languages} hint="Optional">
        <Input value={v.languages} onChange={on('languages')} placeholder="e.g. Kannada, English, Hindi" maxLength={120} />
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
  { title: 'Your details', sub: 'Tell us who you are', fields: ['full_name', 'mobile', 'email', 'gender', 'dob', 'city'], Fields: PersonalFields },
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
