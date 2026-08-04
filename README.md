# ATEX New Website

Informative website project for **ATEX Commercial (أتكس التجارية)**.

- **Website version:** `0.4.3`
- **Production URL:** https://atex.sa
- **Purpose:** Corporate/informative presence that presents ATEX services, solutions, industries, and company profile.

## About ATEX Commercial (أتكس التجارية)

**ATEX Commercial** is a Saudi company delivering smart technology solutions across automation, low-current systems, and digital infrastructure. The company focuses on practical, scalable implementations that improve operations, safety, and user experience for residential, commercial, hospitality, governmental, and industrial environments.

This website serves as the official public-facing information platform for the company, including key service offerings, sector-specific solutions, contact channels, and managed content pages.

## Stack

- Node.js + Express
- EJS SSR views
- Vanilla JS + CSS (RTL)
- SQLite (`better-sqlite3`)

## Quick Start (Development)

```bash
npm install
npm run dev
```

Server default URL: `http://127.0.0.1:5173`

## Production Setup

1. Copy env template:

```bash
copy .env.example .env
```

2. Update required values in `.env`:

- `NODE_ENV=production`
- `SESSION_SECRET` (**required**, 16+ chars)
- `SESSION_COOKIE_SECURE=true` (when using HTTPS)
- `TRUST_PROXY=true` (when behind reverse proxy)

3. Start app:

```bash
npm start
```

## Security & Hardening (implemented)

- Centralized environment config (`server/config.js`)
- Strict production checks for session secret
- Helmet security headers + CSP enabled
- Session hardening (`httpOnly`, `sameSite`, secure cookies in prod)
- Global and route-specific rate limiting (including contact form)
- Request/error structured logging
- Health endpoints:
  - `GET /healthz` (liveness)
  - `GET /readyz` (readiness + DB check)

## Default Admin Bootstrap (Optional)

For first-time setup only (change immediately before production):

```env
DEFAULT_ADMIN_ENABLED=true
DEFAULT_ADMIN_USERNAME=admin
DEFAULT_ADMIN_PASSWORD=change-me-now
```

Behavior:
- Seeds default admin only when **admins table is empty**.
- If admin(s) already exist, no automatic overwrite.

Manual admin creation is also available:

```bash
npm run create-admin -- <username> <password>
```

## Social Proof Logos Convention

Home page social logos now support auto-discovery from:

`assets/social-logos/partner-1.svg`, `partner-2.svg`, ...

Rules:
- Files matching `partner-<number>.svg` are loaded automatically.
- Display order is numeric ascending.
- If no partner files are found, legacy fallback logos are used.

## Operations

### Database backup

```bash
npm run backup:db
```

Creates one timestamped snapshot per run under `server/backups/`, written with
SQLite's `VACUUM INTO`. The output is a single self-contained database file
(WAL contents already folded in, no `-wal`/`-shm` sidecars to keep with it) and
is verified with `PRAGMA integrity_check` before the run reports success. Safe
to take against a running server.

### Regression (smoke flow)

```bash
npm run regression -- --base http://127.0.0.1:5173 --user <admin-user> --pass <admin-pass>
```

### Blog seed importer (database-writing)

`tools/import-blog-seeds.js` imports the markdown seed files in
`content-src/blog-seed/` into the `posts` table (insert on new slug, update on
existing).

It is **preview by default**: an argument-less run reports the exact rows and values it would change and writes nothing. Add `--apply` to write. `--dry-run` is still accepted and means the same as the default. `--help` prints usage.

```bash
node tools/import-blog-seeds.js                 # preview
node tools/import-blog-seeds.js --apply         # write
```

**Deploy ordering — restart the app before running these tools.** They open the
database raw and never migrate it; only `server/db.js migrate()` does, and only
at app boot. Run the importer against a database the new app version has not yet
booted against and it stops with `DATABASE_NOT_MIGRATED` (the seed files carry
SEO columns that the migration adds). Order per deploy:

1. Deploy the code and **restart the app** — this migrates the database.
2. `npm run backup:db`
3. `node tools/import-blog-seeds.js` (preview), then `--apply`.

`import-blog-seeds.js` publishes a post it inserts, and leaves the `published`
value of a post it updates exactly as it found it — re-importing never
republishes something an admin unpublished.

Database resolution order matches the server (`server/db.js`):

1. `--db <path>`
2. `DB_PATH` environment variable
3. `server/data.sqlite`

The resolved absolute path is printed before anything else. A missing database file is an error — the tool never creates one.

## Scripts

- `npm run dev` — run with nodemon
- `npm start` — run production server
- `npm run backup:db` — write one verified SQLite snapshot to `server/backups/`
- `npm run create-admin -- <u> <p>` — create admin account
- `npm run regression -- ...` — run regression script

## Developer

- **Mohamed Okasha**
- Website: **https://okasha.cv**
- GitHub: **https://github.com/MakAkasha**

---

If you need support, enhancements, or custom integrations for this project, please get in touch through the developer website.
