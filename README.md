# Resume Tailor

Four steps: **Upload** a resume → **ATS check** → add one or more **job descriptions** (paste, link, or screenshot) → **Tailor & export** a separate resume for each job with honest AI suggestions, drag-and-drop editing, and PDF or Word export.

## Setup

```bash
npm install
cp .env.example .env.local   # then set ANTHROPIC_API_KEY
npm run dev                  # http://localhost:3000
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm test` | Unit tests (ATS checks, suggestion patches, JD fetching, upload checks, rate limits, PDF/DOCX export) |
| `npm run test:e2e` | End-to-end tests in a real browser against a production build on port 3200. AI responses are replayed from `tests/e2e/fixtures.ts`, so no API key or credits are needed. First time: `npx playwright install chromium` |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run build` | Production build |

GitHub Actions (`.github/workflows/ci.yml`) runs lint, the type check, unit tests and end-to-end tests on every push and pull request.

## How it works

Everything revolves around one structured `Resume` JSON (`lib/schemas.ts`):

1. **`/api/parse-resume`**: a PDF is sent to Claude as a document; a DOCX is converted to text with `mammoth`. Claude extracts the `Resume` and an ATS review. Deterministic checks in `lib/ats-checks.ts` are merged in.
2. **`/api/parse-jd`**: pasted text, screenshots (Claude vision), or a URL (`lib/fetch-jd.ts`: JSON-LD and known containers via `cheerio`, with private hosts blocked on every redirect hop). If a page needs a login, as LinkedIn often does, the UI falls back to paste or screenshot.
3. **`/api/match`**: Claude compares the resume and the JD and returns a score, keyword gaps, and suggestions as patches that reference section, item, and bullet ids. The prompt forbids inventing experience. Anything that adds an unverified claim is flagged `needsUserConfirmation`, and "Accept all safe" skips it.
4. **Jobs and editor**: each job (`store/resume-store.ts`) keeps its own tailored resume, match report and accepted suggestions. The active job's data lives at the top level of the store, so the editor and suggestions panel don't need to know about jobs. Suggestions are applied by `lib/apply-suggestion.ts`. Inline editing and three-level drag and drop use `@dnd-kit` (sections, entries, bullets). Undo/redo is supported per job. Everything persists to localStorage; saved data from older versions of the app is migrated automatically.
5. **Export**: `lib/export/pdf.tsx` (`@react-pdf/renderer`) and `lib/export/docx.ts` (`docx`) share one layout model (`lib/layout.ts`: Classic / Modern / Compact templates, font, size, spacing, margins, page breaks, fit to one page), stored on each resume. Text supports `**bold**`, `*italic*` and `[links](https://…)` (`lib/inline.ts`); analysis always uses the plain text. PDFs embed Noto fonts and add Chinese/Japanese, Tamil, Arabic, Devanagari or Thai fallbacks only when the resume uses them; `scripts/copy-fonts.mjs` copies the font files (and the pdf.js worker for the preview) into `public/` before `dev` and `build`.

Uploading and matching stream their progress as newline-delimited JSON (`lib/stream-response.ts` on the server, `lib/stream-progress.ts` for the shared progress model), which drives the progress bars.

All Claude calls go through `lib/claude.ts`: Sonnet 5.5 reads resumes and job postings, Opus 5.5 does the matching. Structured outputs via Zod, server-side refusal fallback, stop-reason checks, and prompt caching (the instructions on every call, plus the job description when matching, so re-checks reuse it).

## Your data

Everything is stored in this browser (localStorage, about 5 MB). Use **Back up all** on the Upload page to download every resume, job and tailored version as one JSON file, and **Restore from backup** to load it again, e.g. in another browser. The format is versioned (`lib/backup.ts`) so older backups keep importing. If storage fills up, a banner warns that changes aren't being saved.

Nothing is stored on the server. Resumes and job descriptions pass through to Claude for analysis and are never logged. Visitors acknowledge this once before their first upload, the `/privacy` page explains it in full, and **Delete all my data** in the footer wipes everything from the browser.

## Deploying to Vercel

1. Push the repository to GitHub and import it at [vercel.com/new](https://vercel.com/new). The framework is detected automatically, and no `vercel.json` is needed.
2. Under **Settings → Environment Variables**, add the variables from `.env.example`: `ANTHROPIC_API_KEY` (required), plus `APP_ACCESS_CODE`, `AI_DAILY_LIMIT` and `NEXT_PUBLIC_CONTACT_EMAIL` if you want them.
3. Deploy. Before sharing the link, set a monthly spend limit for the API key in the Anthropic Console.

Things to know:

- **Function duration.** Matching can take a few minutes, so `/api/match` sets `maxDuration = 300` and the reading routes set 120. This needs Fluid compute, which is on by default for new projects.
- **Upload size.** Vercel caps request bodies at 4.5 MB. The app caps uploads at 4.4 MB, resumes at 4 MB, and shrinks large screenshots in the browser before sending them.
- **Rate limits** (`lib/rate-limit.ts`, limits defined in `lib/usage.ts`). Connect **Upstash for Redis** from Vercel's Marketplace (Storage → Upstash → connect to this project; the free tier is plenty) and redeploy: it adds `KV_REST_API_URL` and `KV_REST_API_TOKEN`, and every server instance then shares one set of counts, so per-visitor limits and `AI_DAILY_LIMIT` are exact. Without it, counts are kept in each instance's memory, and on Vercel each instance (and each API route) counts separately. If Redis is unreachable, requests are let through and the error is logged; the Anthropic spend limit is the backstop. Visitors are identified by `x-forwarded-for`, which Vercel sets to the real client IP.
- **Usage meter.** The header chip, low-allowance hints and "try again at…" card (`components/usage.tsx`) count requests in the browser with the same limits, and switch to the server's numbers when it refuses a request.
- **Logs.** Each AI call logs its token counts, limit hits log a warning, and unexpected errors log the error type. Resume and job content is never logged.
- **Access code.** Setting `APP_ACCESS_CODE` turns the site into a private beta: visitors are asked for the code once and it's remembered in their browser.
- **Security headers** (no framing, no MIME sniffing, a strict referrer policy) are set in `next.config.ts`.

## Known audit findings

`npm audit` still lists two issues that don't affect the running app and have no fixed version upstream:

- `braces` (via `eslint-config-next`): used only by the ESLint tooling on a developer machine, never in the website.
- `sprintf-js` (via `mammoth` → `argparse`): used only by mammoth's command-line tool (`bin/mammoth`), which the app never runs.

`npm audit fix --force` would "fix" these by downgrading to very old major versions, so don't run it.

## Not in the MVP yet

Accounts and a database (sync across devices), cover letters, and the rest of the roadmap.
