/**
 * Fonts for PDF export. Noto Sans / Noto Serif cover Latin (with accents), Greek, Cyrillic and Vietnamese; extra Noto
 * families are added as per-character fallbacks only when the resume uses that script, so a resume in English never
 * downloads the large Chinese font.
 *
 * The TTF files come from @expo-google-fonts/* and are copied to public/fonts by scripts/copy-fonts.mjs.
 */

type Weights = { regular: string; bold: string; italic?: string; boldItalic?: string };

export const BASE_FONTS: Record<"sans" | "serif", { family: string; files: Weights }> = {
  sans: {
    family: "NotoSans",
    files: {
      regular: "NotoSans_400Regular.ttf",
      bold: "NotoSans_700Bold.ttf",
      italic: "NotoSans_400Regular_Italic.ttf",
      boldItalic: "NotoSans_700Bold_Italic.ttf",
    },
  },
  serif: {
    family: "NotoSerif",
    files: {
      regular: "NotoSerif_400Regular.ttf",
      bold: "NotoSerif_700Bold.ttf",
      italic: "NotoSerif_400Regular_Italic.ttf",
      boldItalic: "NotoSerif_700Bold_Italic.ttf",
    },
  },
};

/** Scripts outside Noto Sans/Serif, with the font that covers them and how to spot them in text. */
export const SCRIPT_FONTS: { family: string; test: RegExp; files: Weights }[] = [
  {
    family: "NotoSansSC", // Chinese, plus Japanese kana and kanji
    test: /[぀-ヿ㐀-䶿一-鿿豈-﫿　-〿＀-￯]/,
    files: { regular: "NotoSansSC_400Regular.ttf", bold: "NotoSansSC_700Bold.ttf" },
  },
  { family: "NotoSansTamil", test: /[஀-௿]/, files: { regular: "NotoSansTamil_400Regular.ttf", bold: "NotoSansTamil_700Bold.ttf" } },
  {
    family: "NotoSansArabic", // Arabic and Jawi
    test: /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/,
    files: { regular: "NotoSansArabic_400Regular.ttf", bold: "NotoSansArabic_700Bold.ttf" },
  },
  {
    family: "NotoSansDevanagari", // Hindi, Marathi, Nepali
    test: /[ऀ-ॿ]/,
    files: { regular: "NotoSansDevanagari_400Regular.ttf", bold: "NotoSansDevanagari_700Bold.ttf" },
  },
  { family: "NotoSansThai", test: /[฀-๿]/, files: { regular: "NotoSansThai_400Regular.ttf", bold: "NotoSansThai_700Bold.ttf" } },
];

/** Every font file the app may need, for the copy script. */
export const ALL_FONT_FILES = [...Object.values(BASE_FONTS), ...SCRIPT_FONTS].flatMap((f) => Object.values(f.files).filter(Boolean) as string[]);

/** Fallback families needed for the given text, in priority order. */
export function scriptFallbacks(text: string): string[] {
  return SCRIPT_FONTS.filter((f) => f.test.test(text)).map((f) => f.family);
}

/** Which package each file comes from (for the copy script and tests that read fonts from node_modules). */
export function fontPackage(file: string): string {
  const family = file.split("_")[0]; // NotoSans, NotoSansSC, NotoSerif...
  const kebab = family.replace(/([a-z])([A-Z])/g, "$1-$2").replace(/([A-Z])([A-Z][a-z])/g, "$1-$2").toLowerCase(); // noto-sans-sc
  const weightDir = file.slice(family.length + 1).replace(/\.ttf$/, ""); // 400Regular_Italic
  return `@expo-google-fonts/${kebab}/${weightDir}/${file}`;
}
