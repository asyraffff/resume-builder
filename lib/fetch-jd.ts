import * as cheerio from "cheerio";
import { BlockedAddressError, safeFetch } from "./safe-fetch";

export type FetchJdResult = { ok: true; text: string } | { ok: false; reason: string };

const MIN_LENGTH = 300;
const LOGIN_WALL = /(sign in|log in|join now|authwall|create an account).{0,80}(to (view|see|continue)|linkedin)/i;

export function isAllowedUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.toLowerCase();
  // Block local/private targets (basic SSRF guard).
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    /^\d+\.\d+\.\d+\.\d+$/.test(host) ||
    host.includes(":") ||
    host.startsWith("[")
  ) {
    return null;
  }
  return url;
}

/** LinkedIn share links often look like /jobs/collections/...?currentJobId=123 — normalise to the public view URL. */
export function normaliseLinkedIn(url: URL): URL {
  if (!url.hostname.endsWith("linkedin.com")) return url;
  const id = url.searchParams.get("currentJobId") ?? url.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)/)?.[1];
  return id ? new URL(`https://www.linkedin.com/jobs/view/${id}/`) : url;
}

export function extractJobText(html: string): string {
  const $ = cheerio.load(html);

  // 1. JSON-LD JobPosting (LinkedIn public pages and many ATS boards provide this).
  let fromJsonLd = "";
  $('script[type="application/ld+json"]').each((_, el) => {
    if (fromJsonLd) return;
    try {
      const data = JSON.parse($(el).text());
      const nodes = Array.isArray(data) ? data : data["@graph"] ?? [data];
      const job = nodes.find((n: { "@type"?: string }) => n?.["@type"] === "JobPosting");
      if (job) {
        const desc = cheerio.load(String(job.description ?? "")).text();
        const org = job.hiringOrganization?.name ?? "";
        fromJsonLd = [job.title, org, desc].filter(Boolean).join("\n\n");
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  });
  if (fromJsonLd.length >= MIN_LENGTH) return fromJsonLd.trim();

  // 2. Known description containers.
  const title = $("h1").first().text().trim();
  for (const sel of [".description__text", ".show-more-less-html__markup", "#job-description", '[class*="job-description"]', '[class*="jobDescription"]', "main", "article"]) {
    const t = $(sel).first().text().replace(/\s+\n/g, "\n").replace(/[ \t]+/g, " ").trim();
    if (t.length >= MIN_LENGTH) return [title, t].filter(Boolean).join("\n\n");
  }

  // 3. Whole body as a last resort.
  $("script, style, nav, header, footer, noscript").remove();
  return $("body").text().replace(/\s+/g, " ").trim();
}

export function looksLikeFailure(text: string): string | null {
  if (text.length < MIN_LENGTH) return "The page didn't contain a readable job description.";
  if (text.length < 1500 && LOGIN_WALL.test(text)) return "The page requires signing in.";
  return null;
}

export async function fetchJobDescription(raw: string): Promise<FetchJdResult> {
  const parsed = isAllowedUrl(raw.trim());
  if (!parsed) return { ok: false, reason: "That doesn't look like a valid public web address." };
  const url = normaliseLinkedIn(parsed);

  // Follow redirects manually so every hop passes the same host check.
  let res: Awaited<ReturnType<typeof safeFetch>> | null = null;
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    try {
      // safeFetch refuses to connect if the host resolves to a private address (checked per connection).
      res = await safeFetch(current, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          Accept: "text/html",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      const blocked = err instanceof Error && (err.cause instanceof BlockedAddressError || err instanceof BlockedAddressError);
      return { ok: false, reason: blocked ? "That address isn't allowed." : "Couldn't reach that page." };
    }
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) break;
    const next = isAllowedUrl(new URL(location, current).toString());
    if (!next) return { ok: false, reason: "The page redirected somewhere we can't fetch." };
    if (next.pathname.includes("authwall") || next.pathname.includes("/login")) {
      return { ok: false, reason: "The page requires signing in." };
    }
    current = next;
    res = null;
  }
  if (!res) return { ok: false, reason: "Too many redirects." };
  if (!res.ok) return { ok: false, reason: `The site responded with ${res.status}.` };
  const html = await readCapped(res, 2_000_000);
  const text = extractJobText(html).slice(0, 30_000);
  const failure = looksLikeFailure(text);
  return failure ? { ok: false, reason: failure } : { ok: true, text };
}

/** Reads at most `max` bytes of a response, so a huge page can't exhaust memory. */
async function readCapped(res: Awaited<ReturnType<typeof safeFetch>>, max: number): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  let total = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    out += decoder.decode(value, { stream: true });
    if (total >= max) {
      await reader.cancel();
      break;
    }
  }
  return out + decoder.decode();
}
