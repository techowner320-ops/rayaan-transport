# RAYAAN Transportation & Logistics — Management System

Vehicles, clients, missions, fuel, maintenance, expenses and payments in one online system.
Front end: plain HTML/CSS/JS in `public/`. Database and logins: Supabase.

## Run it on your computer

```bash
npm start
```

Open http://localhost:3000.

## Accounts (administrator only)

This is a single-administrator system. There is no sign-up page.

1. Supabase dashboard > **Authentication > Users > Add user > Create new user**. Enter the email and a password and tick **Auto Confirm User**.
2. **The first account created becomes the administrator**, with full access.
3. Turn off public sign-ups: Supabase > Authentication > Sign In / Providers > turn off **Allow new users to sign up**.

Any account created after the first one has no access to the data (the database blocks it) unless you change its role in
Supabase.

## What is inside

- **Dashboard:** revenue, costs, net profit and payments received with change versus the previous period, a 6-month trend chart, cost breakdown, fleet status, vehicle performance, client balances, "needs attention" alerts and recent activity.
- **Vehicles, Clients, Missions, Fuel, Maintenance, Expenses, Payments Received:** search, filters, totals, CSV export. Vehicle and client pages show their full history and profit or balance.
- **My profile:** name, job title, phone and a profile photo (stored in Supabase Storage).
- **Settings:** company details and currency, light/dark/system theme, default dashboard period, change password, sign out everywhere, and data export (CSV per table or one JSON backup).

## Sign-in verification (code sent by email)

Signing in can need **two steps**: your password, then a 6-digit code emailed to you. The same kind of code confirms a change of sign-in email. The database enforces it: a session that skipped the code cannot read or change any business data.

It is **off until you turn it on** (Settings > Security > Sign-in verification), and turning it on first sends you a test code, so you cannot lock yourself out. Set up your email first, in the Supabase dashboard:

1. **Custom email sender (required).** Authentication > Emails > **SMTP Settings**: add your own email service (for example Resend, Brevo or Gmail with an app password). Supabase's built-in sender only allows a couple of emails per hour, which is not enough for sign-in codes.
2. **Email templates.** Authentication > Emails > Templates. Edit **Magic Link** (used for sign-in codes) and **Change Email Address**, and put `{{ .Token }}` in the message, for example:
   `<p>Your RAYAAN verification code is:</p><h2>{{ .Token }}</h2><p>It expires soon. If this was not you, ignore this email.</p>`
3. **Secure email change: off.** Authentication > Sign In / Providers > Email: turn **off** "Secure email change", so only the new address receives the code.
4. **Code expiry (optional).** Same Email page: set "Email OTP expiration" to 600 seconds (10 minutes).

If you are ever locked out because emails stop arriving, ask for help or run this in the Supabase SQL editor to switch the extra step off: `update public.settings set require_login_code = false where id = 1;`

## Currencies and languages

- **Currencies:** every money record (mission, fuel, maintenance, expense, payment) is saved in USD, GBP or SLSH (Somaliland shilling), chosen when you add it. In **Settings > Company** set the company currency and the exchange rates (1 USD equals how many GBP and SLSH). Totals and reports add everything together in the company currency using those rates.
- **Languages:** English, Somali, Arabic (right-to-left) and French. Change it in **Settings > Preferences > Language** or on the sign-in page. All text comes from `public/i18n.js`; add or fix a translation there.

## Where to look in Supabase

Open https://supabase.com/dashboard/project/aolzkeczannbtvjeqfgz and use:

- **Table Editor**: browse and edit vehicles, clients, missions, fuel, maintenance, expenses, payments.
- **SQL Editor**: run SQL, for example `select * from public.vehicles;`
- **Authentication > Users**: the admin login.
- **Database > Functions**: the profit reports (`vehicle_report`, `client_report`, `dashboard`).

## Database

`supabase/schema.sql` is the full database setup (tables, row-level security, profit reports). It has already been
applied to the project in `public/config.js`. To use a different Supabase project, run that file there and update
`public/config.js` with the new project URL and publishable key.

**Profit:** vehicle profit = revenue from **completed** missions - fuel - maintenance - expenses linked to that vehicle. Planned, ongoing and cancelled missions are not counted as revenue until they are marked Completed. An Ongoing mission automatically marks its vehicle as Working.

## Put it online and install it as an app

The app is a static website (the `public/` folder), so any static host works. It is also an installable app (PWA): once it is online over HTTPS, people can install it from the browser.

**Publish (GitHub Pages):**
1. Create a public GitHub repository for this folder and push it to `main`.
2. Publish the app with `npm run deploy`. It copies the `public/` folder to the `gh-pages` branch.
3. On GitHub: Settings > Pages > Source: branch `gh-pages`, folder `/ (root)`.
4. Your site is at `https://<account>.github.io/<repository>/`. After any change, run `npm run deploy` again to update it.

**Publish (Vercel):** import the repository at vercel.com/new. `vercel.json` already points at the `public/` folder. Nothing else to configure.

**Install it:**
- **Android / Chrome / Edge / desktop:** open the site, then use **Install app** in Settings > Preferences (or the browser's install icon in the address bar).
- **iPhone / iPad:** open the site in Safari, tap Share, then **Add to Home Screen**.
- It opens full screen with its own icon. The screens open even without internet; the data needs a connection.

## Adding fields

Forms and tables come from `public/schema.js`; add the field there and add the matching column in Supabase.
