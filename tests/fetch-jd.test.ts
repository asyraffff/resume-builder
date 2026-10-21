import { describe, expect, it } from "vitest";
import { extractJobText, isAllowedUrl, looksLikeFailure, normaliseLinkedIn } from "@/lib/fetch-jd";

const long = "We are looking for a frontend engineer with React and TypeScript experience. ".repeat(10);

describe("isAllowedUrl", () => {
  it("accepts public http(s) URLs", () => {
    expect(isAllowedUrl("https://www.linkedin.com/jobs/view/123")).not.toBeNull();
  });
  it.each(["http://localhost:3000", "http://127.0.0.1", "http://10.0.0.5/x", "http://[::1]/", "file:///etc/passwd", "ftp://x.com", "not a url", "http://db.internal/"])(
    "rejects %s",
    (u) => expect(isAllowedUrl(u)).toBeNull(),
  );
});

describe("normaliseLinkedIn", () => {
  it("turns collection links into the public job view", () => {
    const u = normaliseLinkedIn(new URL("https://www.linkedin.com/jobs/collections/recommended/?currentJobId=4012345678"));
    expect(u.toString()).toBe("https://www.linkedin.com/jobs/view/4012345678/");
  });
  it("handles slugged view URLs", () => {
    const u = normaliseLinkedIn(new URL("https://www.linkedin.com/jobs/view/frontend-engineer-at-acme-4012345678?trk=abc"));
    expect(u.toString()).toBe("https://www.linkedin.com/jobs/view/4012345678/");
  });
  it("leaves other sites alone", () => {
    expect(normaliseLinkedIn(new URL("https://jobs.lever.co/acme/1")).hostname).toBe("jobs.lever.co");
  });
});

describe("extractJobText", () => {
  it("prefers JSON-LD JobPosting", () => {
    const html = `<html><head><script type="application/ld+json">${JSON.stringify({
      "@type": "JobPosting",
      title: "Frontend Engineer",
      hiringOrganization: { name: "Acme" },
      description: `<p>${long}</p>`,
    })}</script></head><body>nav junk</body></html>`;
    const t = extractJobText(html);
    expect(t.startsWith("Frontend Engineer\n\nAcme")).toBe(true);
    expect(t).not.toContain("<p>");
  });
  it("falls back to the LinkedIn description container", () => {
    const html = `<html><body><h1>Frontend Engineer</h1><div class="description__text">${long}</div></body></html>`;
    expect(extractJobText(html)).toContain("Frontend Engineer");
  });
});

describe("looksLikeFailure", () => {
  it("detects short pages and login walls", () => {
    expect(looksLikeFailure("too short")).not.toBeNull();
    expect(looksLikeFailure("Sign in to view this job on LinkedIn. " + "x ".repeat(200))).not.toBeNull();
    expect(looksLikeFailure(long)).toBeNull();
  });
});
