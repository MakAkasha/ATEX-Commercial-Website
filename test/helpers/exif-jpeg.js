"use strict";

/**
 * Build a JPEG that really does carry EXIF Orientation and GPS tags.
 *
 * Why by hand: sharp can set `orientation` but silently drops a GPS IFD passed
 * through `withMetadata()`/`withExif()`, so it cannot produce the fixture that
 * proves GPS is stripped. This assembles a minimal but valid APP1/EXIF segment
 * (TIFF header, IFD0 with Make + Orientation + a GPS IFD pointer, and a GPS IFD
 * with a real latitude/longitude) and splices it in directly after the SOI
 * marker of a JPEG produced by sharp.
 *
 * The result is verified by the tests that use it: sharp reads Orientation 6
 * back off it, and the marker strings are present in the raw bytes.
 */

const MAKE = "ATEX-TEST-CAM\0";

const TYPE_BYTE = 1;
const TYPE_ASCII = 2;
const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;

/** One 12-byte IFD entry. `value` is a 4-byte Buffer (inline value or offset). */
function entry(buf, at, tag, type, count, value) {
  buf.writeUInt16LE(tag, at);
  buf.writeUInt16LE(type, at + 2);
  buf.writeUInt32LE(count, at + 4);
  value.copy(buf, at + 8);
}

function u32(n) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n, 0);
  return b;
}

function u16inline(n) {
  const b = Buffer.alloc(4);
  b.writeUInt16LE(n, 0);
  return b;
}

function ascii2(s) {
  const b = Buffer.alloc(4);
  b.write(s, 0, "latin1");
  return b;
}

/** Three little-endian RATIONALs: degrees, minutes, seconds. */
function rationals(triples) {
  const b = Buffer.alloc(triples.length * 8);
  triples.forEach(([num, den], i) => {
    b.writeUInt32LE(num, i * 8);
    b.writeUInt32LE(den, i * 8 + 4);
  });
  return b;
}

/**
 * @param {number} orientation EXIF Orientation value (6 = rotate 90° CW to view)
 * @returns {Buffer} the APP1 segment payload, i.e. "Exif\0\0" + a TIFF block
 */
function buildExifPayload(orientation) {
  const makeBytes = Buffer.from(MAKE, "latin1");

  // Layout, all offsets relative to the start of the TIFF header.
  const IFD0_OFF = 8;
  const IFD0_COUNT = 3;
  const IFD0_END = IFD0_OFF + 2 + IFD0_COUNT * 12 + 4; // + next-IFD pointer
  const MAKE_OFF = IFD0_END;
  const GPS_IFD_OFF = MAKE_OFF + makeBytes.length;
  const GPS_COUNT = 5;
  const GPS_END = GPS_IFD_OFF + 2 + GPS_COUNT * 12 + 4;
  const LAT_OFF = GPS_END;
  const LON_OFF = LAT_OFF + 24;
  const TIFF_LEN = LON_OFF + 24;

  const tiff = Buffer.alloc(TIFF_LEN);
  tiff.write("II", 0, "latin1");
  tiff.writeUInt16LE(0x002a, 2);
  tiff.writeUInt32LE(IFD0_OFF, 4);

  // --- IFD0 (tags must be in ascending order) ---
  tiff.writeUInt16LE(IFD0_COUNT, IFD0_OFF);
  entry(tiff, IFD0_OFF + 2 + 0 * 12, 0x010f, TYPE_ASCII, makeBytes.length, u32(MAKE_OFF)); // Make
  entry(tiff, IFD0_OFF + 2 + 1 * 12, 0x0112, TYPE_SHORT, 1, u16inline(orientation)); // Orientation
  entry(tiff, IFD0_OFF + 2 + 2 * 12, 0x8825, TYPE_LONG, 1, u32(GPS_IFD_OFF)); // GPS IFD pointer
  tiff.writeUInt32LE(0, IFD0_OFF + 2 + IFD0_COUNT * 12); // no IFD1

  makeBytes.copy(tiff, MAKE_OFF);

  // --- GPS IFD: 24° 42' 0" N, 46° 43' 0" E (Riyadh) ---
  tiff.writeUInt16LE(GPS_COUNT, GPS_IFD_OFF);
  entry(tiff, GPS_IFD_OFF + 2 + 0 * 12, 0x0000, TYPE_BYTE, 4, Buffer.from([2, 3, 0, 0])); // GPSVersionID
  entry(tiff, GPS_IFD_OFF + 2 + 1 * 12, 0x0001, TYPE_ASCII, 2, ascii2("N\0")); // GPSLatitudeRef
  entry(tiff, GPS_IFD_OFF + 2 + 2 * 12, 0x0002, TYPE_RATIONAL, 3, u32(LAT_OFF)); // GPSLatitude
  entry(tiff, GPS_IFD_OFF + 2 + 3 * 12, 0x0003, TYPE_ASCII, 2, ascii2("E\0")); // GPSLongitudeRef
  entry(tiff, GPS_IFD_OFF + 2 + 4 * 12, 0x0004, TYPE_RATIONAL, 3, u32(LON_OFF)); // GPSLongitude
  tiff.writeUInt32LE(0, GPS_IFD_OFF + 2 + GPS_COUNT * 12);

  rationals([
    [24, 1],
    [42, 1],
    [0, 1],
  ]).copy(tiff, LAT_OFF);
  rationals([
    [46, 1],
    [43, 1],
    [0, 1],
  ]).copy(tiff, LON_OFF);

  return Buffer.concat([Buffer.from("Exif\0\0", "latin1"), tiff]);
}

/**
 * Splice an APP1/EXIF segment into a JPEG right after its SOI marker.
 * @param {Buffer} jpeg  a JPEG with no APP1 of its own
 * @param {number} [orientation]
 */
function withExifAndGps(jpeg, orientation = 6) {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error("not a JPEG (no SOI)");
  const payload = buildExifPayload(orientation);
  const header = Buffer.alloc(4);
  header.writeUInt16BE(0xffe1, 0); // APP1
  header.writeUInt16BE(payload.length + 2, 2); // segment length includes itself
  return Buffer.concat([jpeg.subarray(0, 2), header, payload, jpeg.subarray(2)]);
}

/** Marker strings/bytes that must not survive into a derivative. */
const EXIF_MAKE_MARKER = Buffer.from(MAKE.replace(/\0$/, ""), "latin1");
const GPS_LATITUDE_BYTES = rationals([
  [24, 1],
  [42, 1],
  [0, 1],
]);

module.exports = { withExifAndGps, EXIF_MAKE_MARKER, GPS_LATITUDE_BYTES, MAKE };
