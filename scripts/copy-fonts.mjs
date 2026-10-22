// Copies the PDF export fonts (and the pdf.js worker used by the preview) from node_modules into public/
// (run automatically before dev and build).
// The font list lives in lib/export/fonts.ts; this script reads it so the two never drift apart.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const require = createRequire(path.join(root, "package.json"));
const source = readFileSync(path.join(root, "lib/export/fonts.ts"), "utf8");
const files = [...new Set([...source.matchAll(/"(Noto\w+?_\d{3}\w*?\.ttf)"/g)].map((m) => m[1]))];

const toPackagePath = (file) => {
  const family = file.split("_")[0];
  const kebab = family.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase();
  const weightDir = file.slice(family.length + 1).replace(/\.ttf$/, "");
  return `@expo-google-fonts/${kebab}/${weightDir}/${file}`;
};

const out = path.join(root, "public/fonts");
mkdirSync(out, { recursive: true });
let copied = 0;
for (const file of files) {
  const from = require.resolve(toPackagePath(file));
  const to = path.join(out, file);
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
  copyFileSync(from, to);
  copied++;
}
console.log(`fonts: ${files.length} available in public/fonts (${copied} copied)`);

// The preview renders PDF pages with pdf.js, which runs its parser in a web worker loaded from this file.
const workerFrom = require.resolve("pdfjs-dist/build/pdf.worker.min.mjs");
const workerDir = path.join(root, "public/pdfjs");
mkdirSync(workerDir, { recursive: true });
copyFileSync(workerFrom, path.join(workerDir, "pdf.worker.min.mjs"));
console.log("pdf.js worker copied to public/pdfjs");
