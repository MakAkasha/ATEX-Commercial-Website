"use strict";

/**
 * Upload pipeline: magic-byte gating, image derivative generation, and the
 * guarantees the admin panel depends on.
 *
 * The contract under test, in one sentence: an accepted upload leaves the
 * ORIGINAL byte-for-byte on disk at the URL it already returned, and adds
 * stripped, correctly-oriented WebP/AVIF derivatives beside it — and every way
 * derivative generation can go wrong degrades to "upload succeeded, no
 * derivatives" rather than to a failed upload.
 *
 * UPLOADS_DIR is pointed at a throwaway directory in the OS temp dir, so no
 * test can write into the repository's real uploads/ tree.
 */

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, it, before, after } = require("node:test");

const sharp = require("sharp");

const { startServer } = require("./helpers/server");
const { withExifAndGps, EXIF_MAKE_MARKER, GPS_LATITUDE_BYTES } = require("./helpers/exif-jpeg");

const ADMIN_USERNAME = "test-admin";
const ADMIN_PASSWORD = "test-admin-password-9f2c";

const WIDTHS = [320, 480, 768, 1280];
const FORMATS = ["webp", "avif"];

/** Throwaway uploads root. Mirrors the DB guard in helpers/server.js. */
function makeTempUploadsDir(label) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `atex-test-uploads-${label}-`));
  const resolved = path.resolve(dir);
  if (!resolved.toLowerCase().startsWith(path.resolve(os.tmpdir()).toLowerCase() + path.sep)) {
    throw new Error(`Refusing to use an uploads dir outside the OS temp dir: ${resolved}`);
  }
  return resolved;
}

function removeTempUploadsDir(dir) {
  const resolved = path.resolve(dir);
  if (!path.basename(resolved).startsWith("atex-test-uploads-")) return;
  if (!resolved.toLowerCase().startsWith(path.resolve(os.tmpdir()).toLowerCase() + path.sep)) return;
  fs.rmSync(resolved, { recursive: true, force: true });
}

function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function login(srv) {
  const res = await srv.post(
    "/api/auth/login",
    { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
    { jar: true, headers: { origin: srv.origin } }
  );
  assert.equal(res.status, 200, "admin login should succeed");
}

// Reached through globalThis because the repo's ESLint globals list predates
// these two being Node built-ins, and the lint config is not this PR's to edit.
const { FormData, File } = globalThis;

/** POST a multipart file to an upload route as the logged-in admin. */
function postFile(srv, route, field, filename, type, buffer) {
  const form = new FormData();
  form.set(field, new File([buffer], filename, { type }));
  return srv.post(route, form, { json: false, jar: true, headers: { origin: srv.origin } });
}

/**
 * Assert the status and return the parsed body. Reads the body exactly once so
 * a failure message can quote it without making the body unusable.
 */
async function expectJson(res, status) {
  const text = await res.text();
  assert.equal(res.status, status, `expected ${status}, got ${res.status}: ${text}`);
  return JSON.parse(text);
}

/** Map a returned /uploads/... URL back onto the throwaway uploads root. */
function toDiskPath(uploadsDir, url) {
  assert.ok(url.startsWith("/uploads/"), `unexpected upload url: ${url}`);
  return path.join(uploadsDir, ...url.slice("/uploads/".length).split("/"));
}

const solidPng = (width, height) =>
  sharp({ create: { width, height, channels: 3, background: { r: 32, g: 96, b: 160 } } })
    .png()
    .toBuffer();

describe("upload derivatives", () => {
  let srv;
  let uploadsDir;

  before(async () => {
    uploadsDir = makeTempUploadsDir("main");
    srv = await startServer({
      label: "uploads",
      env: {
        DEFAULT_ADMIN_ENABLED: "true",
        DEFAULT_ADMIN_USERNAME: ADMIN_USERNAME,
        DEFAULT_ADMIN_PASSWORD: ADMIN_PASSWORD,
        UPLOADS_DIR: uploadsDir,
      },
    });
    await login(srv);
  });

  after(async () => {
    await srv.stop();
    removeTempUploadsDir(uploadsDir);
  });

  it("keeps the original byte-identical and adds the full derivative set", async () => {
    const source = await solidPng(1600, 1000);
    const res = await postFile(srv, "/api/uploads/images", "image", "wide.png", "image/png", source);
    const body = await expectJson(res, 200);
    assert.equal(body.ok, true);
    assert.match(body.url, /^\/uploads\/images\/\d{4}\/\d{2}\/[\w-]+\.png$/);

    // The original must be exactly what was sent — no re-encode, no strip, no
    // rotate. `url` still points at it, so existing consumers are unaffected.
    const originalPath = toDiskPath(uploadsDir, body.url);
    const onDisk = fs.readFileSync(originalPath);
    assert.equal(onDisk.length, source.length, "original size changed");
    assert.equal(sha256(onDisk), sha256(source), "original checksum changed");

    // Full set: 4 widths x 2 formats, none of them upscaling a 1600px source.
    assert.equal(body.derivatives.length, WIDTHS.length * FORMATS.length);

    const base = path.basename(originalPath, ".png");
    for (const width of WIDTHS) {
      for (const format of FORMATS) {
        const found = body.derivatives.find((d) => d.width === width && d.format === format);
        assert.ok(found, `missing ${width}px ${format} derivative`);

        // Path convention: <dir>/<base>-<width>.<format>, derived, never stored.
        assert.equal(path.basename(found.url), `${base}-${width}.${format}`);

        const diskPath = toDiskPath(uploadsDir, found.url);
        assert.ok(fs.existsSync(diskPath), `derivative not on disk: ${found.url}`);
        assert.equal(fs.statSync(diskPath).size, found.bytes, "reported size disagrees with disk");

        const meta = await sharp(diskPath).metadata();
        assert.equal(meta.width, width);
        assert.equal(meta.height, Math.round((1000 * width) / 1600));
        // AVIF is AV1 inside a HEIF container, which is what sharp reports back.
        assert.equal(meta.format, format === "avif" ? "heif" : format);
        if (format === "avif") assert.equal(meta.compression, "av1");
      }
    }
  });

  it("strips EXIF/GPS and bakes the EXIF orientation into the derivatives", async () => {
    const plain = await sharp({
      create: { width: 900, height: 600, channels: 3, background: { r: 20, g: 140, b: 90 } },
    })
      .jpeg()
      .toBuffer();
    // Orientation 6 = "rotate 90° clockwise to display", so the displayed image
    // is 600 wide x 900 tall even though the stored pixels are 900x600.
    const source = withExifAndGps(plain, 6);

    // Sanity-check the fixture itself before trusting a negative assertion.
    const sourceMeta = await sharp(source).metadata();
    assert.equal(sourceMeta.orientation, 6, "fixture lost its EXIF orientation");
    assert.ok(source.includes(EXIF_MAKE_MARKER), "fixture lost its EXIF Make tag");
    assert.ok(source.includes(GPS_LATITUDE_BYTES), "fixture lost its GPS latitude");

    const res = await postFile(srv, "/api/uploads/images", "image", "geotagged.jpg", "image/jpeg", source);
    const body = await expectJson(res, 200);

    // Reported dimensions are the DISPLAYED ones, not the stored ones.
    assert.equal(body.width, 600);
    assert.equal(body.height, 900);

    // The original keeps its EXIF — we never rewrite what the admin uploaded.
    const original = fs.readFileSync(toDiskPath(uploadsDir, body.url));
    assert.equal(sha256(original), sha256(source), "original was modified");

    // Displayed width is 600, so 768 and 1280 would upscale and are skipped.
    assert.deepEqual(
      [...new Set(body.derivatives.map((d) => d.width))].sort((a, b) => a - b),
      [320, 480]
    );

    for (const d of body.derivatives) {
      const buf = fs.readFileSync(toDiskPath(uploadsDir, d.url));
      const meta = await sharp(buf).metadata();

      // Orientation applied: the derivative is portrait, and carries no
      // orientation tag of its own for a viewer to apply a second time.
      assert.equal(meta.width, d.width);
      assert.equal(meta.height, Math.round((900 * d.width) / 600));
      assert.ok(meta.height > meta.width, "orientation was not applied");
      assert.equal(meta.orientation, undefined, "derivative still carries an orientation tag");

      // Metadata stripped: no EXIF block, and neither marker survives anywhere
      // in the file's bytes.
      assert.equal(meta.exif, undefined, "derivative still carries an EXIF block");
      assert.ok(!buf.includes(EXIF_MAKE_MARKER), "EXIF Make survived into the derivative");
      assert.ok(!buf.includes(GPS_LATITUDE_BYTES), "GPS latitude survived into the derivative");
    }
  });

  it("never upscales: a 200px-wide source produces no derivatives at all", async () => {
    const source = await solidPng(200, 120);
    const res = await postFile(srv, "/api/uploads/images", "image", "tiny.png", "image/png", source);
    const body = await expectJson(res, 200);
    assert.deepEqual(body.derivatives, [], "a 200px source must not produce 320/480/768/1280 variants");

    const originalPath = toDiskPath(uploadsDir, body.url);
    assert.equal(sha256(fs.readFileSync(originalPath)), sha256(source));

    // Nothing named <base>-<width>.<format> exists next to it.
    const base = path.basename(originalPath, ".png");
    const siblings = fs.readdirSync(path.dirname(originalPath));
    for (const width of WIDTHS) {
      for (const format of FORMATS) {
        assert.ok(!siblings.includes(`${base}-${width}.${format}`), `unexpected ${width}px ${format} file`);
      }
    }
  });

  it("rejects a corrupt image that passes the magic-byte check", async () => {
    // Valid PNG signature, garbage after it: gets past the 12-byte sniff, and
    // only a real header read can tell it is not an image.
    const source = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      crypto.randomBytes(4096),
    ]);

    const before = countFiles(uploadsDir);
    const res = await postFile(srv, "/api/uploads/images", "image", "corrupt.png", "image/png", source);
    assert.deepEqual(await expectJson(res, 400), { error: "INVALID_FILE_CONTENT" });

    // The rejected file is not left behind.
    await settle();
    assert.equal(countFiles(uploadsDir), before, "a rejected upload was left on disk");
  });

  it("rejects a decompression bomb that fits inside the 5 MB cap", async () => {
    // 8000x8000 = 64 MP, above the 50 MP budget, but a flat-colour PNG of it is
    // only ~200 KB on the wire. This is the exact shape of the attack the cap
    // exists for.
    const source = await sharp({
      create: { width: 8000, height: 8000, channels: 3, background: { r: 255, g: 0, b: 0 } },
      limitInputPixels: false,
    })
      .png({ compressionLevel: 9 })
      .toBuffer();
    assert.ok(source.length < 5 * 1024 * 1024, "fixture must fit the upload cap to be meaningful");

    const before = countFiles(uploadsDir);
    const res = await postFile(srv, "/api/uploads/images", "image", "bomb.png", "image/png", source);
    assert.deepEqual(await expectJson(res, 400), { error: "IMAGE_TOO_LARGE" });

    await settle();
    assert.equal(countFiles(uploadsDir), before, "a rejected bomb was left on disk");
  });

  it("rejects a spoofed video and still accepts a real one", async () => {
    const spoofed = Buffer.concat([Buffer.from("MZ"), crypto.randomBytes(2048)]);
    const bad = await postFile(srv, "/api/uploads/videos", "video", "clip.mp4", "video/mp4", spoofed);
    assert.deepEqual(await expectJson(bad, 400), { error: "INVALID_FILE_CONTENT" });

    // An MP4 whose extension was stripped: makeStorage() renames it to .mp4,
    // which is exactly why the byte check has to be the thing that decides.
    const ftyp = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x18]),
      Buffer.from("ftypisom"),
      Buffer.alloc(64),
    ]);
    const good = await postFile(srv, "/api/uploads/videos", "video", "clip", "video/mp4", ftyp);
    const body = await expectJson(good, 200);
    assert.match(body.url, /\.mp4$/);
    assert.equal(sha256(fs.readFileSync(toDiskPath(uploadsDir, body.url))), sha256(ftyp));

    // WebM and Ogg go through the same table.
    const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(64)]);
    const okWebm = await postFile(srv, "/api/uploads/videos", "video", "a.webm", "video/webm", webm);
    assert.equal(okWebm.status, 200);

    const spoofedWebm = await postFile(srv, "/api/uploads/videos", "video", "b.webm", "video/webm", ftyp);
    assert.equal(spoofedWebm.status, 400, "an mp4 declared as webm must be rejected");
  });
});

describe("upload derivatives when sharp fails", () => {
  let srv;
  let uploadsDir;

  before(async () => {
    uploadsDir = makeTempUploadsDir("sharpfail");
    srv = await startServer({
      label: "uploadsfail",
      env: {
        DEFAULT_ADMIN_ENABLED: "true",
        DEFAULT_ADMIN_USERNAME: ADMIN_USERNAME,
        DEFAULT_ADMIN_PASSWORD: ADMIN_PASSWORD,
        UPLOADS_DIR: uploadsDir,
        // Injected from outside the app; see test/helpers/sharp-fail.js.
        NODE_OPTIONS: "--require ./test/helpers/sharp-fail.js",
      },
    });
    await login(srv);
  });

  after(async () => {
    await srv.stop();
    removeTempUploadsDir(uploadsDir);
  });

  it("still returns a successful upload with the original intact", async () => {
    const source = await solidPng(1600, 1000);
    const res = await postFile(srv, "/api/uploads/images", "image", "wide.png", "image/png", source);

    // A derivative failure must not fail the upload.
    const body = await expectJson(res, 200);
    assert.equal(body.ok, true);
    assert.deepEqual(body.derivatives, [], "no derivatives should be reported when the encoder fails");

    const originalPath = toDiskPath(uploadsDir, body.url);
    assert.equal(sha256(fs.readFileSync(originalPath)), sha256(source), "original must survive untouched");

    // Failure is logged, not swallowed.
    assert.match(srv.logs(), /upload_derivative_failed/);
    assert.match(srv.logs(), /SIMULATED_SHARP_FAILURE/);
  });
});

function countFiles(dir) {
  let n = 0;
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(d, entry.name));
      else n += 1;
    }
  };
  walk(dir);
  return n;
}

/** fs.unlink() on the reject path is fire-and-forget; give it a tick. */
function settle() {
  return new Promise((r) => setTimeout(r, 150));
}
