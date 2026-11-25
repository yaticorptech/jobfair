# Job Fair Portal

Candidates register once, see every participating company with its **interview desk number**, apply from their
phone and get a **token number** for the interview queue. Organisers manage companies, interview desks,
candidates and results from an admin panel.

Set up for the **Free Mega Job Fair, 27 November 2026, Kaup** (details are editable in Admin > Settings).

## How the day works: QR codes

There are two kinds of QR code, both printed from **Admin > QR codes**.

1. **Desk QR codes** (blue posters with a big desk number). Organisers press **Add desks**, type **how many
   desks** there are (for example 40) and press **Generate QR codes**. Print the posters and put **one on every
   interview desk, in any order**: the number on the poster is that desk's number. Nothing about the companies
   has to be known yet. More desks can be added later; the numbering carries on.
2. **The company registration QR code** (brown poster, the same one for every company). A company scans it,
   types its company name and is in its dashboard, where it adds its details and job openings. The link inside
   it can also be sent to companies before the fair, so they register in advance.
3. **The company activates its desk.** In its dashboard the company presses **Scan the QR code at my desk** and
   points the camera at the poster on its desk (it can also take a photo of it, or simply scan the poster with
   the phone's own camera). That desk is now the company's. Instead of scanning, the company can **type the
   desk number** printed on the poster, together with its **floor number**: when it registers, in the same
   sheet, or later under **Company details**. Typing the number does exactly what scanning does.
4. **Candidates scan the desk poster** and see that company's details and jobs, and apply. A poster that no
   company has activated yet says the details are coming soon.

A desk belongs to one company at a time. A company that moves scans the poster at its new desk, and the old
desk is free again. If a company scans the poster of the wrong desk, organisers can take that desk away from it
(**Admin > Companies**, key button). Organisers can also add companies themselves (or upload them from Excel):
the company's **access code** is shown straight away, the organisers hand it over, and the company opens its
dashboard at its desk and scans the poster there. Organisers never assign desks: the posters are already printed.

## Two parts

| Folder | What it is | Where it goes online |
| --- | --- | --- |
| `frontend/` | The website: every page candidates, companies and organisers see | **Vercel** |
| `backend/` | The server: logins, tokens, Excel files, and all the data | **Railway** |

Each folder is a complete project of its own (its own `package.json`). The website talks to the server over the internet.

## Run it on your own computer

Needs Node.js 22 and **MongoDB** running on this computer (`mongodb://127.0.0.1:27017`, database `jobfair`).
On a Mac with Homebrew, start it with `mongod --config /usr/local/etc/mongod.conf` (leave that window open).
To use another MongoDB, set `MONGODB_URI` in `backend/.env`. Uploaded resumes stay in `backend/data/resumes`.

Data from before the switch to MongoDB (`backend/data/jobfair.db`) is copied over once with `npm run import:sqlite`.

```bash
npm run setup      # once: installs both parts
npm run build      # builds the website
npm start          # http://localhost:8170
```

On your own computer one address serves everything: the server also hands out the website it finds in `frontend/dist`.

| Page | Address |
| --- | --- |
| Candidate site | http://localhost:8170 |
| Organiser panel | http://localhost:8170/admin |
| Company dashboard | http://localhost:8170/company |
| One company's page (what a desk QR code opens) | http://localhost:8170/c/1 |
| Company registration (what the company QR code opens) | http://localhost:8170/r/ + the code shown in Admin > QR codes |

Organiser login is `admin` / `JobFair@123` until you set your own (see "Before going live").

To try it with sample data: `npm run seed:demo` (sample candidate login: mobile `9845000001`, no password;
it also adds two desk QR codes that no company has activated, 4 and 5). Clear the samples from **Admin > Overview > Clear sample data**.

While changing code, use `npm run dev` (pages on http://localhost:5170 with live reload).
Run the checks with `npm test`.

## Put it online: Railway (server) and Vercel (website)

Both take the code from a **GitHub repository**, so put this whole folder in one repository first.
Do the server first, because the website needs the server's address.

### 1. Server on Railway

1. In Railway: **New Project > Deploy from GitHub repo**, and choose the repository.
2. Open the service, **Settings > Root Directory**: enter `/backend`.
3. **Add a volume** to the service (right-click the service, or **New > Volume**) with the mount path `/app/data`.
   This is where uploaded resumes are kept. **Without a volume they are lost each time the server is
   deployed again**; the server's log shows a warning when no volume is attached.
   Also add a **MongoDB** service to the project (**New > Database > MongoDB**) and, on the server, add the
   variable `MONGODB_URI` = that service's `MONGO_URL` (registrations, companies and tokens are kept there).
4. **Variables** tab, add:
   - `ADMIN_PASS` = a strong password for the organiser login
   - `TRUST_PROXY` = `1`
   - optional: `ADMIN_USER` (the organiser's user name, `admin` if left out)
5. **Settings > Networking > Generate Domain**. You get an address like `https://job-fair-production.up.railway.app`.
   Opening it shows "The job fair server is running".

Railway starts the server with `npm start` and gives it the port by itself. Nothing else needs setting.

### 2. Website on Vercel

1. In Vercel: **Add New > Project**, and import the same repository.
2. **Root Directory**: choose `frontend`. Vercel recognises it as a Vite project (build `npm run build`, output `dist`).
3. **Environment Variables**, add `VITE_API_URL` = the Railway address from step 5 above (no slash at the end).
4. **Deploy**. The address Vercel gives you (or your own domain added there) is the one to share and to print in the QR codes.

If the website says "not connected to its server", `VITE_API_URL` is missing or was added after the last deploy:
add it and press **Redeploy**.

### 3. After both are online

1. Open the website's `/admin`, log in, and enter the **website** address (the Vercel one) in
   **Settings > Website address**.
2. Clear the sample data, make the desks and print the QR codes. The QR codes contain the website address.
3. Scan one company QR and one candidate QR with a phone before printing them all.

Optional: to let only your website use the server, add the variable `CORS_ORIGIN` on Railway with the
website address (several addresses separated by commas). Left out, any address may call the server; logins
are still needed for everything that is not public.

## What candidates can do

- Register: personal details, education (percentage or CGPA is required), experience, skills. There is **no password**
- Log in with the **10-digit mobile number** they registered with, nothing else
- Dashboard: registration number, search and filter companies, see interview desk number, floor/block, roles,
  eligibility, salary and vacancies
- Apply to a company (choose the role) and get a token number for that company's queue
- My applications: interview desk, token and live status (Applied, Interview done, Shortlisted, Selected, Not selected)
- Edit profile
- **Scan the desk QR code at a company's interview desk** to open that company's details straight away: open
  positions, vacancies, eligibility and salary. They can scan with the **Scan QR** tab in their
  dashboard (it uses the phone camera) or with the phone's own camera app. They can apply from
  there; if they are not logged in yet, they register or log in and come back to the same company

**About logging in with only a mobile number:** it keeps the day simple (nothing to forget), but anyone who
knows a candidate's mobile number can open that candidate's registration, see their details and tokens, and
change or withdraw applications. If that becomes a problem, the login can ask for a second detail the candidate
already knows, such as the date of birth, or an SMS code (which needs a paid SMS service).

## What companies can do

- **Register** through the company registration QR code (or the link the organisers send): type the company
  name, and they are in their dashboard. A company registers once; the dashboard shows its **access code**,
  with which colleagues log in at `/company` on another phone or a laptop
- **Activate their desk**: scan the QR code on the poster at their interview desk from the dashboard (camera
  or a photo), or type the **interview desk number** printed on it. Candidates who scan that poster then see
  the company. They also enter their **floor number**, so candidates can find the desk; both can be changed
  later under Company details
- **Company and jobs**: enter their own company details (about, industry, website) and their **job openings**.
  Each opening has the job role, number of open positions, CTC, **who can apply** and **job location** (both
  required), and a job description. Candidates see all of it on the company's page and when they apply.
  The company name is typed once (when registering); after that it stays with the organisers
- **Desk QR**: the QR code of their desk, to show on the screen or print; and the button to scan another
  poster when they move to a different desk
- See only the candidates who applied to their own company, in token order, with education,
  experience, skills and mobile number
- Set each candidate's result (Waiting, Interview done, Shortlisted, Selected, Not selected).
  The candidate sees it on their phone
- Search by token number, name or mobile, and download their list as Excel

## What organisers can do

- **Overview**: live counts, company-wise applications
- **Companies**: companies appear here when they register. Organisers can also add or edit companies one by
  one, or **upload the whole list from Excel/CSV** (download the template there). Uploading again updates
  companies with the same name (the Excel column is **Desk No**; the older **Room No** is still accepted).
  Desk numbers typed by the organisers are not used: each company links its desk by scanning the poster there.
  What a company entered itself is kept when the list is edited or uploaded again.
  The key button on each row shows which desk the company has activated, with **Take this desk away from the
  company** (for when it scanned the wrong poster), and the company's access code with a ready message to
  send; **Download logins** gives all the codes in one Excel sheet. A new code can be made if one is shared wrongly.
  Desk QR codes that no company has activated yet are listed as **Free desk QR code**
- **QR codes**: the **desk QR** posters (one poster or four per A4 page, in desk order, with a filter for
  the ones not activated yet) and the **company registration QR** poster, with the link and a ready message to
  send to companies. **Make a new one** stops the old link if it reached the wrong people
- **Candidates**: search, view details, download all as Excel
- **Applications**: filter by company (shown in token order), set each candidate's status, download as Excel
- **Settings**: event name, date, time, venue, contact numbers, notice shown to candidates, open or
  close registration and applications, limit how many companies one candidate can apply to

## Before going live

1. Set a strong `ADMIN_PASS`: on Railway under **Variables**; on your own computer copy
   `backend/.env.example` to `backend/.env` and change it there. Restart the server.
2. Clear the sample data, then make the desks (or upload the real company list).
3. The **server's data must be on a permanent disk**: on Railway that is the volume (see above). The website
   itself holds no data, which is why it can be on Vercel. Vercel and Railway both give `https://` addresses.
   **HTTPS is needed for the Scan QR tab:** phones only give the camera to `https://` pages. Without
   it the tab still works, but candidates must take a photo of the QR code instead of scanning live.
4. Back up the data. Online, download the **Candidates** and **Applications** Excel files from the organiser
   panel from time to time during the event. On your own computer, copy the `backend/data/` folder
   (it holds `jobfair.db` and the `resumes/` folder).
5. Enter the live website address in **Admin > Settings > Website address**. The desk QR codes contain this
   address, so do this **before printing** them (codes printed with a `localhost` address will not work).
6. Print the desk posters and the company registration poster from **Admin > QR codes**, scan one of each with
   a phone, and test the whole round once: register a test company, activate a desk, register a test candidate
   and apply. Send the company registration link to the companies you already know.
7. A company whose people cannot get into its dashboard can be given its access code (**Admin > Companies**, key
   button or **Download logins**).

## Where things are

```
backend/                 the server (Railway)
  src/db.js              database tables, default event details, where the data folder is
  src/routes.js          all API rules (registration checks, desks and their activation, apply, tokens, Excel)
  src/auth.js            the organiser's password, and login tokens for candidates and companies
  src/app.js             what other website addresses may call the server
  scripts/               seed-demo.js (sample data), reset.js (delete everything)
  test/                  the checks (npm test)
  data/                  the database and resumes on your own computer (never uploaded to GitHub)
  .env.example           the settings the server understands

frontend/                the website (Vercel)
  src/                   web pages (candidate/, admin/ and company/)
  src/lib.jsx            how the pages reach the server (VITE_API_URL)
  src/CompanyPage.jsx    the page a desk QR code opens
  src/company/CompanyRegister.jsx the page the company registration QR code opens
  src/company/ActivateDesk.jsx    where a company scans the QR code at its desk
  src/company/CompanyProfile.jsx  where a company enters its details and job openings
  src/company/DeskQr.jsx the company's desk QR code in its dashboard
  src/candidate/Scanner.jsx       the QR scanner (candidates' Scan QR tab, and the company's desk scan)
  src/admin/QrCodes.jsx  the printable QR posters (both kinds)
  src/admin/DesksModal.jsx        where the organiser types how many desks there are
  src/qr.jsx             how a QR code and a poster are drawn
  vercel.json            makes every page address open the website (needed for QR links)
  .env.example           the one setting the website needs

package.json             shortcuts for running both parts on one computer (setup, build, start, dev, test)
```

`npm run reset -- --yes` deletes **all** data, including real registrations. Stop the server first.

---

Developed by **Yaticorp**. The name shown on every screen and poster is set in `frontend/src/lib.jsx` (`DEVELOPER`).
