import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { BodyTooLargeError, readBody, readForm } from "@/lib/body";
import { MAX_DOCX_UNCOMPRESSED_BYTES, checkResumeFile, imageMediaType, sniff, zipEntries, zipUncompressedSize } from "@/lib/upload-checks";

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

async function zip(files: Record<string, string>) {
  const z = new JSZip();
  for (const [name, content] of Object.entries(files)) z.file(name, content);
  return new Uint8Array(await z.generateAsync({ type: "uint8array", compression: "DEFLATE" }));
}

describe("file sniffing", () => {
  it("recognises files by their contents", async () => {
    expect(sniff(bytes("%PDF-1.7\n..."))).toBe("pdf");
    expect(sniff(await zip({ "word/document.xml": "<w:document/>", "[Content_Types].xml": "x" }))).toBe("docx");
    expect(sniff(await zip({ "notes.txt": "hello" }))).toBe("zip");
    expect(sniff(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], "rest"))).toBe("png");
    expect(sniff(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpeg");
    expect(sniff(bytes("RIFF", [0, 0, 0, 0], "WEBPVP8 "))).toBe("webp");
    expect(sniff(bytes("GIF89a..."))).toBe("gif");
    expect(sniff(bytes("MZ\x90\x00 an exe renamed to .pdf"))).toBe("unknown");
  });

  it("reports an image's real media type, not the claimed one", () => {
    expect(imageMediaType(bytes([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(imageMediaType(bytes("%PDF-1.7"))).toBeNull();
  });
});

describe("resume file checks", () => {
  it("accepts PDFs and real Word documents", async () => {
    expect(checkResumeFile(bytes("%PDF-1.4 resume"))).toEqual({ ok: true, kind: "pdf" });
    expect(checkResumeFile(await zip({ "word/document.xml": "<w:document/>" }))).toEqual({ ok: true, kind: "docx" });
  });

  it("refuses renamed files and other zips", async () => {
    expect(checkResumeFile(bytes("MZ not a resume"))).toMatchObject({ ok: false });
    expect(checkResumeFile(await zip({ "evil.sh": "rm -rf /" }))).toMatchObject({ ok: false, error: expect.stringMatching(/isn't a Word/) });
  });

  it("refuses a Word file that would expand to a huge size (zip bomb)", async () => {
    const bomb = await zip({ "word/document.xml": "0".repeat(MAX_DOCX_UNCOMPRESSED_BYTES + 10_000_000) });
    expect(bomb.length).toBeLessThan(200_000); // tiny on disk...
    expect(zipUncompressedSize(bomb)).toBeGreaterThan(MAX_DOCX_UNCOMPRESSED_BYTES); // ...huge when opened
    expect(checkResumeFile(bomb)).toMatchObject({ ok: false, error: expect.stringMatching(/too large to open safely/) });
  }, 30_000); // building a 60 MB archive takes a few seconds when the whole suite runs in parallel

  it("reads zip directories without decompressing, and treats broken ones as unsafe", async () => {
    expect(zipEntries(await zip({ "a.txt": "aaaa", "b/c.txt": "c" }))?.map((e) => e.name).sort()).toEqual(["a.txt", "b/", "b/c.txt"]); // JSZip also records the folder
    expect(zipUncompressedSize(bytes([0x50, 0x4b, 0x03, 0x04], "truncated"))).toBe(Infinity);
  });
});

describe("size-limited body reading", () => {
  const streamed = (size: number) =>
    new Request("http://x/api", {
      method: "POST",
      body: new ReadableStream({
        start(c) {
          for (let sent = 0; sent < size; sent += 64 * 1024) c.enqueue(new Uint8Array(Math.min(64 * 1024, size - sent)));
          c.close();
        },
      }),
      // @ts-expect-error duplex is required by Node for streamed request bodies
      duplex: "half",
    });

  it("reads bodies under the limit", async () => {
    expect((await readBody(streamed(100_000), 200_000)).length).toBe(100_000);
  });

  it("stops reading as soon as the limit is passed, even without Content-Length", async () => {
    await expect(readBody(streamed(5_000_000), 1_000_000)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("rejects up front when Content-Length is too large", async () => {
    const req = new Request("http://x/api", { method: "POST", body: "x", headers: { "content-length": "999999999" } });
    await expect(readBody(req, 1000)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it("parses multipart forms", async () => {
    const fd = new FormData();
    fd.append("mode", "text");
    fd.append("file", new File(["%PDF-1.4"], "cv.pdf", { type: "application/pdf" }));
    const req = new Request("http://x/api", { method: "POST", body: fd });
    const form = await readForm(req, 100_000);
    expect(form.get("mode")).toBe("text");
    expect((form.get("file") as File).name).toBe("cv.pdf");
  });
});
