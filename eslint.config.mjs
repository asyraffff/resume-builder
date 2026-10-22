import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  // public/fonts and public/pdfjs are copied from node_modules (see scripts/copy-fonts.mjs).
  globalIgnores(["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "public/fonts/**", "public/pdfjs/**"]),
]);
