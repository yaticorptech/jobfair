// Loads SAMPLE companies and candidates so the screens can be tried out.
// The names are invented. Clear them from Admin > Overview before the real event.
import { applications as applicationsCol, candidates as candidatesCol, closeDb, companies as companiesCol, newAccessCode, now, setLastId, setSetting } from '../src/db.js';
import { newLoginKey } from '../src/auth.js';

if ((await companiesCol.countDocuments()) || (await candidatesCol.countDocuments())) {
  console.log('The database already has companies or candidates. Nothing was changed.');
  await closeDb();
  process.exit(0);
}

const companies = [
  ['Northwind Technologies (Sample)', 'B2B & B2C', '101', 'Ground Floor, PU College', ['Software Trainee', 'Technical Support Executive', 'Business Development Associate'], 'BE / BCA / MCA / BSc (CS), 2024–2026 pass-outs', '₹2.8 – 4.2 LPA', 25, 'Mangaluru, Bengaluru', 'IT services company that builds billing and inventory software for small businesses.'],
  ['BrightPath BPO (Sample)', 'BPO', '102', 'Ground Floor, PU College', ['Customer Support Executive (Voice)', 'Chat Support Executive'], 'Any degree; good Kannada and English', '₹16,000 – ₹22,000 per month', 60, 'Mangaluru', 'Customer support centre handling banking and telecom helplines.'],
  ['Sahyadri Motors (Sample)', 'Automobile & Mobile', '104', 'Ground Floor, PU College', ['Sales Consultant', 'Service Advisor', 'Technician'], 'Any degree / Diploma / ITI', '₹15,000 – ₹25,000 per month + incentives', 18, 'Udupi, Kaup', 'Two-wheeler and car dealership with showrooms across the district.'],
  ['Karavali Mobiles (Sample)', 'Automobile & Mobile', '105', 'Ground Floor, PU College', ['Store Sales Executive'], 'PUC / Any degree', '₹13,000 – ₹18,000 per month', 20, 'Udupi, Kundapura', 'Mobile phone and accessories retail chain.'],
  ['Vidya Learning Centre (Sample)', 'Education', '201', 'First Floor, PU College', ['Maths Teacher', 'Science Teacher', 'Student Counsellor'], 'BSc / MSc / BEd; MBA for counsellor', '₹18,000 – ₹30,000 per month', 12, 'Udupi', 'Coaching institute for high school and PU students.'],
  ['Malnad Retail Mart (Sample)', 'Retail', '202', 'First Floor, PU College', ['Store Supervisor', 'Cashier', 'Store Associate'], 'Any degree for supervisor; PUC for others', '₹12,000 – ₹20,000 per month', 40, 'Udupi, Manipal, Karkala', 'Supermarket chain with nine stores.'],
  ['Udaya Marketing Services (Sample)', 'Marketing', '203', 'First Floor, PU College', ['Field Marketing Executive', 'Digital Marketing Associate'], 'BBA / BCom / MBA', '₹2.2 – 3.5 LPA', 30, 'Udupi, Mangaluru', 'Marketing agency working with FMCG and consumer brands.'],
  ['CleanSpace Facility Services (Sample)', 'Housekeeping', '1', 'High School Block', ['Housekeeping Supervisor', 'Facility Executive'], 'Any degree / Diploma', '₹14,000 – ₹19,000 per month', 35, 'Manipal, Mangaluru', 'Facility management for hospitals, colleges and offices.'],
  ['Seaside Hotels & Resorts (Sample)', 'Hospitality', '2', 'High School Block', ['Front Office Associate', 'Food & Beverage Steward', 'Guest Relations Executive'], 'Any degree; hotel management preferred', '₹15,000 – ₹24,000 per month + food and stay', 22, 'Kaup, Malpe, Goa', 'Beach resort group.'],
  ['BlueLeaf Finance (Sample)', 'B2B & B2C', '3', 'High School Block', ['Relationship Officer', 'Loan Processing Executive'], 'BCom / BBA / MBA / MCom', '₹2.4 – 3.2 LPA + incentives', 28, 'Udupi, Brahmavar, Kundapura', 'Gold loan and small business finance company.'],
];

const EMPTY_DESKS = ['4', '5'];

const candidates = [
  ['Anusha Poojary', '9845000001', 'Female', '2003-06-14', 'Kaup', 'MBA', 'Finance', 'Sample Institute of Management', 2026, '74%', 'fresher', 0, '', '', 'Tally, MS Excel, Communication'],
  ['Mohammed Rizwan', '9845000002', 'Male', '2001-11-02', 'Udupi', 'Engineering (BE / BTech)', 'Computer Science', 'Sample Engineering College', 2024, '7.9 CGPA', 'experienced', 1.5, 'Demo Infotech', 'Support Engineer', 'Java, SQL, Networking'],
  ['Deepa Acharya', '9845000003', 'Female', '2002-02-21', 'Shirva', "Bachelor's Degree (BA / BCom / BSc / BBA / BCA)", 'BCom', 'Sample First Grade College', 2025, '81%', 'fresher', 0, '', '', 'Accounting, GST basics, Typing'],
  ['Praveen Dsouza', '9845000004', 'Male', '1999-08-30', 'Katapady', 'Postgraduate Degree (MA / MCom / MSc / MCA / MTech)', 'MCom', 'Sample University', 2023, '68%', 'experienced', 3, 'Demo Retail', 'Store Supervisor', 'Team handling, Billing, Stock'],
  ['Shwetha Kotian', '9845000005', 'Female', '2004-01-09', 'Padubidri', "Bachelor's Degree (BA / BCom / BSc / BBA / BCA)", 'BA', 'Sample Degree College', 2026, '70%', 'fresher', 0, '', '', 'Kannada, English, Hindi, Tulu'],
  ['Karthik Shetty', '9845000006', 'Male', '2000-05-17', 'Uchila', 'Diploma', 'Mechanical', 'Sample Polytechnic', 2021, '66%', 'experienced', 4, 'Demo Motors', 'Service Advisor', 'Two-wheeler service, Customer handling'],
];

// [candidate index, company index, role index, status]
const applications = [
  [0, 9, 0, 'shortlisted'], [0, 6, 1, 'applied'], [0, 5, 0, 'applied'],
  [1, 0, 0, 'selected'], [1, 1, 1, 'interviewed'],
  [2, 9, 1, 'applied'], [2, 5, 1, 'applied'], [2, 6, 0, 'rejected'],
  [3, 5, 0, 'shortlisted'], [3, 7, 0, 'applied'],
  [4, 4, 2, 'applied'], [4, 8, 0, 'interviewed'], [4, 1, 0, 'applied'],
  [5, 2, 1, 'selected'], [5, 3, 0, 'applied'],
];

const t = now();
const blankCompany = { industry: '', about: '', room_no: '', location: '', roles: [], eligibility: '', salary: '', vacancies: 0, job_location: '', website: '', active: true, desk_id: null, next_token: 1, created_at: t };

const companyDocs = [];
for (const [i, [name, industry, room_no, location, roles, eligibility, salary, vacancies, job_location, about]] of companies.entries()) {
  companyDocs.push({ ...blankCompany, id: i + 1, name, industry, room_no, location, roles, eligibility, salary, vacancies, job_location, about, access_code: await newAccessCode() });
}
// Two desk QR codes that no company has activated yet. A company registers through the company
// registration link and then scans one of these posters from its dashboard.
for (const room_no of EMPTY_DESKS) {
  companyDocs.push({ ...blankCompany, id: companyDocs.length + 1, name: '', room_no, location: 'High School Block', access_code: await newAccessCode() });
}
// Access codes are checked against the database, so they are made unique among themselves too.
while (new Set(companyDocs.map((c) => c.access_code)).size < companyDocs.length) {
  for (const c of companyDocs) c.access_code = await newAccessCode();
}

const candidateDocs = candidates.map(([full_name, mobile, gender, dob, city, qualification, specialization, college, passing_year, percentage, experience_type, experience_years, last_company, last_role, skills], i) => ({
  id: i + 1, full_name, mobile, email: `sample${i + 1}@example.com`, login_key: newLoginKey(), gender, dob, city, qualification,
  specialization, college, passing_year, percentage, experience_type, experience_years, last_company, last_role, skills,
  languages: '', preferred_role: '', resume_file: null, resume_name: null, created_at: t,
}));

const applicationDocs = applications.map(([c, co, roleIndex, status], i) => {
  const company = companyDocs[co];
  const token_no = company.next_token;
  company.next_token += 1;
  return { id: i + 1, candidate_id: c + 1, company_id: co + 1, role: companies[co][4][roleIndex], token_no, status, created_at: t, updated_at: t };
});

await companiesCol.insertMany(companyDocs);
await candidatesCol.insertMany(candidateDocs);
await applicationsCol.insertMany(applicationDocs);
await setLastId('companies', companyDocs.length);
await setLastId('candidates', candidateDocs.length);
await setLastId('applications', applicationDocs.length);
await setSetting('demo_data', '1');
await closeDb();

console.log(`Loaded ${companies.length} sample companies, ${EMPTY_DESKS.length} free desk QR codes and ${candidates.length} sample candidates.`);
console.log('Sample candidate login: mobile 9845000001 (to …06). There is no password.');
console.log('Company access codes are shown in Admin > Companies (the key button on each row).');
