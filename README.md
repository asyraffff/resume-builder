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
| `npm test` | Unit tests (ATS checks, suggestion patches, JD fetching, PDF/DOCX export) |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production build (includes lint) |

## How it works

Everything revolves around one structured `Resume` JSON (`lib/schemas.ts`):

1. **`/api/parse-resume`**: a PDF is sent to Claude as a document; a DOCX is converted to text with `mammoth`. Claude extracts the `Resume` and an ATS review. Deterministic checks in `lib/ats-checks.ts` are merged in.
2. **`/api/parse-jd`**: pasted text, screenshots (Claude vision), or a URL (`lib/fetch-jd.ts`: JSON-LD and known containers via `cheerio`, with private hosts blocked on every redirect hop). If a page needs a login, as LinkedIn often does, the UI falls back to paste or screenshot.
3. **`/api/match`** (streams progress as newline-delimited JSON, see `lib/match-progress.ts`): Claude compares the resume and the JD and returns a score, keyword gaps, and suggestions as patches that reference section, item, and bullet ids. The prompt forbids inventing experience. Anything that adds an unverified claim is flagged `needsUserConfirmation`, and "Accept all safe" skips it.
4. **Jobs and editor**: each job (`store/resume-store.ts`) keeps its own tailored resume, match report and accepted suggestions. The active job's data lives at the top level of the store, so the editor and suggestions panel don't need to know about jobs. Suggestions are applied by `lib/apply-suggestion.ts`. Inline editing and three-level drag and drop use `@dnd-kit` (sections, entries, bullets). Undo/redo is supported per job. Everything persists to localStorage; saved data from older versions of the app is migrated automatically.
5. **Export**: `lib/export/pdf.tsx` (`@react-pdf/renderer`, selectable text) and `lib/export/docx.ts` (`docx`) share one single-column, ATS-safe layout.

All Claude calls go through `lib/claude.ts` (`claude-opus-5-5`, structured outputs via Zod, server-side refusal fallback, stop-reason checks).

## Not in the MVP yet

Accounts and a database, alternative templates, cover letters, and rate limiting.
