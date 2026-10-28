# IELTS Practice

A self-hosted IELTS practice site: **Listening, Reading, Writing and Speaking** in one app, with
accounts, saved progress, automatic marking and optional AI feedback on essays.

- Web app: React 19 + Vite + TypeScript + Tailwind, deployable to **GitHub Pages**
- API: Node 22 + Hono + Postgres
- Bilingual UI: English / 繁體中文
- Original practice content: 1 reading paper (40 questions), 1 listening paper (40 questions,
  generated audio), 1 writing paper, 1 speaking set

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

1. **AI feedback** (DeepSeek) when `DEEPSEEK_API_KEY` is set — four criteria, band estimate,
   sentence-level corrections and vocabulary upgrades; or
2. a **rule-based estimate** (length, paragraphing, linking words) when no key is configured, clearly
   labelled as offline.

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
| `DEEPSEEK_API_KEY` | no | Enables real AI writing feedback |
| `AI_HOURLY_LIMIT` | no | AI requests per user per hour (default 20) |
| `RESEND_API_KEY` | no | Sends verification / reset emails; without it links go to the API log |
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
- **Email delivery** uses [Resend](https://resend.com) when `RESEND_API_KEY` is set. Without a key
  the API prints the link to its log — handy locally, and enough to verify an account by hand.

There are three ways to change a password:

1. **Signed in** — `/account` (the link on your name in the header) asks for the current password.
2. **Forgot it** — `/forgot-password` sends a single-use link (needs a mail provider).
3. **No mail provider** — an admin opens **Admin**, clicks *Reset link* next to a user and sends the
   generated link by hand. It expires in 1 hour.

To close public sign-ups, set `REGISTRATION_OPEN=false` on the API. Existing accounts keep working.

> Reset tokens and sessions are independent: changing a password does not invalidate JWTs that were
> already issued. They expire 7 days after login.

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
   `https://<user>.github.io/<repo>`) and optionally `DEEPSEEK_API_KEY` / `RESEND_API_KEY`.
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
| `npm run gen:audio` | Rebuild listening MP3s from transcripts (Windows SAPI + lamejs) |

---

## Known limitations

- **No email verification or password reset.** Add a mail provider before opening registration to
  the public.
- **Speaking audio is not uploaded.** Only metadata is stored; recordings stay in the browser
  session. Add object storage if you want a history.
- **Speaking is not auto-scored.** Part 1–3 give prompts, timing and recording.
- **AI bands are estimates.** Treat them as ±0.5–1.0, never as an official score.
- **The demo papers are short.** They are original practice material, not full-length simulations
  (though each has 40 questions).
- The listening demo uses four separate files rather than one continuous recording.

## Roadmap

More papers (the format is designed for bulk authoring), Speaking transcription, a vocabulary
notebook, a wrong-answer drill mode, offline PWA support, and PDF score reports.
