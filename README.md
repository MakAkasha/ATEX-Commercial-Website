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

## Operations

### Database backup

```bash
npm run backup:db
```

Creates timestamped snapshots under `server/backups/` (main DB + WAL/SHM when present).

### Regression (smoke flow)

```bash
npm run regression -- --base http://127.0.0.1:5173 --user <admin-user> --pass <admin-pass>
```

### Blog content tools (database-writing)

Three tools write directly to the blog `posts` table:

- `tools/import-blog-seeds.js` — imports the markdown seed files in `content-src/blog-seed/` into `posts` (insert on new slug, update on existing).
- `tools/rename-blog-slugs.js` — renames machine-generated slugs (`P422904`, ...) to the readable slugs defined in `server/data/blogRedirects.js`.
- `tools/strip-blog-internal-guidance.js` — trims leaked internal content-brief sections off the end of `posts.content_html`.

All three are **preview by default**: an argument-less run reports the exact rows and values it would change and writes nothing. Add `--apply` to write. `--dry-run` is still accepted and means the same as the default. `--help` prints usage.

```bash
node tools/import-blog-seeds.js                 # preview
node tools/import-blog-seeds.js --apply         # write
```

Database resolution order is the same for all three, and matches the server (`server/db.js`):

1. `--db <path>`
2. `DB_PATH` environment variable
3. `server/data.sqlite`

The resolved absolute path is printed before anything else. A missing database file is an error — these tools never create one.

### Fix product image paths

Repairs two problems that live in the database rather than in the code (the
catalog seed only runs when the catalog is empty, so it never corrects an
existing row):

- **Broken images** — a row points at a file that is not on disk while a sibling
  with the same name and a different extension is (for example `.png` recorded
  when only `.jpg` was committed).
- **Oversized images** — a row still points at a `.png` when a much smaller
  `.webp` sits next to it.

Preview first (this is the default — an argument-less run writes nothing):

```bash
npm run fix:product-images
```

Apply. **Back up the database first** — this rewrites live product rows:

```bash
npm run backup:db
npm run fix:product-images -- --apply --i-have-a-backup
```

Both flags are required to write; `--apply` on its own is refused. Only the
`image` column is written, inside one transaction. Rows with no file and no
usable sibling are reported for manual attention, never guessed at.

Options:

- `--db <path>` — database file (default `$DB_PATH`, else `server/data.sqlite`)
- `--assets-root <path>` — directory served as `/assets` (default `<repo>/assets`)
- `--dry-run` — alias for the default preview mode
- `--help` — usage

### Image derivatives (responsive WebP/AVIF)

Every image uploaded through the admin panel keeps its **original file untouched**
and gains a set of derivatives beside it, generated with `sharp`.

**Path convention** — derivative locations are *derived*, never stored. There is
no database column and no migration; a consumer builds the path from the
original's URL:

```
<dir>/<basename-without-extension>-<width>.<format>
```

For an original at `/uploads/images/2026/07/1753900000000-a1b2c3.png`:

```
/uploads/images/2026/07/1753900000000-a1b2c3-320.webp    (thumbnail)
/uploads/images/2026/07/1753900000000-a1b2c3-320.avif
/uploads/images/2026/07/1753900000000-a1b2c3-480.webp
/uploads/images/2026/07/1753900000000-a1b2c3-480.avif
/uploads/images/2026/07/1753900000000-a1b2c3-768.webp
/uploads/images/2026/07/1753900000000-a1b2c3-768.avif
/uploads/images/2026/07/1753900000000-a1b2c3-1280.webp
/uploads/images/2026/07/1753900000000-a1b2c3-1280.avif
```

Rules (all defined in one place, `server/utils/imageDerivatives.js`):

- Widths `320, 480, 768, 1280`; formats WebP (quality 80) and AVIF (quality 52).
- **Never upscales.** A width at or above the source's displayed width is
  skipped, so a 200px-wide source produces nothing.
- **Metadata is stripped** (EXIF, XMP, IPTC, GPS) and the EXIF orientation is
  baked into the pixels of every derivative. The original keeps its metadata.
- Sources above **50 megapixels** are rejected (`IMAGE_TOO_LARGE`) — the 5 MB
  upload cap does not bound *decoded* size, so this is the decompression-bomb
  guard. Unreadable/corrupt files are rejected as `INVALID_FILE_CONTENT`.
- Animated GIF/WebP sources are left alone; a still derivative of an animation
  would be a silent content change.
- Derivative generation is **best effort**. If `sharp` fails, the upload still
  succeeds with the original and a structured warning is logged.

`POST /api/uploads/images` returns the derivative set alongside the unchanged
`url` field:

```json
{ "ok": true, "url": "/uploads/images/2026/07/....png", "width": 1600, "height": 1000,
  "derivatives": [{ "url": "...-320.webp", "width": 320, "height": 200, "format": "webp", "bytes": 7480 }] }
```

For images already committed under `assets/`, the same set is produced by a
one-off tool. It is **preview by default** — an argument-less run encodes every
derivative in memory to report the real byte count and writes nothing:

```bash
node tools/generate-image-derivatives.js                  # preview
node tools/generate-image-derivatives.js --apply          # write
node tools/generate-image-derivatives.js --dir uploads --apply
```

It never modifies or deletes a source, never overwrites an existing file without
`--force`, and skips anything already up to date (mtime comparison), so re-runs
are cheap. `--help` lists the full exclusion set (SVG/ICO, favicons and touch
icons, files under 8 KB, sources 320px or narrower, animated images).

## Icons (SVG sprite)

Public-site icons come from a single local sprite, `assets/icons/sprite.svg`.
Templates never write markup by hand — they call the `icon()` view helper:

```ejs
<%- icon('whatsapp') %>                          <!-- decorative (the default) -->
<%- icon('bolt', { className: 'myThing__icon' }) %>
<%- icon('phone', { label: 'اتصال' }) %>          <!-- when the icon is the only meaning -->
```

Decorative is the default and gets `aria-hidden="true"`; pass `label` only when
the icon carries meaning that no adjacent text does.

The helper reads the sprite at boot, so the set of valid names *is* the sprite.
An unknown name renders nothing rather than a dangling `<use>` — see the header
comment in `server/utils/icon.js` for why that is the right failure mode.

To add an icon: copy the glyph from the Font Awesome Free package
(`@fortawesome/fontawesome-free@6.5.0`, `svgs/<style>/<name>.svg`), strip the
`<svg>` wrapper, keep the original `viewBox`, add `fill="currentColor"` to each
path, and paste it in as `<symbol id="icon-<name>">`.

This replaced a Font Awesome 6.5.0 stylesheet loaded from `cdnjs.cloudflare.com`
(~102 KB of CSS, plus up to three woff2 files, ~300 KB) that existed to draw 22
glyphs. Nothing on the public site loads third-party CSS or fonts any more.

### Icon licence attribution

Icons in `assets/icons/sprite.svg` are from **Font Awesome Free 6.5.0** by
@fontawesome — <https://fontawesome.com>. They are licensed under
**CC BY 4.0** (<https://creativecommons.org/licenses/by/4.0/>).
Copyright 2023 Fonticons, Inc. Full Font Awesome Free licence:
<https://fontawesome.com/license/free>. The same attribution is carried in a
comment at the top of the sprite file itself.

## Scripts

- `npm run dev` — run with nodemon
- `npm start` — run production server
- `npm run backup:db` — backup SQLite files
- `npm run create-admin -- <u> <p>` — create admin account
- `npm run regression -- ...` — run regression script
- `npm run fix:product-images` — preview product image path repairs (add `-- --apply --i-have-a-backup` to write)

## Developer

- **Mohamed Okasha**
- Website: **https://okasha.cv**
- GitHub: **https://github.com/MakAkasha**

---

If you need support, enhancements, or custom integrations for this project, please get in touch through the developer website.
