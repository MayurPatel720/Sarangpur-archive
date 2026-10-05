# API specification

All routes are Next.js Route Handlers under `src/app/api/`.

**Universal rules** (see `AGENTS.md`):
- `export const dynamic = 'force-dynamic'` on every handler.
- Reads delegate to `handleQuery(schema, fn)` — `src/lib/api.ts`.
- Writes delegate to `handleMutation(bodySchema, responseSchema, fn)` — **TODO**, same shape.
- Every response is Zod-parsed **on the server** before it is returned.
- Errors: `400` validation · `401` unauthenticated · `403` role · `404` · `409` version
  conflict · `503` database unreachable. Body is always `{ error: string, hint?: string }`.
- Every mutation runs through `withAudit()`.

Legend: **DONE** · **TODO**

---

## 1. Auth

| Method | Path | Role | Status |
|---|---|---|---|
| `*` | `/api/auth/[...nextauth]` | — | TODO |

Credentials provider, JWT sessions in httpOnly cookies, `{ id, name, role }` in the token.
`src/proxy.ts` redirects unauthenticated requests to `/login` and returns `401` JSON
for `/api/*`.

---

## 2. Dashboard — DONE

| Method | Path | Response type |
|---|---|---|
| GET | `/api/dashboard/summary` | `SummaryResponse` |
| GET | `/api/dashboard/pipeline` | `PipelineResponse` |
| GET | `/api/dashboard/alerts` | `AlertsResponse` |
| GET | `/api/dashboard/activity?limit=8` | `ActivityResponse` |

Contracts in `src/types/dashboard.ts`. `summary` and `alerts` share one `$facet`
aggregation — eleven sub-pipelines over a single pass.

---

## 3. Lots

### `GET /api/lots` — DONE — the intake register

Server-side pagination. Never return the whole collection.

**Query:** `page` (1) · `pageSize` (25, max 100) · `sort` (`dateReceived`|`stage`|`quantity`,
prefix `-` for desc, default `-dateReceived`) · `q` (free text over every textable
lot field — refs, owner/POC/facilitator name+phone+email+address, origin, format /
data type / subtype, intake + sender remarks, photo date/place/event/people,
folder + file paths, rights, decision notes, MLS record/tags, return tracking +
notes, discard notes — plus the receiver's name; multi-word queries AND tokens,
so every word must appear in some field) ·
`stage` · `decision` · `format` · `dataType` · `receiver` · `returnStatus` ·
`receivedFrom` / `receivedTo` (ISO dates)

```ts
type LotListResponse = {
  rows: {
    id: string; lotReference: string; namingCode: string | null;
    dateReceived: string; ownerName: string; pointOfContactName: string | null;
    format: Format; mediaSubtype: string; quantity: number; dataType: DataType;
    decision: Decision; stage: Stage; receiverName: string;
    returnLabel: string; returnSeverity: Severity;
  }[];
  total: number; page: number; pageSize: number;
};
```
`receiverName` is resolved with one batched `User` lookup **after** the aggregation, not a
`$lookup` inside it.

### `GET /api/search` — DONE — global palette

Role: `lot:view`. Spotlight search: text over lots **and** `LotItem.code` / `fileName`,
plus filter chips (`format`, `dataType`, `stage`, `decision`).

**Query:** `q` (1–120, optional if any chip set) · `format` · `dataType` · `stage` ·
`decision` · `page` (1) · `pageSize` (10, max 10)

```ts
type SearchResponse = {
  rows: LotRow & {
    matchedVia: 'lot' | 'item' | 'both';
    matchedItems: { id: string; code: string; fileName: string | null }[]; // ≤5
  }[];
  total: number; page: number; pageSize: number;
};
```

Implementation: item codes resolve first (bounded scan, unique-index prefix when
`q` looks like a code), then one paginated `ArchiveLot.find` merges lot-id hits into
the text `$or`. No `$lookup`.

### `POST /api/lots/pickup` — DONE — My lots: Newly arrived / Lots

`lot:view`. Body `{ lotId, accepted: boolean }` -> `{ lotId, accepted }`. Upserts (true) or deletes (false) the
caller's private `lot_pickups` record. 404 unknown lot, 403 when the lot is not assigned to the caller.
Idempotent. Personal view state: not audited, not visible to others.

### `POST /api/lots` — DONE — create an intake

Role: `volunteer`+. Runs in **one transaction** (`SPEC.md` §4.4): allocate `lotReference`,
insert the lot, generate `quantity` × `LotItem`, write the `intake_created` audit entry.

Body mirrors the intake form; per-line quantity guards apply and `conditionPhotoUrl` is
optional. → `201 { id, lotReference, itemsCreated }`

`referencePeople?: { name, phone }[]` (max 5, both fields required per row, phone max 30) —
info-only "people who know about this". Also accepted by `PATCH /api/lots/[lotId]`, returned
by `GET /api/lots/[lotId]` (always an array), and a project `shared` field synced to child lots.

### `GET /api/lots/[lotId]` — DONE
Full record for the detail screen: lot, resolved user names, attachment list, item-profile
counts by state. Item rows themselves come from the paginated items endpoint.

### `PATCH /api/lots/[lotId]` — DONE
Partial update of intake fields. Body must carry `version` (the document's `__v`) →
`409` on mismatch, so two volunteers cannot silently overwrite each other.

---

## 4. Workflow transitions — DONE (live-verified)

All `POST`/`PATCH`, all through `withAudit()`, all role-gated. Deviations from the
original sketch: `POST …/submit` moves intake → decision (no route existed for it);
reconcile runs **inline** returning `200` with counts (no BullMQ yet, so no fake `202`).

| Method | Path | Role | Effect |
|---|---|---|---|
| POST | `/api/lots/[lotId]/submit` | `lot:edit` | `intake → decision` + `submitted_for_decision` audit |
| POST | `/api/lots/[lotId]/decision` | reviewer+ | Records the checklist. Sets `decision.*`, allocates `namingCode` on archive, moves stage to `metadata` / `returned` / `discarded` |
| POST | `/api/lots/[lotId]/override` | reviewer+ | `overrideStatus = 'requested'` + justification |
| PATCH | `/api/lots/[lotId]/override` | lead_reviewer, admin | `approved` or `rejected` |
| PATCH | `/api/lots/[lotId]/scan` | volunteer+ | `scanStatus`, `scannedBy`, `scanDate`, `folderPath` |
| POST | `/api/lots/[lotId]/reconcile` | volunteer+ | Inline diff vs `FileIndex` → `200 { expected, found, missing[], unexpected[] }`; success advances `scanning → mls_tag` |
| PATCH | `/api/lots/[lotId]/mls` | reviewer+ | `recordId`, `taggedCount`, `dataListAttached` |
| PATCH | `/api/lots/[lotId]/mls/duplicate` | lead_reviewer, admin | `duplicateAction` — remove/merge need this role |
| PATCH | `/api/lots/[lotId]/return` | volunteer+ | Return status, method, tracking |
| POST | `/api/lots/[lotId]/discard` | reviewer+ | Requires `confirm: true`. Sets stage `discarded` |
| DELETE | `/api/lots/[lotId]/discard` | **admin only** | Reverses a discard. Brief §5 |

### Decision request body
```ts
{
  existsInMls: boolean;
  newCopyIsBetter?: boolean;      // required when existsInMls
  mlsMatchPaths?: string[];
  conditionUsable: boolean;
  conditionIssue?: string;        // required when !conditionUsable
  significanceFlags: [boolean, boolean, boolean, boolean];
  notes?: string;
}
```
The verdict is **computed on the server**, never trusted from the client:
```
existsInMls && !newCopyIsBetter        → return_or_discard
!conditionUsable                       → return_or_discard
significanceFlags.some(Boolean)        → archive
otherwise                              → return_or_discard (override available)
```
The same rule is implemented as a pure function in
`src/server/lots/decision-rule.ts` (`computeVerdict`) and unit-tested by
`scripts/verify-decision-rule.ts` (7 hand-computed cases, wired into `npm run verify`).
Verdict granularity is `archive | return_or_discard`; return-vs-discard is a reviewer
`disposition` validated against the verdict. This is the one
piece of logic where a bug has consequences that cannot be undone.

---

## 5. Sub-resources

| Method | Path | Notes |
|---|---|---|
| GET | `/api/lots/[lotId]/items` | DONE — Paginated. Filters: `groupNo`, `digitized`, `taggedInMls`, `mlsDuplicate` |
| GET | `/api/lots/[lotId]/activity` | DONE — Paginated audit trail, newest first |
| GET | `/api/lots/[lotId]/items/grid` | DONE — Every item with details + decision, summary, what the viewer may edit. `lot:view` |
| PATCH | `/api/lots/[lotId]/items/grid` | DONE — `{ itemIds, set }` bulk set; assignee rule applies; deciding the last item decides the lot. `lot:edit` |
| PUT | `/api/lots/[lotId]/media-lines` | DONE — Replace quantities while in Intake (refused once items have names/decisions/files). `lot:edit` |
| PUT | `/api/lots/[lotId]/assignee` | DONE — `{ assigneeId \| null }`. `project:assign` |
| GET | `/api/queues/item-dispositions` | DONE — `kind=return\|discard&status=pending\|done`, paginated |
| POST | `/api/items/dispositions` | DONE — `{ kind, itemIds }` mark done. Needs `return:manage` / `discard:confirm` |
| GET | `/api/lots/[lotId]/attachments` | TODO |
| POST | `/api/lots/[lotId]/attachments` | TODO — Multipart. Validate type and size; store the key, never the bytes |

---

## 6. Queues — DONE (live-verified)

Two screens (Returns, Discards), one shared shape. The Decision / Digitization / MLS queues were retired: their pages redirect to `/register?stage=decision|scanning|mls_tag` and their `/api/queues/{decision,digitize,mls}` routes are removed (use `GET /api/lots?stage=`). `src/server/queues/` is parameterised by stage (returns
by `return.status`). Rows reuse the lot-list shape; `daysInStage` / `overdue` /
`progress` / `counts` from the original sketch are not yet computed.

| Path | Stage filter |
|---|---|
| `/api/queues/returns` | `return.status ∈ {pending, in_progress}` |
| `/api/queues/discards` | `stage = discarded` |

Shared query params: `page`, `pageSize`, `sort`, `overdueOnly`, `assignee`.

```ts
type QueueResponse = {
  rows: {
    id: string; code: string; ownerName: string;
    formatLabel: string; quantity: number;
    daysInStage: number; overdue: boolean;
    progress: { done: number; total: number } | null;   // digitize + mls only
    statusLabel: string; statusSeverity: Severity;
    assigneeName: string | null;
  }[];
  total: number; page: number; pageSize: number;
  counts: { all: number; overdue: number };
};
```

---

## 7. Admin — DONE (roles, lists, users, settings; live-verified)

Permission checks read LIVE role grants from the database per request (`authorize()`
in `src/lib/api.ts`), never the JWT. Response envelopes: `{ roles }`, `{ lists }`,
`{ users }`, `{ settings }`, `{ role }`, `{ list }`, `{ user }`.

| Method | Path | Permission |
|---|---|---|
| GET/POST | `/api/admin/roles` | `roles:manage` — PATCH only, no DELETE; system roles editable, never deletable; patch is revision-guarded (stale → 409) with lockout simulation |
| PATCH | `/api/admin/roles/[key]` | `roles:manage` |
| GET/POST | `/api/admin/lists` | `lists:manage` — body `{ key, label, group?, metaSchema? }`; full-item-replace PATCH is revision-guarded; values are immutable (deactivate to retire); system tier never adds/removes values; stage board ⊆ inFlight∪terminal; format `subtypeListKey` must point at an existing list |
| PATCH/DELETE | `/api/admin/lists/[key]` | `lists:manage` — PATCH body optional `{ label?, group?, metaSchema?, items?, expectedRevision }`; `items[]` = `{ value, label, active, sortOrder?, meta? }` (usageCount server-owned); DELETE refuses protected seed keys + in-use items |
| GET | `/api/reference/[key]` | session only — active items for dropdowns (label-fallback client-side) |
| GET/POST | `/api/users` | `user:manage` — duplicate username/email → 409 |
| GET | `/api/users/picker` | session only — `{ users: [{ id, name }] }` active users for dropdowns (register Receiver) |
| GET | `/api/users/me` | session only — `{ id, name, roleKey, grants }` for `useCan` gating |
| PATCH | `/api/users/[userId]` | `user:manage` — no DELETE (deactivate only); self role-change/deactivation → 403 |
| GET/PATCH | `/api/admin/settings` | `settings:manage` — revision-guarded; upsert-on-read from seed defaults |

Still TODO:

| Method | Path | Role |
|---|---|---|
| GET/PATCH | `/api/admin/naming-codes` | admin — origin-source list |
| GET | `/api/admin/storage` | admin — volume usage, reconciliation health, sync failures |
| GET | `/api/admin/audit` | admin — cross-lot audit search, CSV export |

---

## 7b. Tasks & notifications — DONE (`src/types/task.ts`, `src/types/notification.ts`)

Grants: `task:view` (every role — own tasks, and acting on them), `task:assign` (create / edit /
reassign / cancel; admin), `task:viewAll` (see everyone's tasks + the per-person strip; admin).
Rows carry `assignees: [{id,name}]` (1+). Non-admins are confined server-side to tasks they are an assignee or the creator of (someone else's task
is a 404, not a 403). Every write runs through `withTaskAudit()`.

| Method | Path | Grant | Notes |
|---|---|---|---|
| GET | `/api/tasks` | `task:view` | `{rows,total,page,pageSize}`. Query: `page` `pageSize` `format` `assignee` (id or `me`; matches ANY assignee) `status` `priority` `due` (`overdue`|`today`|`upcoming`|`none`) `dueFrom` `dueTo` `lot` `project` `q` `today` (caller's `YYYY-MM-DD`). Sort: overdue, urgent, due date, finished last |
| GET | `/api/tasks/panel` | `task:view` | Today's tasks: `overdue` / `dueToday` / `upcoming` / `doneRecently` (`{rows,total}`, 25 per group), `derived` lot rows, `people` (admin only; a task with two assignees counts for each of them). Query `format` `assignee` (admin) `today` |
| POST | `/api/tasks` | `task:assign` | → 201. `assigneeIds` (1–20 active users). Format required unless `lotId` is given |
| GET | `/api/tasks/[taskId]` | `task:view` | task + checklist + comments + history + `can` flags |
| PATCH | `/api/tasks/[taskId]` | `task:assign` | admin edit of any field, also on a done task; `assigneeIds` is the FULL new set (≥1; added → `task_assigned`, removed → `task_removed`); setting `lotId` makes `format` follow the lot, removing the lot keeps the format; `format` is refused while a lot is linked |
| POST | `/api/tasks/[taskId]/status` | `task:view` + any assignee/creator | `{status, blockedReason?}`; blocked requires a reason; `cancelled` needs `task:assign` |
| POST | `/api/tasks/[taskId]/comments` | `task:view` + assignee/creator | → 201 |
| PUT | `/api/tasks/[taskId]/checklist` | `task:view` + assignee/creator | full replacement `{items:[{id?,text,done}]}` |
| GET | `/api/notifications` | `task:view` | caller's inbox `{rows,total,page,pageSize,unreadCount}` |
| POST | `/api/notifications/read` | `task:view` | `{ids}` or `{all:true}` |

Notifications (the actor is never notified): create / added to a task → each new assignee; removed → that person (`task_removed`); comment and status change → all other assignees + the creator; blocked / done → the creator (`task_blocked` / `task_done`); cancel → everyone on the task.

Pipelines (`src/server/tasks/pipelines.ts`, covered in `scripts/verify-pipelines.ts`): list, panel, people.

---

## 7c. Projects — per-format assignment and tasks (`src/types/project.ts`)

`POST /api/projects` (`project:create`, → 201) and `POST /api/projects/[projectId]/media` (`project:edit`)
create one child lot per format. Besides `mediaLines` they accept, per FORMAT (rows of the same
format share one lot):

| Field | Shape | Notes |
|---|---|---|
| `assignments` | `[{ format, assigneeId | null }]` (≤20) | The lot owner. Always allowed. The wizard sends the first assignee of each format. |
| `tasks` | `[{ format, description?, checklist: string[], priority, dueDate?, assigneeIds: id[] }]` (≤20) | Optional. Needs `task:assign` — **403** without it (plain `assignments` still work). |
| `today` | `YYYY-MM-DD` | Caller's local day; a `dueDate` before it is rejected. Defaults to the server's UTC day. |

Task rules: `format` must be one of the lot formats being created (on add-media: a NEW format — a
format that already has a lot cannot be assigned again); one task per format (a repeat is rejected);
`assigneeIds` are 1–20 ACTIVE users, de-duplicated; `checklist` items are trimmed, 1–200 chars, ≤50;
`dueDate` must be a real day and not in the past. The **title is built on the server** from the final
project name — `<Format label> lot — <project name>` — and the task is linked to the new lot
(`lotId`/`lotCode`), the project (`projectId`/`projectCode`) and the format exactly as `POST /api/tasks` does.

Atomicity: `createProject` writes the project, every lot, every task, and their `ActivityLog` rows and
assignee `Notification` rows (never to the actor) in ONE MongoDB transaction — all or nothing. Tasks reuse
`createTaskInSession` / `persistTaskAudit` (the in-session halves of `createTask` / `withTaskAudit`). Any
task failure aborts everything; its message starts with `<Format label> lot task: ` so the UI can reopen
that format's dialog. (Add-media validates grant, formats, dates and assignees up front, then writes each NEW
lot with its task in one transaction per lot; appends to existing formats keep their own transactions.)

Response of `POST /api/projects`: `{ id, code, lots: [{id, lotReference, format}], tasks: [{id, format}] }`.

`GET /api/projects/[projectId]` (`project:view`) adds, for the project page: `project.createdByName` (creator, one indexed user read; null if gone) and, on each `lots.rows[]` entry, `assigneeId`, `mediaLines: [{mediaSubtype, quantity}]` and the denormalised counters `scanned` / `scanTarget` (digitization found / expected files) and `tagged` (MLS tagged count). `coordinatorId` / `coordinatorName` are still returned but the UI no longer shows or edits them. The page reads its tasks from `GET /api/tasks?project=<id>`.

---

## 8. Worker-facing — TODO

Not public. Called by `worker/` over localhost, or skipped entirely by having the worker
import `src/server/` directly (simpler; prefer it).

| Job | Trigger |
|---|---|
| `reconcile-folder` | On demand from `/api/lots/[lotId]/reconcile`, plus nightly for all `scanning` lots |
| `checksum` | After reconciliation finds new files; plus a rolling fixity re-check on `FileIndex.lastVerifiedAt` |
| `derivatives` | After checksum |
| `mls-sync` | Every minute, drains `MlsOutbox` |
| `alerts` | Hourly — the seven triggers in brief §5 |

---

## 9. Response conventions

Dates are ISO 8601 strings, never `Date` objects. Money and byte counts are numbers, never
pre-formatted strings — **except** where the server already owns the phrasing (the KPI
`note` fields), which is deliberate so wording lives in one place.

Severity is always one of `neutral` `info` `good` `warning` `critical`, and the client maps
it to colour through `src/lib/format.ts`. Never send a colour from the server.

---

## 7d. Project photos (`src/types/project-image.ts`)

Photos of the physical items belong to a project; bytes live in Cloudinary (folder `archive-tracker/projects/<projectId>`, `CLOUDINARY_*` env),
metadata in `projectimages`. Each photo: `{ id, url, fileName, contentType, sizeBytes, width, height,
caption, format | null, uploadedById, uploadedByName, createdAt, updatedAt }`.

| Endpoint | Body | Response |
|---|---|---|
| `GET /api/projects/[projectId]/images` (`project:view`) | | `{ images[] newest first, can: { manage } }` |
| `POST /api/projects/[projectId]/images` | multipart: `file`, `caption?`, `format?`, `width?`, `height?` (one file per request) | **201** `{ image }` |
| `PATCH .../images/[imageId]` | JSON `{ caption?, format?: Format | null }` | `{ image }` |
| `PUT .../images/[imageId]` | multipart `file` (replace; caption and tag kept, old asset destroyed) | `{ image }` |
| `DELETE .../images/[imageId]` | `{}` | `{ ok: true }` |

Writes need `project:edit` OR being the assignee of at least one lot of the project
(`canManageProjectImages`, `src/server/permissions.ts`) - else **403**. Image only (SVG rejected), file
<= 4 MB (the browser resizes to <= 1600 px JPEG first; Vercel caps function bodies at 4.5 MB) - else **400/413**.
Missing Cloudinary config on a write: **503** "Photo storage isn't configured: set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET".
Every write logs `project_image_added | _updated | _replaced | _deleted` to the project trail in the same transaction.
