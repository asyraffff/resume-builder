/**
 * Checks on uploaded bytes, independent of the file name or the browser-reported type (both are easy to fake).
 */

/** Vercel rejects request bodies over 4.5 MB, so every upload request is kept below that. */
export const MAX_REQUEST_BYTES = 4.4 * 1024 * 1024;
export const MAX_RESUME_BYTES = 4 * 1024 * 1024;
/** A resume's text is never this long; longer means it isn't a resume (or is a decompression trick). */
export const MAX_RESUME_TEXT_CHARS = 200_000;
/** Word files are zip archives; refuse ones that would expand to more than this when opened. */
export const MAX_DOCX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

export type Sniffed = "pdf" | "docx" | "zip" | "png" | "jpeg" | "webp" | "gif" | "unknown";

/** Identifies a file from its first bytes. */
export function sniff(bytes: Uint8Array): Sniffed {
  // PDFs may have a little junk before the header; the spec allows the marker within the first 1 KB.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (head.includes("%PDF-")) return "pdf";
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) return zipHasEntry(bytes, "word/document.xml") ? "docx" : "zip";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8)) return "webp";
  if (startsWith(bytes, ascii("GIF87a")) || startsWith(bytes, ascii("GIF89a"))) return "gif";
  return "unknown";
}

type ZipEntry = { name: string; uncompressed: number };

/** Reads a zip's central directory (names and uncompressed sizes) without decompressing anything. */
export function zipEntries(bytes: Uint8Array): ZipEntry[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // End-of-central-directory record: signature 0x06054b50, within the last 64 KB + 22 bytes.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) return null;
    const uncompressed = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, uncompressed });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function zipHasEntry(bytes: Uint8Array, name: string): boolean {
  return zipEntries(bytes)?.some((e) => e.name === name) ?? false;
}

/** Total size a zip would expand to, or Infinity if its directory can't be read (treated as unsafe). */
export function zipUncompressedSize(bytes: Uint8Array): number {
  const entries = zipEntries(bytes);
  // 0xFFFFFFFF marks a ZIP64 entry whose real size is elsewhere; treat it as too large rather than guess.
  if (!entries || entries.some((e) => e.uncompressed === 0xffffffff)) return Infinity;
  return entries.reduce((n, e) => n + e.uncompressed, 0);
}

export type ResumeFileCheck = { ok: true; kind: "pdf" | "docx" } | { ok: false; error: string };

export function checkResumeFile(bytes: Uint8Array): ResumeFileCheck {
  if (bytes.length > MAX_RESUME_BYTES) return { ok: false, error: "The file is larger than 4 MB." };
  const kind = sniff(bytes);
  if (kind === "pdf") return { ok: true, kind };
  if (kind === "docx") {
    if (zipUncompressedSize(bytes) > MAX_DOCX_UNCOMPRESSED_BYTES) return { ok: false, error: "That Word file is too large to open safely." };
    return { ok: true, kind };
  }
  if (kind === "zip") return { ok: false, error: "That file isn't a Word document (.docx)." };
  return { ok: false, error: "Please upload a PDF or Word (.docx) file. This file's contents don't match either." };
}

export const IMAGE_KINDS = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif" } as const;
export type ImageMediaType = (typeof IMAGE_KINDS)[keyof typeof IMAGE_KINDS];

/** The real media type of an image from its bytes, or null if it isn't a supported image. */
export function imageMediaType(bytes: Uint8Array): ImageMediaType | null {
  const kind = sniff(bytes);
  return kind in IMAGE_KINDS ? IMAGE_KINDS[kind as keyof typeof IMAGE_KINDS] : null;
}
