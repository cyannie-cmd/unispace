# UniSpace — Campus Portal

## Where to edit things

- `website/index.html` — page structure and the login page shell.
- `website/styles.css` — colors, spacing, responsive layout, buttons, and visual design.
- `website/app.js` — readable, section-labeled JavaScript for login behavior, dashboards, schedules, reservations, user management, and the campus explorer.
- `website/setup.html` — one-time initial administrator setup page. Do not leave this publicly deployed after creating the first admin.
- `worker.js` — backend API used by the website.
- `schema.sql` — database tables and starter campus/room records for Cloudflare D1.
- `UniSpace_Demo_Database.sqlite` — local SQLite demo copy for class presentation (not connected to the deployed website).
- `UniSpace_Database_Presentation.pdf` — ERD, table descriptions, relationships, and presentation notes.
- `DATABASE_PRESENTATION.md` — editable database notes and sample SQL queries.

## Editing locally

1. Extract this ZIP into a folder.
2. Open the extracted folder in Visual Studio Code (`File → Open Folder`).
3. Edit the file that matches the part you want to change.
4. For local preview, use VS Code Live Server or a local static server. Login and database features still need the deployed API and D1 database.
5. When deploying the static website, upload the contents of the `website` folder, including `index.html`, `styles.css`, and `app.js` together. Do not upload only `index.html`.

## Database files for your presentation

Open `UniSpace_Database_Presentation.pdf` for the ER diagram and explanation of each table. Open `UniSpace_Demo_Database.sqlite` with DB Browser for SQLite if you want to show the tables and seeded building/room data. The actual hosted website uses Cloudflare D1, so you must also run `schema.sql` in the D1 Console and bind that database to `UniSpace Pages Functions API`.

The schema currently configures CBA as three floors, with rooms 101–103, 201–203, and 301–303, based on the latest requirement stated in the project conversation.

## Important

The deployed site currently showing the login screen can stay online while you edit a local copy. Deploy the website files together only when you're ready. Keep `worker.js` and `schema.sql` separate from the static website upload.

---

# UniSpace — corrected Cloudflare D1 package

## What was changed
- The normal public login page no longer shows the first-administrator setup form.
- `website/setup.html` is a separate, temporary, one-time setup page. Remove it from the public website immediately after creating the first administrator.
- All additional accounts should be created inside Administrator → User Management.
- `schema.sql` initializes the real Cloudflare D1 database; it is not uploaded as a website file.

## Correct deployment order (Cloudflare dashboard only)

1. Create/open a D1 database named `campusspace-db` at Storage & databases → D1 SQL Database.
2. Open the database Console and execute the full contents of `schema.sql`. This creates the tables and initial building/room records. Verify with `SELECT COUNT(*) AS room_count FROM rooms;`.
3. Create a **Worker with code** named `UniSpace Pages Functions API` (not a static-assets-only deployment). Paste the contents of `worker.js` in Edit Code and deploy.
4. In the API Worker, add a D1 binding: variable name `DB`, database `campusspace-db`. Save/deploy.
5. In Settings → Variables and Secrets, configure `ALLOWED_ORIGIN` as the exact origin of your main website, e.g. `https://dbms-project.YOURSUBDOMAIN.workers.dev` (no trailing slash). Add `BOOTSTRAP_SECRET` as a secret containing a long random value. Save/deploy.
6. Upload `website/index.html` and `website/setup.html` to the static website for the initial setup. The API URL setting on the main login page can be used to save the Worker URL in the current browser.
7. Visit `https://YOUR-WEBSITE-ORIGIN/setup.html`, enter the exact API Worker URL, the `BOOTSTRAP_SECRET`, and the initial admin credentials. This page calls the protected `/api/setup` endpoint; it does not store the secret.
8. Once the page confirms success, **remove `setup.html` from the public website** by redeploying/uploading the site with only `index.html`. Also delete or rotate `BOOTSTRAP_SECRET` in the API Worker. The backend setup route refuses to create another admin once a user exists, but the temporary page should still be removed.
9. Go to the main website, save the API Worker URL under Backend API settings, and sign in with the administrator credentials.
10. Create all professor and class officer accounts inside Administrator → User Management.

## Database is separate from website upload
A D1 database is a Cloudflare service, not a file that can be included in a ZIP upload. Create the D1 database in Cloudflare and execute `schema.sql` in its Console. The Worker connects to D1 through the `DB` binding.

## Database files for your presentation

Open `UniSpace_Database_Presentation.pdf` for the ER diagram and explanation of each table. Open `UniSpace_Demo_Database.sqlite` with DB Browser for SQLite if you want to show the tables and seeded building/room data. The actual hosted website uses Cloudflare D1, so you must also run `schema.sql` in the D1 Console and bind that database to `UniSpace Pages Functions API`.

The schema currently configures CBA as three floors, with rooms 101–103, 201–203, and 301–303, based on the latest requirement stated in the project conversation.

## Important
- Do not share setup secrets, passwords, or session tokens.
- This is a deadline-focused academic prototype; review and test before relying on it for real campus operations.
- Three.js loads from a hosted module and needs internet access/WebGL.


## Current redesign notes

- Product name: **UniSpace**.
- Theme: forest green, cream, and restrained BulSU red/yellow architectural accents.
- Admins see the operations overview; professors and class officers land on a weekly calendar filtered by their role.
- Campus Overview remains available to every role for checking buildings, rooms, and room availability.
- The 3D explorer follows the nine-building hand-drawn 3×3 arrangement, with distinct massing for halls, academic blocks, the Hangar, and Activity Center. Floor cutaways use actual D1 room records rather than a fixed 24-room sample.
- New account passwords use 100,000 PBKDF2 iterations to stay within Cloudflare Workers WebCrypto limits. Admins can reset a user's password without deleting the account.
- For the GitHub + Pages Functions + existing D1 migration, follow `CLOUDFLARE_PAGES_MIGRATION.md`. **Do not run `schema.sql` on your existing database.**


## New: calendar-based room reservations and admin room controls

This update adds a date-and-time availability picker. Selecting a room in the 3D Campus Explorer takes the user to Reservations with that room preselected. Users choose a date, check live one-hour slots, select an available slot, and submit a request. Availability is calculated from recurring schedules, approved reservations, and admin room closures. The API checks for conflicts again when the request is submitted and when an admin approves it.

Administrators can now:
- Add classrooms to an existing building and floor.
- Deactivate/reactivate a classroom. Deactivation is a soft removal so existing schedules and reservation history remain intact.
- Block a room for a specific date/time range (maintenance, events, etc.).
- Remove a scheduled room closure.

### Important: update an existing D1 database safely

For an existing UniSpace D1 database, do **not** rerun the full `schema.sql` just for this feature. Open the existing D1 database Console and run the complete contents of `migrations_001_room_availability.sql`. It only creates the new `room_unavailability` table and its index; it does not delete or modify existing users, passwords, buildings, rooms, schedules, or reservations.

Then deploy the updated `worker.js` and the updated contents of the `website` folder (including `app.js` and `styles.css`) to your GitHub repository / Cloudflare Pages project. Keep the existing D1 database binding named `DB` and the Pages Functions environment settings. After deployment, sign in as an administrator and open **Classrooms** to manage rooms and closures.

For a brand-new database only, the updated full `schema.sql` already includes the new table.
