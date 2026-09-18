# Technical specification — file tree and build order

Companion to `AGENTS.md` (conventions), `docs/DATA-MODEL.md` (collections) and
`docs/API.md` (endpoints).

Legend: **DONE** = built and verified · **TODO** = to build

---

## 1. Target file tree

```
archive-tracker/
├── AGENTS.md                                    DONE  agent rules
├── CLAUDE.md                                    DONE  → points at AGENTS.md
├── README.md                                    DONE
├── docker-compose.yml                           DONE  ⚠ needs replica-set change (§4.1)
├── .env.example                                 DONE
├── next.config.ts                               DONE
├── tsconfig.json  package.json  postcss.config.mjs   DONE
│
├── docs/
│   ├── SPEC.md  DATA-MODEL.md  API.md           DONE
│
├── scripts/
│   ├── load-env.ts                              DONE  @next/env loader (+ requireEnv)
│   ├── dataset.ts                               DONE  deterministic archive generator
│   ├── seed.ts                                  DONE
│   ├── check-db.ts                              DONE  connection smoke test
│   ├── verify-pipelines.ts                      DONE  40 checks via mingo
│   ├── verify-seed.ts                           DONE  22 checks, schema + integrity
│   └── create-user.ts                           TODO  CLI to add a real user w/ password
│
├── worker/                                      TODO  separate process, not Next.js
│   ├── index.ts                                       BullMQ workers + graceful shutdown
│   ├── queues.ts                                      queue definitions, connection
│   ├── schedule.ts                                    repeatable jobs (nightly scan, alerts)
│   └── jobs/
│       ├── reconcile-folder.ts                        ⚠ highest risk — build first
│       ├── checksum.ts                                SHA-256 + fixity re-check
│       ├── derivatives.ts                             sharp / ffmpeg
│       ├── mls-sync.ts                                outbox drain
│       └── alerts.ts                                  the 7 automations from the brief
│
└── src/
    ├── app/
    │   ├── layout.tsx  globals.css  providers.tsx  page.tsx        DONE
    │   ├── login/page.tsx                                          TODO
    │   ├── (app)/
    │   │   ├── layout.tsx                                          DONE
    │   │   ├── dashboard/page.tsx                                  DONE
    │   │   ├── register/
    │   │   │   ├── page.tsx                                        TODO  intake register
    │   │   │   ├── new/page.tsx                                    TODO  intake form
    │   │   │   └── [lotId]/page.tsx                                TODO  record detail
    │   │   ├── decision/
    │   │   │   ├── page.tsx                                        TODO  queue
    │   │   │   └── [lotId]/page.tsx                                TODO  checklist
    │   │   ├── digitize/page.tsx                                   TODO
    │   │   ├── mls/page.tsx                                        TODO
    │   │   ├── returns/page.tsx                                    TODO
    │   │   ├── discards/page.tsx                                   TODO
    │   │   └── admin/
    │   │       ├── users/page.tsx                                  TODO
    │   │       ├── alert-rules/page.tsx                            TODO
    │   │       ├── naming-codes/page.tsx                           TODO
    │   │       ├── storage/page.tsx                                TODO
    │   │       └── audit/page.tsx                                  TODO
    │   └── api/                                                    see docs/API.md
    │       ├── auth/[...nextauth]/route.ts                         TODO
    │       ├── dashboard/{summary,pipeline,alerts,activity}/route.ts  DONE
    │       ├── lots/route.ts                                       TODO  GET list · POST create
    │       ├── lots/[lotId]/route.ts                               TODO  GET · PATCH
    │       ├── lots/[lotId]/decision/route.ts                      TODO
    │       ├── lots/[lotId]/override/route.ts                      TODO
    │       ├── lots/[lotId]/scan/route.ts                          TODO
    │       ├── lots/[lotId]/reconcile/route.ts                     TODO
    │       ├── lots/[lotId]/mls/route.ts                           TODO
    │       ├── lots/[lotId]/return/route.ts                        TODO
    │       ├── lots/[lotId]/discard/route.ts                       TODO
    │       ├── lots/[lotId]/items/route.ts                         TODO
    │       ├── lots/[lotId]/activity/route.ts                      TODO
    │       ├── lots/[lotId]/attachments/route.ts                   TODO
    │       ├── queues/{decision,digitize,mls,returns,discards}/route.ts  TODO
    │       ├── users/route.ts · users/[userId]/route.ts            TODO
    │       └── admin/{settings,naming-codes,storage,audit}/route.ts TODO
    │
    ├── components/
    │   ├── ui/
    │   │   ├── icons.tsx  primitives.tsx                           DONE
    │   │   ├── DataTable.tsx                                       TODO  server-paginated
    │   │   ├── FilterBar.tsx                                       TODO
    │   │   ├── Form.tsx                                            TODO  Field/Select/Radio
    │   │   ├── FileDrop.tsx                                        TODO
    │   │   ├── Dialog.tsx                                          TODO  confirm modal
    │   │   └── Toast.tsx                                           TODO
    │   ├── shell/
    │   │   ├── Sidebar.tsx  Header.tsx                             DONE
    │   ├── dashboard/                                              DONE (5 files)
    │   ├── intake/
    │   │   ├── IntakeForm.tsx                                      TODO
    │   │   ├── ContactFields.tsx                                   TODO  repeater
    │   │   ├── MediaFields.tsx                                     TODO  cascading sub-type
    │   │   └── NamingCodePreview.tsx                               TODO
    │   ├── decision/
    │   │   ├── DecisionChecklist.tsx                               TODO  state machine
    │   │   ├── VerdictPanel.tsx                                    TODO
    │   │   └── OverrideRequest.tsx                                 TODO
    │   ├── record/
    │   │   ├── LotHeader.tsx  LotSummary.tsx                       TODO
    │   │   ├── ItemProfileTable.tsx                                TODO
    │   │   ├── AuditTimeline.tsx                                   TODO
    │   │   └── AttachmentList.tsx                                  TODO
    │   └── queues/
    │       ├── QueueTable.tsx                                      TODO  shared by 5 queues
    │       └── ReconciliationPanel.tsx                             TODO
    │
    ├── lib/
    │   ├── domain.ts  mongo.ts  api.ts  api-client.ts              DONE
    │   ├── format.ts  query-keys.ts                                DONE
    │   ├── auth.ts                                                 TODO  Auth.js config
    │   └── upload.ts                                               TODO  attachment storage
    │
    ├── models/
    │   ├── User.ts  ArchiveLot.ts  LotItem.ts  ActivityLog.ts      DONE
    │   ├── index.ts                                                DONE  ⚠ update on add
    │   ├── FileIndex.ts                                            TODO  reconciliation
    │   ├── Attachment.ts                                           TODO
    │   ├── Setting.ts                                              TODO  alert thresholds
    │   └── MlsOutbox.ts                                            TODO
    │
    ├── server/
    │   ├── dashboard/pipelines.ts · queries.ts                     DONE  ← copy this pattern
    │   ├── audit.ts                                                TODO  withAudit()
    │   ├── permissions.ts                                          TODO  can()
    │   ├── codes.ts                                                TODO  naming-code generator
    │   ├── lots/{pipelines,queries,mutations}.ts                   TODO
    │   ├── queues/{pipelines,queries}.ts                           TODO
    │   └── reconcile/{parse,diff}.ts                               TODO  pure, unit-tested
    │
    ├── types/
    │   ├── dashboard.ts                                            DONE
    │   ├── lot.ts  queue.ts  admin.ts                              TODO
    │
    └── middleware.ts                                               TODO  auth gate
```

---

## 2. Reference implementations to copy

| Building… | Copy the pattern from |
|---|---|
| An aggregation-backed read endpoint | `src/server/dashboard/pipelines.ts` + `queries.ts` + `src/app/api/dashboard/summary/route.ts` |
| A response contract | `src/types/dashboard.ts` |
| A data-fetching screen | `src/components/dashboard/AlertsPanel.tsx` |
| A Mongoose model with indexes | `src/models/ArchiveLot.ts` |
| A verification harness | `scripts/verify-pipelines.ts` |

---

## 3. Build order

Each phase depends on the one before it. Estimates assume one experienced full-stack dev.

### Phase 1 — Foundations (1 wk) · blocks everything

1. `docker-compose.yml` → single-node **replica set** (`--replSet rs0` + init). Without it
   there are no transactions.
2. `src/models/{FileIndex,Attachment,Setting,MlsOutbox}.ts` + update `models/index.ts`.
3. `src/server/audit.ts` — `withAudit()`. Signature in §4.2.
4. `src/server/permissions.ts` — `can(user, action, resource)`.
5. `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/middleware.ts`,
   `src/app/login/page.tsx`, `scripts/create-user.ts`.
6. `src/models/User.ts` — add `passwordHash` (argon2 or bcrypt).

### Phase 2 — Core workflow (7 wk)

| # | Feature | Depends on |
|---|---|---|
| 1 | `DataTable` + `FilterBar` primitives | Phase 1 |
| 2 | Intake register (`/register`) | 1 |
| 3 | Intake form (`/register/new`) + `codes.ts` | Phase 1 |
| 4 | Record detail (`/register/[lotId]`) | 3 |
| 5 | Decision queue + checklist | 4 |
| 6 | Digitize queue | 4 |
| 7 | MLS queue | 6 |
| 8 | Returns + discard log | 4 |

### Phase 3 — The engine (5–7 wk) · run in parallel with Phase 2

1. **Spike `reconcile-folder` in week 1 of the project**, not here. It is the highest
   uncertainty in the system and can invalidate schema assumptions.
2. `worker/` skeleton, BullMQ, Redis, graceful shutdown.
3. `server/reconcile/parse.ts` — filename → item code. Pure, heavily unit-tested.
4. `server/reconcile/diff.ts` — expected vs found anti-join. Pure.
5. `jobs/reconcile-folder.ts` — incremental walk (Windows USN journal / inotify).
6. `jobs/checksum.ts`, `jobs/derivatives.ts`.
7. `jobs/alerts.ts` — the seven triggers from brief §5.
8. `jobs/mls-sync.ts` + `MlsOutbox`. ⚠ estimate unreliable until the MLS API is documented.

### Phase 4 — Admin (1.5 wk)

Users and roles, alert-threshold settings, naming-codes sheet, audit explorer with export.

### Phase 5 — Production (3 wk)

Backups and restore drill, storage architecture (MinIO or SMB; browsers get derivatives
only, never masters), Vitest + Playwright, rate limiting, session hardening, structured
logging, monitoring, on-prem deployment inside the archive network.

---

## 4. Specifications for the tricky parts

### 4.1 Replica set (required for transactions)

```yaml
# docker-compose.yml — replace the mongo service command
command: ["--replSet", "rs0", "--bind_ip_all"]
```
Then once: `docker exec archive-tracker-mongo mongosh --eval "rs.initiate()"`.
Connection string gains `?replicaSet=rs0&directConnection=true`.

### 4.2 `withAudit()` — the only way to mutate a lot

```ts
// src/server/audit.ts
export async function withAudit<T>(opts: {
  lotId: string;
  actor: { id: string; name: string } | null;   // null = system
  kind: ActivityKind;
  title: string;
  detail?: string;
  /** Runs inside the transaction. Return the updated lot. */
  mutate: (lot: HydratedDocument<ArchiveLotDoc>, session: ClientSession) => Promise<T>;
}): Promise<T>;
```

Must, in one `session.withTransaction()`:
1. Load the lot with the session.
2. Run `mutate`.
3. If `lot.stage` changed, set `lot.stageEnteredAt = new Date()`.
4. Save the lot.
5. Insert an `ActivityLog` with `lotCode` = `namingCode ?? lotReference` and `actorName`
   copied from `actor` (or `'System'`), plus a `changes[]` diff of modified paths.

### 4.3 Naming-code generation

```ts
// src/server/codes.ts
generateLotCode(format, mediaSubtype, originSource): Promise<string>
// → `${PREFIX}-${ORIGIN}-${seq}`  e.g. NEG-MUM-014
generateItemCodes(lotCode, quantity, perGroup = 36): string[]
// → NEG-MUM-014-01-01 … NEG-MUM-014-06-36
```

Rules: prefix from media sub-type (`NEG|PRT|SLD|VHS|AUD|DIG`); origin is the Mandir code,
or `OTH` for Print with no Mandir origin; the sequence is **per prefix+origin** and must be
allocated inside the transaction (`findOneAndUpdate` on a counter document with `$inc`) or
two concurrent intakes will collide.

### 4.4 Intake creation — one transaction

`POST /api/lots` must atomically: allocate `lotReference`, insert the `ArchiveLot`,
generate and insert `quantity` × `LotItem` (the first `quantityToDigitize` with
`selectedForDigitization: true`, the rest carrying `notDigitizedReason`), and write the
`intake_created` audit entry. Insert items in chunks of 5,000 (see `scripts/seed.ts`).

### 4.5 Reconciliation — the core algorithm

```
1. List files under lot.digitization.folderPath (incremental: mtime > lastReconciledAt).
2. For each file: parse the stem against /^([A-Z]{3})-([A-Z]{3})-(\d{3})-(\d{2})-(\d{2})$/
   → match  : upsert FileIndex { path, size, mtime, matchedItemCode }
   → no match: upsert FileIndex with matchedItemCode = null  ("unrecognised")
3. Anti-join: LotItem where selectedForDigitization = true AND no FileIndex row
   → these are "expected, not found".
4. Update lot.digitization.foundFileCount, lastReconciledAt; set scanStatus to
   'scanned' only when found >= expected.
5. Emit a scan_completed or reconciliation-mismatch audit entry.
```

Do **not** re-walk 50TB on every run. Keep `FileIndex` as the source of truth and diff
against it. Steps 2 and 3 are pure functions in `src/server/reconcile/` and must be unit
tested against the fixture style in `scripts/verify-pipelines.ts`.

### 4.6 MLS integration — outbox

Never call MLS inside a request. Write an `MlsOutbox` row in the same transaction as the
tagging change; `jobs/mls-sync.ts` drains it with exponential backoff and records
`syncFailures` on the lot. This is why the MLS queue screen has a "failed sync calls"
panel.

---

## 5. Open questions that block work

Answer before building the marked features.

| # | Question | Blocks |
|---|---|---|
| 1 | Does the archive decision live in the system? Brief §3 says no, §6 schema says yes | Decision checklist |
| 2 | Documents and Prasadi Items sub-type lists are blank in the brief | Intake form |
| 3 | No rights / consent / deed-of-gift field exists anywhere — legal exposure for donated material | Data model, intake form |
| 4 | "Lead Reviewer" vs "Lead Pujya Sant"; brief's Users table lists only Volunteer/Admin/Viewer | Permissions |
| 5 | Does MLS have an API, or is tagging manual for v1? | Whole of Phase 3 item 8 |
| 6 | No fixity/checksum requirement is stated. `LotItem.sha256` exists ready for it | `jobs/checksum.ts` |
