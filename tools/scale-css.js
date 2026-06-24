// One-shot: wrap every px length in calc(<n>px * var(--font-scale)) to
// faithfully replace body{zoom:0.85} without zoom's side effects.
// Skips @media/@container/@supports condition lines (breakpoints must stay
// at true viewport px) and skips 0px. Idempotent-guarded against re-runs.
const fs = require("fs");
const path = require("path");

const file = path.resolve(__dirname, "..", "assets", "css", "styles.css");
const src = fs.readFileSync(file, "utf8");

if (src.includes("* var(--font-scale))")) {
  console.error("ABORT: already contains var(--font-scale) calc wraps — refusing double-run.");
  process.exit(1);
}

const lines = src.split(/\r?\n/);
let wrapped = 0;

const skipLine = (l) => {
  const t = l.trim();
  return t.startsWith("@media") || t.startsWith("@container") || t.startsWith("@supports");
};

// Match an optional sign + number + px, with px not followed by a letter/digit.
const pxRe = /(-?(?:\d*\.\d+|\d+))px(?![a-zA-Z0-9])/g;

const out = lines.map((line) => {
  if (skipLine(line)) return line;
  if (line.includes("--font-scale")) return line;
  return line.replace(pxRe, (m, num) => {
    if (parseFloat(num) === 0) return m; // leave 0px
    wrapped++;
    return `calc(${num}px * var(--font-scale))`;
  });
});

fs.writeFileSync(file, out.join("\n"), "utf8");
console.log("wrapped px values:", wrapped);
