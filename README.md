# Archive Tracker

Sarangpur Archive Program — intake, decision, digitization, MLS tagging, storage,
returns and discards for the photo, video and audio archive.

**This repository is the MVP's first slice: the dashboard, with a real API and a real
database behind it.** The other screens are designed but not built yet.

---

## Running it

You need Node 20+ and Docker.

```bash
cp .env.example .env.local     # connection string and alert thresholds
npm install
npm run db:up                  # MongoDB 7 + mongo-express, via docker compose
npm run seed                   # ~1,300 lots, ~50k item profiles, ~800 audit entries
npm run dev                    # http://localhost:3000
```

`npm run db:up` also starts mongo-express on <http://localhost:8081> if you want to
browse the collections directly.

To stop: `npm run db:down`. The data survives in a named Docker volume; `docker compose
down -v` wipes it.

### Without Docker

Point `MONGODB_URI` at any MongoDB 6+ instance — Atlas works, as does a local install.
Only `npm run db:up` and `npm run db:down` assume Docker.

---

## The stack, and why

| Layer | Choice | Reasoning |
|---|---|---|
| Framework | Next.js 16, App Router | The API and the UI share one process, so a page render queries the database with no network hop |
| Language | TypeScript, strict | One language across the stack; the Zod response schemas give the client its types for free |
| Database | MongoDB 7 + Mongoose 8 | Chosen by the team. See **Living with MongoDB** below for what that costs and how the code compensates |
| Server state | TanStack Query v5 | Cache, refetch-on-focus, a 60s poll, and retry rules that distinguish "Mongo is down" from "the contract is broken" |
| Styling | Tailwind CSS v4 | Design tokens declared once in `globals.css`; every component references a token, never a hex code |
| Validation | Zod | The same schema validates the response on the server and types it on the client |

No component library. The ~10 primitives this design needs are in
`src/components/ui/primitives.tsx` and match the design canvas exactly.

---

## Layout

```
src/
  app/
    (app)/                      the application shell — full-height rail + content
      layout.tsx
      dashboard/page.tsx        the only screen in this slice
    api/dashboard/              four route handlers, all dynamic, all no-store
      summary/  pipeline/  alerts/  activity/
    layout.tsx  providers.tsx  globals.css
  components/
    shell/                      Sidebar (collapsible), Header (command bar, refresh)
    dashboard/                  KpiRow, PipelineBoard, AlertsPanel, ActivityFeed
    ui/                         Panel, Badge, Meter, Skeleton, ErrorState, icons
  lib/
    domain.ts                   every domain enum — the single source of truth
    mongo.ts                    cached connection (HMR- and concurrency-safe)
    api.ts                      route-handler wrapper: validate, no-store, 503 on db errors
    api-client.ts  format.ts  query-keys.ts
  models/                       Mongoose schemas with their indexes
  server/dashboard/
    pipelines.ts                aggregation pipelines as plain data
    queries.ts                  run them, shape the responses
  types/dashboard.ts            the Zod wire contracts
scripts/
  dataset.ts                    deterministic archive generator (no database)
  seed.ts                       insert it
  verify-pipelines.ts           pipelines vs hand-checked fixtures
  verify-seed.ts                schemas + integrity + pipelines over the real dataset
```

---

## Living with MongoDB

The team chose MongoDB. It works, and at this scale it is fast — but three things that
PostgreSQL would have given you for free now have to be done in application code, and
this is where they live.

**No foreign keys.** Nothing stops an audit entry from pointing at a deleted user.
`npm run verify:seed` includes a referential-integrity pass over every reference in the
dataset; treat that as the pattern to extend when you add write paths, and consider a
scheduled job that runs the same checks against production.

**Joins are expensive.** The dashboard avoids `$lookup` entirely: the activity feed
stores `actorName` and `lotCode` denormalised at write time (an audit entry should record
what was true when it happened, so these are never back-filled), and the scan counters
live on the lot rather than being counted from `lotitems` on every read. The one place
this will bite is the reconciliation engine — matching expected item codes against files
found on the server is an anti-join, which is the operation relational engines are best
at and Mongo is worst at. Plan for that query to need care.

**Transactions are available but not free.** Issuing a naming code, generating item
profiles and writing the audit entry must all succeed together. On a replica set,
`session.withTransaction()` handles it; a single-node Mongo cannot do multi-document
transactions at all, so the Docker compose here is fine for development but production
needs a replica set.

### Modelling decisions worth knowing

- **Contacts are embedded** in the lot. They belong to one lot, are always read with it,
  and are never queried alone.
- **Item profiles are not embedded.** A lot can hold several thousand; they are updated
  individually by the reconciler, and the 16MB document ceiling would eventually be hit.
  They live in `lotitems` with a `lot` reference.
- **`stageEnteredAt` is denormalised** onto the lot so every "stuck for N days" alert is
  one indexed range scan instead of a search through the audit log.
- **Terminal stages are window-scoped.** A lot in `storage` is finished, so counting
  current occupancy would mean that column eventually holds the whole archive. The board
  counts arrivals inside the reporting window for `storage`, `returned` and `discarded`,
  and current occupancy for the five in-flight stages.

---

## The dashboard API

All four are `GET`, dynamic, `Cache-Control: no-store`, and validate their own response
against a Zod schema before returning it.

| Route | Returns |
|---|---|
| `/api/dashboard/summary` | Five KPIs, storage meter, lot totals |
| `/api/dashboard/pipeline` | Eight stage columns with counts and the two longest-waiting lots each |
| `/api/dashboard/alerts` | The five alert rules from the brief, zero-count rules omitted |
| `/api/dashboard/activity?limit=8` | Recent audit entries, newest first |

`summary` and `alerts` share a single `$facet` aggregation: eleven sub-pipelines over one
pass of the collection rather than eleven separate round trips.

When MongoDB is unreachable every route returns **503** with a message and a hint, and
the UI renders that message with a retry button rather than an empty shell.

---

## Verification

```bash
npm run typecheck          # strict, with noUncheckedIndexedAccess
npm run verify:pipelines   # 40 checks: pipelines vs hand-computed fixtures
npm run verify:seed        # 22 checks: schemas, referential integrity, real pipelines
npm run build              # production build
```

`verify:pipelines` runs the **real** aggregation pipelines — imported, not reimplemented
— through `mingo`, a MongoDB query-engine implementation, against a twelve-lot fixture
whose answers were worked out by hand. `verify:seed` does the same over the full
generated archive and prints the dashboard as text, so you can see the numbers without
starting anything.

Neither proves index usage, and there are operators where mingo and the real server could
differ. Run the app against the Docker MongoDB for that.

---

## Known gaps in this slice

- **No authentication.** The header shows a hardcoded user. Auth.js with credentials,
  session cookies and role middleware is the next slice.
- **Sidebar links other than Dashboard are disabled**, and marked as such on hover.
- **The command bar, "New intake" and "Export report" are inert** — they are placed and
  styled, not wired.
- **No background worker.** Folder reconciliation, checksums, derivative generation and
  MLS sync all belong in a separate BullMQ process; the schema has the fields ready
  (`digitization.expectedFileCount` / `foundFileCount` / `lastReconciledAt`).
- **Fonts load from Google Fonts over a `<link>`** so the build needs no network. Switch
  to `next/font/google` to self-host them and remove the flash of fallback text.
- **Single-node MongoDB** in compose — see the transactions note above.

## Open questions for the archive team

These came out of reading the brief and have not been answered yet.

1. Section 3 says the archive decision is "not made on the system", but the schema in
   section 6 stores the significance flags, the condition result and the override
   approver. The checklist has been built into the system — please confirm that is right.
2. The Documents and Prasadi Items sub-type lists are empty in the brief.
3. There is no field anywhere for rights, consent or a deed of gift. For donated family
   material that is a real legal exposure.
4. "Lead Reviewer" and "Lead Pujya Sant" are used interchangeably, and the Users table
   lists only Volunteer / Admin / Viewer. A fourth role has been added as
   `lead_reviewer`; confirm the naming.
5. No fixity checking is specified. At 50TB over a decade, silent bit rot is not
   hypothetical — `LotItem.sha256` is in the schema ready for it.

---

## Deploying to Vercel

### Environment variables

Set these in **Project → Settings → Environment Variables**. Only the first is required.

| Variable | Required | Value |
|---|---|---|
| `MONGODB_URI` | **yes** | Your MongoDB Atlas SRV string, e.g. `mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/archive_tracker?retryWrites=true&w=majority` |
| `ALERT_DECISION_PENDING_DAYS` | no | Days before a pending decision is flagged. Defaults to `5` |
| `ALERT_SCAN_STUCK_DAYS` | no | Days before a stuck scan is flagged. Defaults to `10` |
| `ARCHIVE_STORAGE_CAPACITY_TB` | no | Denominator for the sidebar storage meter. Defaults to `96` |

`VERCEL=1` is set by the platform automatically — the code reads it to switch off the
standalone build output and to shrink the connection pool. You do not set it yourself.

Do **not** point `MONGODB_URI` at `localhost`. Vercel's builders and functions run in
Vercel's own network and cannot reach a database on your machine.

### Atlas setup

1. Create a free M0 cluster.
2. Database Access → add a user with **Read and write to any database**.
3. Network Access → allow `0.0.0.0/0`. Vercel has no fixed egress IPs on Hobby or Pro,
   so an IP allowlist is not possible without Secure Compute. The database user's
   password is what protects it — make it a strong one.
4. Put the SRV string in `MONGODB_URI`, with `/archive_tracker` before the `?`.

### Seeding a deployed database

The seed runs from your machine against Atlas, not on Vercel:

```bash
MONGODB_URI="mongodb+srv://…" npm run seed
```

On PowerShell: `$env:MONGODB_URI="mongodb+srv://…"; npm run seed`

### What Vercel cannot do for this system

Vercel is fine for demonstrating the dashboard to stakeholders. It cannot host the real
application, because the parts that come next need things Vercel has no route to:

- The MLS at `192.168.0.84` is on the Sarangpur LAN.
- The masters live on SMB shares at `\\sarangpur.net\ps\Photos`.
- The reconciliation engine walks those shares and needs a long-running worker; Vercel
  functions have an execution ceiling and no persistent process.
- 50TB of archival media does not belong in a serverless deployment.

Treat a Vercel deployment as a demo environment. Production belongs on a server that sits
inside the archive's network.
