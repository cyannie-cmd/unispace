# UniSpace — GitHub + Cloudflare Pages Functions + D1

## Important: preserve the existing database

Your current Cloudflare D1 database (`campusspace-db`) is the source of truth. **Do not delete it, recreate it, or run the seed schema again on top of it.** This migration reuses the same D1 database and keeps its user, room, schedule, and reservation records.

The existing `bul su-api` Worker can remain deployed while the new Pages site is tested. The Pages Function adapter in `functions/api/[[path]].js` forwards `/api/*` requests to the same API implementation in `worker.js`.

## Repository layout

Keep this structure at the GitHub repository root:

```text
UniSpace/
├── functions/
│   └── api/
│       └── [[path]].js
├── website/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   └── setup.html
├── worker.js
├── schema.sql
├── CLOUDFLARE_PAGES_MIGRATION.md
└── README_START_HERE.md
```

Cloudflare Pages will publish the `website` folder as the static output and deploy the root `functions` folder as Pages Functions.

## Create the GitHub repository

1. Sign in to GitHub and create a new repository named `unispace-campus-portal`.
2. Keep it **Private** while it contains project code and configuration.
3. Upload the contents of this project folder, not the ZIP file itself. The `functions` folder must remain at the repository root, beside `website`.
4. Commit the files to the `main` branch.

## Connect GitHub to Cloudflare Pages

1. In Cloudflare, open **Workers & Pages → Create application → Pages → Connect to Git**.
2. Choose the `unispace-campus-portal` repository and the `main` branch.
3. Framework preset: **None**.
4. Build command: leave blank.
5. Build output directory: `website`.
6. Root directory: `/` (repository root).
7. Deploy the project.

## Bind the EXISTING D1 database

In the new Pages project:

1. Open **Settings → Functions → D1 database bindings** (the exact section label may vary).
2. Add a binding with variable name **DB**.
3. Select the existing database **campusspace-db**. Do not create a new D1 database.
4. Save and redeploy.

## Configure the Pages Function environment

1. Open Pages **Settings → Environment variables**.
2. Add `ALLOWED_ORIGIN` with the exact deployed Pages origin, for example `https://unispace-campus-portal.pages.dev` (no trailing slash).
3. You do not need `BOOTSTRAP_SECRET` for normal operation because the initial administrator already exists. Keep the old Worker secret disabled/removed after confirming the original setup is complete.
4. Save and redeploy.

## Point the website to its own Pages API

The updated front end defaults its API URL to the same website origin. The API routes are `/api/login`, `/api/me`, `/api/buildings`, etc. If the browser has an old saved API URL, open the login page's **Backend API settings**, replace it with the new Pages origin, and save.

## Verify before switching over

1. Open `https://YOUR-PAGES-ORIGIN/api/health`. It should return JSON showing `database: "D1"`.
2. Sign in using an existing administrator account.
3. Confirm User Management lists the same accounts as before.
4. Confirm the room count, schedules, and reservations are still present.
5. Test an existing professor/officer account. If it was created while the old Worker used an unsupported 150,000 PBKDF2 iteration count, an administrator can use **Reset password** in User Management to set a new password using the corrected 100,000-iteration format. This does not delete or recreate the account or its other records.
6. Only after these checks pass should you start using the Pages URL as the main portal URL.

## Database safety

- Do not run `schema.sql` again on the existing database; it is for a brand-new empty database only.
- Do not delete the old API Worker or D1 database during testing.
- Keep the old API Worker deployed until the Pages Function version has passed the checks above.
- The Pages Function adapter imports the same `worker.js`; it does not copy or migrate data.


## Deploying the room reservation update without losing data

1. Keep using the **same existing D1 database**. Do not create a replacement database.
2. In D1 → Console, run `migrations_001_room_availability.sql` from the project ZIP. This is additive and preserves all existing rows and user password hashes.
3. Push the updated `worker.js`, `functions/`, and `website/` files to the same GitHub repository. Cloudflare Pages will redeploy from GitHub.
4. Confirm the Pages Functions D1 binding is still named `DB` and points to the original database.
5. Sign in and test room availability, then use the admin **Classrooms** page to add rooms or create temporary room closures.

The new booking calendar displays one-hour slots from 08:00 through 17:00. Slots are hidden as unavailable when they overlap a recurring class, an approved reservation, or an administrator room closure. A final server-side conflict check is also performed on submission and approval.
