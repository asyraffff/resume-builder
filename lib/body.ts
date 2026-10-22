import "server-only";

export class BodyTooLargeError extends Error {}

/**
 * Reads a request body, stopping as soon as it exceeds `maxBytes` (rather than buffering an arbitrarily large upload
 * first). Content-Length is checked up front when the client sends it.
 */
export async function readBody(req: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(req.headers.get("content-length"));
  if (declared > maxBytes) throw new BodyTooLargeError();
  if (!req.body) return new Uint8Array();
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

/** Multipart form data with a size limit. */
export async function readForm(req: Request, maxBytes: number): Promise<FormData> {
  const bytes = await readBody(req, maxBytes);
  return new Response(bytes as BodyInit, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData();
}

/** JSON with a size limit; returns null for invalid JSON. */
export async function readJson(req: Request, maxBytes: number): Promise<unknown> {
  const bytes = await readBody(req, maxBytes);
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}
