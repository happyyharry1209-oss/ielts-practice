# IELTS Practice

A self-hosted IELTS practice site: **Listening, Reading, Writing and Speaking** in one app, with
accounts, saved progress, automatic marking and optional AI feedback on essays.

- Web app: React 19 + Vite + TypeScript + Tailwind, deployable to **GitHub Pages**
- API: Node 22 + Hono + Postgres
- Bilingual UI: English / 繁體中文
- Original practice content: 500 Reading sets, 500 Listening sets, 500 Writing sets, and 1 Speaking set.
- The Reading and Listening banks include short drills and full papers. New short drills report raw
  scores. Listening drills include synthetic MP3 audio and transcripts on the results page.
- Every Writing set includes both Academic Task 1 and Task 2.

> This is an independent practice tool. It is not affiliated with IELTS. All questions are
> original; no Cambridge test material is included.

---

## Quick start

Requirements: Node 20.11+. **No database or Docker needed to try it** — the API defaults to an
embedded Postgres (PGlite) stored in `.pglite/`.

```bash
npm install

# 1. Create your admin account (credentials are never committed)
#    bash / macOS / Linux:
ADMIN_EMAIL=me@example.com ADMIN_PASSWORD='a-long-password' npm run seed:admin
#    PowerShell:
#    $env:ADMIN_EMAIL="me@example.com"; $env:ADMIN_PASSWORD="a-long-password"; npm run seed:admin

# 2. Run web + API together (tables are created automatically)
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:8787/api/health

Delete the `.pglite/` folder to reset all local data. Register a normal account in the UI, or log in
with the admin account to see **Admin** in the navigation bar.

### Switching to a real Postgres

For anything beyond local preview, use Postgres. Copy `.env.example` to `.env`, set `DATABASE_URL`,
then:

```bash
docker compose up -d     # or use Supabase / any Postgres
npm run db:migrate
```

### No database? Check the SQL instead

```bash
npm run smoke:db
```

Runs the schema and every API query against PGlite (real Postgres compiled to WASM). Useful in CI
and on machines without Docker.

---

## Project layout

```
apps/
  web/            React SPA (Vite). Deployed to GitHub Pages.
  api/            Hono API. Deployed to Render/Fly/any Node host.
packages/
  shared/         Types, grading engine, band conversion, content validator.
content/          The question bank (JSON). Source of truth.
scripts/          validate / migrate / seed-admin / audio / SQL smoke test.
docker-compose.yml
render.yaml
```

### Why the content lives in the repo, not the database

Papers are static JSON under `content/`. They are versioned with git, reviewed in pull requests, and
served read-only by the API. Only *user* data (attempts, answers, essays, recordings metadata) goes
into Postgres.

---

## Content format

Each paper is one JSON file: `content/<skill>/<id>.json`.

```jsonc
{
  "id": "reading-001",
  "skill": "reading",
  "variant": "academic",
  "title": "Academic Reading — Demo Test 1",
  "durationSec": 3600,
  "passages": [
    {
      "id": "p1",
      "title": "The Bees of the City",
      "body": "**A**  Paragraph text…\n\n**B**  …",
      "questions": [
        {
          "id": "p1q1",
          "number": 1,
          "type": "true-false-not-given",
          "prompt": "Rooftop hives can now be found in several major cities.",
          "options": ["TRUE", "FALSE", "NOT GIVEN"],
          "answer": "TRUE",
          "explanation": "Paragraph A names London, Paris, New York and Tokyo.",
          "location": "Paragraph A"
        }
      ]
    }
  ]
}
```

Supported question types: `multiple-choice`, `multiple-answer`, `true-false-not-given`,
`yes-no-not-given`, `matching-headings`, `matching-information`, `matching-features`,
`matching-sentence-endings`, `sentence-completion`, `summary-completion`, `table-completion`,
`flowchart-completion`, `note-completion`, `form-completion`, `diagram-labelling`,
`map-labelling`, `plan-labelling`, `short-answer`.

Rules worth knowing:

- `multiple-choice` / `matching-*` answers are **option letters** (`"B"`), options are the text.
- `multiple-answer` answers are an array of letters (`["A", "C"]`), compared as a set.
- Completion questions should set `wordLimit`; exceeding it is marked wrong.
- `acceptableAnswers` adds alternative spellings (`["colour"]`, `["tire"]`).
- Question numbers must be unique inside a paper.

Validate before committing:

```bash
npm run validate:content
```

---

## Grading

`packages/shared` contains the whole marking engine, covered by unit tests:

```bash
npm test            # 19 tests: normalisation, word limits, TFNG shorthand, bands…
```

- Case, extra whitespace and edge punctuation are ignored.
- `T`/`F`/`NG`/`Y`/`N` shorthand maps onto the full option text.
- Answers are **stripped from the API payload** and only revealed after submission.
- Raw scores are converted with approximate public band tables (Reading Academic/General and
  Listening differ). Tests that are not out of 40 are scaled.

Writing and Speaking are not auto-graded by a human-equivalent examiner. Writing gets either:

1. **AI feedback** uses Groq's `openai/gpt-oss-120b` when `GROQ_API_KEY` is set. It returns four
   criterion scores, sentence corrections and vocabulary suggestions. Existing installations can
   use DeepSeek by setting only `DEEPSEEK_API_KEY`.
2. A **rule-based estimate** (length, paragraphing, linking words) is shown as Offline if there is no
   AI key, the provider runs out of quota, or the request fails.

For hosted use, create a key in the [Groq Console](https://console.groq.com/keys) under a Free-plan
organisation and add `GROQ_API_KEY` to the Render API service's Environment settings. After
redeploying, check that `/api/health` reports `"aiProvider": "groq"`. When AI is enabled, the
task prompt (including any Task 1 data) and submitted essay are sent to the configured provider.
Admin cost figures are estimates at list prices. Actual billing and free usage are reported
by the provider.

Both are labelled *estimated*, not official IELTS results.

---

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string |
| `JWT_SECRET` | in production | Signs auth tokens; generate 48 random bytes |
| `CORS_ORIGIN` | yes in production | Comma-separated allowed browser origins |
| `APP_URL` | in production | Public URL of the web app, used in email links |
| `PORT` | no | API port (default 8787) |
| `GROQ_API_KEY` | no | Enables Groq Writing feedback and Speaking transcription and feedback |
| `DEEPSEEK_API_KEY` | no | Optional alternative provider for existing deployments |
| `AI_HOURLY_LIMIT` | no | AI requests per user per hour (default 20) |
| `BREVO_API_KEY` | no | Email over HTTPS (free 300/day, verified sender only) — recommended |
| `RESEND_API_KEY` | no | Alternative HTTPS email provider |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASS` | no | SMTP delivery — only works if your host allows ports 465/587 |
| `MAIL_FROM` | no | Sender address for those emails |
| `REGISTRATION_OPEN` | no | Set to `false` to close public sign-ups |
| `CONTENT_DIR` | no | Override the content directory |
| `AUTO_MIGRATE` | no | Create tables on boot (default true) |

The API loads `.env` from the repo root automatically. Existing environment variables always win,
which is what hosted platforms expect.

---

## Accounts and passwords

- **Email verification** is soft: accounts work immediately, and an unverified banner appears until
  the address is confirmed. Verification tokens are stored hashed, single-use and expire in 24 hours.
- **Password reset** sends a single-use link that expires in 1 hour. Requesting a reset always
  answers `200`, so the endpoint cannot be used to discover which emails exist.
- **Email delivery** order: Brevo (HTTPS) → Resend (HTTPS) → SMTP → API log. HTTPS providers come
  first because many hosts, Render included, block outbound SMTP ports entirely.

Brevo setup (free, 300 emails/day, no domain needed):

1. Create an account at [brevo.com](https://www.brevo.com).
2. **Senders, Domains & Dedicated IPs → Senders → Add a sender**, then confirm the email.
3. **SMTP & API → API Keys → Generate a new API key**.
4. Set `BREVO_API_KEY` and `MAIL_FROM` (the sender you verified) on the API host.

Gmail SMTP only works on hosts that allow ports 465/587; Render does not, so use Brevo there.

Admins can press **Send test email** on the Admin page to check delivery without waiting for a real
sign-up.

There are three ways to change a password:

1. **Signed in** — `/account` (the link on your name in the header) asks for the current password.
2. **Forgot it** — `/forgot-password` sends a single-use link (needs a mail provider).
3. **No mail provider** — an admin opens **Admin**, clicks *Reset link* next to a user and sends the
   generated link by hand. It expires in 1 hour.

To close public sign-ups, set `REGISTRATION_OPEN=false` on the API. Existing accounts keep working.

> Reset tokens and sessions are independent: changing a password does not invalidate JWTs that were
> already issued. They expire 7 days after login.

---

## Wrong-answer notebook

`/review` collects every question you answered **incorrectly** (unanswered questions are not counted),
using the most recent response per question so a later correct answer clears it.

- Grouped by paper, with your answer, the correct answer and the explanation.
- **Retry** opens the same questions without a timer, marks them with the normal grader and does not
  create an attempt, so your stats stay clean.
- **Mark as mastered** hides a question from the notebook for good.
- Marking inside a retry session keeps the question on screen so you can still read the explanation.

## Speaking recordings and dark mode

- Every finished recording is saved to **IndexedDB** automatically and listed under **Saved
  recordings** on the Speaking page, with playback, download and delete. The saved copy survives a
  refresh on the same device.
- With **`GROQ_API_KEY`** configured, **Get AI feedback** sends the latest recording (up to 10 MB)
  through the API to Whisper Large V3 Turbo. GPT OSS 120B reviews the transcript against the
  practice prompt and gives feedback on coherence, vocabulary and grammar. The API returns the
  transcript and feedback to the browser and saves only AI usage totals. Practice recordings can
  be made and played back locally without requesting AI feedback.
- **Dark mode** is toggled from the moon/sun icon in the header. The choice is stored in
  `localStorage` and applied before first paint, so there is no flash.

---

## Admin account

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='at-least-10-chars' npm run seed:admin
```

- Idempotent: running it again promotes the account instead of duplicating it.
- It **never overwrites an existing password** unless you also set `ADMIN_RESET_PASSWORD=true`.
- Credentials come from the environment — nothing is hard-coded, so a public repo stays safe.

Admins get an **Admin** page with: user list and role switching, submitted attempts, writing
submissions, AI call counts and estimated cost, and content counts.

---

## Deployment

The frontend and backend are deployed separately. GitHub Pages cannot run Node, so the API needs a
free host such as Render or Fly.io.

### 1. Database — Supabase (or any Postgres)

1. Create a Supabase project.
2. Copy the connection string (use the **pooler** connection for serverless-friendly limits) and add
   `?sslmode=require`.
3. Run `DATABASE_URL=... npm run db:migrate` once.

### 2. API — Render

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, pick the repo (it reads `render.yaml`).
3. Set `DATABASE_URL`, `CORS_ORIGIN` (your Pages origin), `APP_URL` (the full Pages URL, e.g.
   `https://<user>.github.io/<repo>`) and optionally `GROQ_API_KEY` / `RESEND_API_KEY`.
4. Deploy, then check `https://<service>.onrender.com/api/health`.

Free Render services sleep after 15 minutes; the first request afterwards is slow.

### 3. Web — GitHub Pages

1. Repo **Settings → Pages → Source: GitHub Actions**.
2. Repo **Settings → Secrets and variables → Actions** → new secret `VITE_API_URL` =
   `https://<service>.onrender.com` (no trailing slash).
3. Push to `main`. The workflow in `.github/workflows/deploy-web.yml` builds with
   `VITE_BASE=/<repo-name>/` and deploys `apps/web/dist`.
4. Add the Pages URL to the API's `CORS_ORIGIN`, e.g.
   `CORS_ORIGIN=http://localhost:5173,https://<user>.github.io`.

The app uses `HashRouter`, so deep links work on Pages without server rewrites
(`https://<user>.github.io/<repo>/#/practice/reading`).

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Web + API together |
| `npm run dev:web` / `npm run dev:api` | One side only |
| `npm run build` | Production build of the web app |
| `npm run build:api` | Bundle the API with tsup |
| `npm test` | Unit tests for the grading engine |
| `npm run typecheck` | TypeScript across all workspaces |
| `npm run validate:content` | Check every paper's schema and answers |
| `npm run smoke:db` | Run the SQL against PGlite |
| `npm run db:migrate` | Create/upgrade tables |
| `npm run seed:admin` | Create or promote an admin |
| `npm run gen:audio` | Rebuild audio for the original Listening paper |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/generate-listening-drill-audio.ps1` | Rebuild the short Listening drills' MP3s (Windows SAPI + lamejs). Optional `-First` and `-Last` select a range between 2 and 500. |

---

## Known limitations

- **Email needs a provider.** Verification and reset links are sent through Brevo/Resend; without
  one they are only printed to the server log.
- **Speaking feedback is transcript-based.** Pronunciation, stress and intonation require a
  separate assessment for a full Speaking band.
- **AI bands are estimates.** Treat them as ±0.5–1.0, never as an official score.
- **The demo papers are short.** They are original practice material, not full-length simulations
  (though each has 40 questions).
- The listening demo uses four separate files rather than one continuous recording.

## Roadmap

More papers (the format is designed for bulk authoring), a vocabulary
notebook, offline PWA support, and PDF score reports.
