"use strict";

/**
 * Preload that makes every sharp ENCODE fail, while leaving header reads alone.
 *
 * Loaded into the server child process with
 *   NODE_OPTIONS="--require ./test/helpers/sharp-fail.js"
 * so the failure is injected from outside the application — server code carries
 * no test hook, and the boot path under test stays byte-for-byte the production
 * one.
 *
 * `metadata()` is deliberately left working: the case being tested is "the
 * image is fine, the derivative encoder blew up", which must still return a
 * successful upload with the original intact.
 */

const sharp = require("sharp");

sharp.prototype.toFile = function simulatedFailureToFile() {
  return Promise.reject(new Error("SIMULATED_SHARP_FAILURE"));
};
sharp.prototype.toBuffer = function simulatedFailureToBuffer() {
  return Promise.reject(new Error("SIMULATED_SHARP_FAILURE"));
};
