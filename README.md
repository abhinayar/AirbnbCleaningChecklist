# Cleaning QC

A mobile-friendly web app for Airbnb cleaners. For each property you define a
checklist of items, each with cleaning tips and a plain-English **QC rule** (e.g.
"no visible hair in the tub", "curtains draped evenly", "bed neatly made"). The
cleaner opens the property, enters a PIN, photographs each item, and Claude
checks every photo for blur **and** the item-specific QC rule. When the cleaner
finishes, the app builds a PDF of the results + photos and emails it to your
recipients. Photos are then discarded — **the PDF is the only record**.

## Stack

- **Next.js 14** (App Router, TypeScript) — UI + API in one deployable
- **Postgres + Prisma** — properties, checklists, runs
- **Claude vision** (`@anthropic-ai/sdk`) — blur + per-item QC via a forced tool call
- **sharp** — normalizes/rotates/resizes phone photos to JPEG
- **pdf-lib** — builds the report PDF
- **Resend** — emails the PDF to your recipients
- Hosting: **Railway** (web service + Postgres plugin)

## How it works

Each property is organized into **areas**:

- **Common areas** (kind `common`) — cleaned every day, cannot be skipped.
- **Rooms** (kind `room`) — cleaned on variable days. The cleaner can mark a room
  as **"not cleaned (occupied)"** to skip its checklist; the skip (with reason) is
  noted on the report.

Each area holds checklist items; each item has a title, optional cleaning tips,
and a plain-English **QC rule** for Claude to verify.

1. **Admin** (`/admin`, gated by `ADMIN_PASSWORD`) — create properties with a PIN,
   add areas (common/room), add checklist items (title, tips, QC rule) per area,
   and set the report recipients.
2. **Cleaner** (`/`) — pick a property → enter PIN → work through each area.
   Common areas are required; rooms can be skipped when occupied. Each photo is
   normalized, sent to Claude for a blur + QC verdict, and the cleaner sees
   Pass / Fail / Blurry instantly with a note on what to fix.
3. **Finish** — the app builds a PDF (grouped by area, with each item's verdict,
   notes, and photo, and skipped rooms flagged) and emails it to the recipients,
   then nulls the stored photos.

### Getting checklists in

Two ways, both in `/admin`:

- **Manually** — Add an area, then add items to it one at a time.
- **Bulk import** — On a property, click *"Bulk import areas + items (JSON)"* and
  paste a structure like:

  ```json
  {
    "areas": [
      {
        "name": "Common Areas",
        "kind": "common",
        "items": [
          { "title": "Kitchen counters", "tips": "Wipe & clear",
            "qcPrompt": "Counters clear and free of crumbs or streaks" }
        ]
      },
      {
        "name": "Bedroom 1",
        "kind": "room",
        "items": [
          { "title": "Bed made",
            "qcPrompt": "Bed neatly made, duvet centered, pillows fluffed" }
        ]
      }
    ]
  }
  ```

  Areas are appended, so you can build a property up in chunks.

Photos live in the database only for the duration of a run, and are deleted the
moment the report is sent.

## Local development

```bash
npm install
cp .env.example .env        # fill in the values (see below)
npm run db:push             # or: npx prisma db push   — create tables
npm run seed                # optional: a sample property (PIN 1234) with 4 items
npm run dev                 # http://localhost:3000
```

You need a local Postgres (or point `DATABASE_URL` at any Postgres instance).

### Environment variables

| Var | Required | What it is |
|---|---|---|
| `DATABASE_URL` | ✅ | Postgres connection string (Railway provides this) |
| `ANTHROPIC_API_KEY` | ✅ | From console.anthropic.com — powers the QC checks |
| `QC_MODEL` | – | Vision model. Default `claude-opus-4-8`; use `claude-sonnet-4-6` for lower cost |
| `RESEND_API_KEY` | ✅ | From resend.com — sends the report email |
| `RESEND_FROM` | ✅ | Verified sender, e.g. `Cleaning QC <onboarding@resend.dev>` |
| `REPORT_RECIPIENTS` | ✅* | Comma-separated emails. *Can instead be set in the admin UI |
| `ADMIN_PASSWORD` | ✅ | Password to open `/admin` |
| `SESSION_SECRET` | ✅ | Random string for signing the admin cookie (`openssl rand -hex 32`) |
| `APP_URL` | – | Public URL of the deployment |

## Deploy to Railway + GitHub

1. **Push to GitHub** (this repo is ready to commit).
2. In **Railway** → *New Project* → *Deploy from GitHub repo* → pick this repo.
3. In the project, **+ New → Database → PostgreSQL**. Railway auto-injects
   `DATABASE_URL` into the web service.
4. On the web service, add the env vars from the table above
   (`ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM`, `ADMIN_PASSWORD`,
   `SESSION_SECRET`, and optionally `REPORT_RECIPIENTS` / `QC_MODEL`).
5. Deploy. The start command runs `prisma db push` automatically to create the
   tables on first boot, then starts Next.js. No manual migration step needed.
6. Open the Railway URL → `/admin`, log in, add a property + checklist items,
   set recipients. Cleaners use the root URL.

> **Resend note:** to send to arbitrary recipients you must verify a sending
> domain in Resend and set `RESEND_FROM` to an address on it. Resend's
> `onboarding@resend.dev` works for testing but only delivers to your own
> account email.

## Scripts

- `npm run dev` — local dev server
- `npm run build` — `prisma generate` + `next build`
- `npm run start` — `prisma db push` + `next start` (used by Railway)
- `npm run seed` — insert a sample property and checklist
- `npm run db:push` — create/update tables from the Prisma schema
