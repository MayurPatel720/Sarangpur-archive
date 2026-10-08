# Data model

MongoDB collections. Fields marked **DONE** exist in `src/models/`; **TODO** are to add.

Conventions: every reference is an `ObjectId` with a `ref`, and MongoDB will **not**
enforce it — see `AGENTS.md` rule 1 and the integrity pass in `scripts/verify-seed.ts`.
Enum values come from `src/lib/domain.ts`; never hardcode a string literal.

---

## `users` — DONE (`src/models/User.ts`)

| Field | Type | Notes |
|---|---|---|
| `name` | String, required | "M. Patel" |
| `initials` | String, required, ≤3 | Avatar |
| `username` | String, required, **unique** | lowercase |
| `email` | String, **unique + sparse** | Optional; also works at sign-in. `null` clears it |
| `role` | Enum, **indexed** | `volunteer` · `reviewer` · `lead_reviewer` · `admin` |
| `active` | Boolean, default true | |
| `passwordHash` | String | **TODO** — argon2id. Never return it from an API |
| `createdAt` / `updatedAt` | timestamps | |

---

## `archivelots` — DONE (`src/models/ArchiveLot.ts`)

One delivery of material from one owner. The central collection.

### Identity
| Field | Type | Notes |
|---|---|---|
| `lotReference` | String, **unique** | `LOT-2026-0215`, allocated at intake |
| `namingCode` | String, indexed, sparse | `NEG-MUM-014`, allocated after the decision |
| `originSource` | Enum | `MUM` `AHM` `SAR` `OTH` |
| `dateReceived` | Date, **indexed** | |
| `receiver` | ObjectId → User, indexed | |

### Contacts — **embedded** (owned by the lot, never queried alone)
`owner` (required), `pointsOfContact[]`, `facilitator` — each `{ name, phone, email, address }`.
`referencePeople[]` — `{ name, phone }`, both required, max 5, default `[]` (old lots have none). Info-only
"people who know about this"; a shared project field (synced like `pointsOfContact`).

### Media
`format` (enum, indexed) · `dataType` (`physical`|`digital`|`both` = Physical + Digital; a "physical" / "digital" filter also matches `both`) · `mediaSubtype` (String) ·
`quantity` · `quantityToDigitize` · `quantityAlreadyDigitized` · `quantityRemarks`

### Condition & intent
`conditionNotes` · `conditionPhotoUrl` · `reasonForSending` · `senderRemarks`

### Stage
| Field | Type | Notes |
|---|---|---|
| `stage` | Enum, **indexed** | `intake` `decision` `metadata` `scanning` `mls_tag` `storage` `returned` `discarded` |
| `stageEnteredAt` | Date, **indexed** | Denormalised. Every "stuck N days" alert is one indexed range scan on this |

### `decision` (sub-document)
`status` (`pending`/`archive`/`return`/`discard`, indexed) · `decidedBy` → User ·
`decidedAt` · `existsInMls` · `mlsMatchPaths[]` · `conditionUsable` ·
`significanceFlags` (exactly 4 booleans, validated) · `significanceNotes` ·
`overrideStatus` (`none`/`requested`/`approved`/`rejected`, indexed) ·
`overrideRequestedBy` → User · `overrideApprovedBy` → User

### `digitization` (sub-document)
`scanStatus` (`pending`/`in_progress`/`scanned`/`cannot_scan`, indexed) · `scannedBy` →
User · `scanDate` · `folderPath` · **`expectedFileCount`** · **`foundFileCount`** ·
`lastReconciledAt` · `masterBytes`

> The two counters are maintained by the reconciler so no read path ever counts
> `lotitems`. Invariant: `foundFileCount ≤ expectedFileCount ≤ quantity`.

### `mls` (sub-document)
`recordId` · `taggedCount` · `duplicatesFound` (indexed) ·
`duplicateAction` (`retained`/`removed`/`merged`) · `duplicateApprovedBy` → User ·
`dataListAttached` · `syncFailures`

### `return` (sub-document)
`requested` (indexed) · `format` (`physical`/`digital`/`both`/`none`) · `durationText` ·
`dueAt` (indexed) · `status` (`not_requested`/`pending`/`in_progress`/`returned`, indexed) ·
`returnedAt` · `method` · `handledBy` → User · `trackingReference` · `notes`

### `discard` (sub-document)
`reason` (`duplicate`/`not_scannable`/`not_significant`/`condition_too_poor`/`other`) ·
`discardedBy` → User · `discardedAt` · `notes`

### Compound indexes — each backs a real query
```
{ stage: 1, stageEnteredAt: 1 }              SLA alerts, pipeline board
{ dateReceived: -1, stage: 1 }               register list, newest first
{ 'return.status': 1, 'return.dueAt': 1 }    overdue returns
{ 'decision.overrideStatus': 1, stage: 1 }   pending overrides
```
**TODO** when the register search ships: a text index on `owner.name`, `lotReference`,
`namingCode`, or an Atlas Search index.

**TODO field:** `rights` — deed of gift / consent. See open question 3 in `SPEC.md`.

---

## `lotitems` — DONE (`src/models/LotItem.ts`)

One physical item: a frame, a print, a tape — one row of the lot's Excel (Items tab). Carries a code like `ALB-surat-0001-R-000`.

**Not embedded in the lot.** A lot can hold thousands, the reconciler updates them
individually, and the 16MB document ceiling would eventually be hit.

| Field | Type | Notes |
|---|---|---|
| `lot` | ObjectId → ArchiveLot, indexed | |
| `code` | String, **unique** | `{ABBR1}-{ABBR2}-{NNNN}-{R\|D}-{CCC}` — e.g. `ALB-surat-0001-R-000`. The two abbreviations are chosen by the user (Excel → click a code; defaults: sub-type prefix + origin). The number is the next free one for the pair across ALL lots (highest in use + 1, read from the items — no counter), and the user may start higher: the numbers skipped stay free. `R` = original, `D` = duplicate: a duplicate is re-coded to its original's abbreviations + number with `D` and the next copy (`…-D-000`, `…-D-001`); the original is never changed and the duplicate's old number is freed. Rules: `src/lib/item-code.ts`, `src/server/lots/item-codes.ts` |
| `groupNo` / `itemNo` | Number ≥1 | Roll / tape / album, then position |
| `sortOrder` | Number | Row position in the lot's Excel (drag to reorder). Display only — codes never change with it |
| `selectedForDigitization` | Boolean, indexed | True for items to digitize (digital or redigital = Yes) |
| `notDigitizedReason` | String, indexed | Legacy (admin list `notDigitizedReason`); no longer written by the Excel |
| `digitized` | Boolean, indexed | Excel **Captured** |
| `fileName` / `fileBytes` / `sha256` | | `fileName` = Excel **File path**; `sha256` is the fixity anchor |
| `taggedInMls` | Boolean, indexed | Excel **MLS tagged** |
| `mlsDuplicate` / `mlsDuplicateOf` | | Legacy MLS duplicate flags |
| `senderCode` / `nameOnTape` / `nameOnCase` / `place` / `remarks` | String | Details. `place` may hold several, comma-separated |
| `dateFrom` / `dateTo` | Date (UTC midnight) | Details **Date** — one day has from = to. Typed as `dd/mm/yyyy - dd/mm/yyyy` (also `mm/yyyy`, `yyyy`); `src/lib/date-range.ts` |
| `physicalSource` | String | Admin list `physicalSource` |
| `duplicateCode` | String, indexed | Code of the ORIGINAL this item duplicates (any lot). The original's row shows "Duplicated by …" on read; it is never written to |
| `decision.digital` / `redigital` / `discard` / `remark` | Boolean \| null / String | Decision. Decided once all three are answered: digital or redigital Yes → digitize (discard may also be Yes = digitize, then throw the physical copy away); discard only → discard; all No → keep physical only (`src/lib/item-decision.ts`) |
| `decision.disposition` | `return` \| `discard` \| null | Excel **Return / discard** — the physical item's final fate; kept in step with Decision discard |
| `dispositionStatus` | `pending` \| `done` \| null | Pending while a return / discard is chosen; `done` once marked in the Returns / Discards queue (for items being digitized, only after capture) |
| `digitalSource` / `phyStorageLoc` / `storageRemark` | String | Dig source (a place, e.g. Mumbai) · where the physical item is kept · remark |
| `logged` / `loggedAt` / `loggerName` | Boolean / Date / String | Logging. Ticking Status stamps today and the signed-in user; stays editable |
| `custom` | Mixed | Values of the lot's added columns, by column key (`ArchiveLot.customColumns`) |
| `decision.verdict` | `archive` \| `return_or_discard` \| null | Legacy mirror of the result, written so old guards ("items already decided") keep working |
| `name`, `description`, `event`, `people`, `year`, `month`, `itemCondition`, `decision.existsInMls` … | | Retired from the Excel; old values stay in the database |
| `dispositionDoneAt` / `dispositionDoneByName` / `lotReference` | | Denormalised for the item queues |

Indexes: `{ lot, groupNo, itemNo }` · `{ lot, digitized }` ·
`{ selectedForDigitization, notDigitizedReason }` · `{ decision.disposition, dispositionStatus }`

**The lot's Excel decides the lot.** When every item has a result (`finalizeItemDecisions`),
the lot is decided automatically: any item to digitize → lot archived, stage `metadata`,
naming code issued, only those items selected for digitization; nothing to digitize → lot
archived straight to `storage`. Lots never take a lot-level return or discard — each item's
Return / discard is handled item by item in the Returns / Discards queues.

After that the stage follows the Excel (`syncLotStage`, in `src/server/lots/item-grid.ts`):
first **Captured** → `scanning` · every item to digitize captured → `mls_tag` · all of them
**MLS tagged** and every row **logged** → `storage`. A lot with nothing to digitize becomes
`returned` / `discarded` once every item has been marked done in the queues.

**Per-lot Excel setup** lives on the lot: `hiddenColumns[]` (column ids, shared by everyone on
that lot) and `customColumns[]` (`{ key, label, type: text|number|yesno|date, dept }`, `dept` is one of
`details` `decision` `storage` `logging`). Neither carries over to other lots. Columns:
`src/lib/item-columns.ts`.

---

## `activitylogs` — DONE (`src/models/ActivityLog.ts`)

Append-only audit trail. **Never updated, never deleted.**

| Field | Type | Notes |
|---|---|---|
| `lot` | ObjectId → ArchiveLot, indexed | |
| `lotCode` | String | **Denormalised, never back-filled** |
| `kind` | Enum, indexed | 13 values in `domain.ts` |
| `title` / `detail` | String | |
| `actor` | ObjectId → User, nullable | null = system |
| `actorName` | String | **Denormalised, never back-filled** |
| `at` | Date, indexed | |
| `changes[]` | `{ field, from, to }` | Field-level diff |

Indexes: `{ at: -1 }` (global feed) · `{ lot: 1, at: -1 }` (record timeline)

> The denormalised `actorName` / `lotCode` are what let the activity feed run with zero
> `$lookup`. An audit entry records what was true at the time; a later rename must not
> rewrite it.

**TODO at scale:** monthly time-based partitioning, or a TTL policy agreed with the
archive (likely none — this is a permanent legal record).

---

## `projectimages` — DONE (`src/models/ProjectImage.ts`)

Photos of a project's physical items. Bytes are in Cloudinary; this holds metadata only.
`{ project, url (secure_url), publicId (Cloudinary public_id), fileName, contentType, sizeBytes, width?, height?, caption (''), format (nullable, one of FORMATS),
uploadedBy, uploadedByName (denormalised, never back-filled), createdAt, updatedAt }`.
Index: `(project, createdAt -1)` - the gallery read. Deleting a photo removes the document and destroys its Cloudinary asset.

---

## `tasks` — DONE (`src/models/Task.ts`)

Daily-work tasks: an admin assigns one or more people, any of whom can move it along. Everything a card shows is
denormalised at write time and never back-filled (no `$lookup` on read).

| Field | Notes |
|---|---|
| `title` / `description` | ≤160 / ≤2000 |
| `format` | one of `FORMATS`; **inherited from the linked lot** server-side when `lot` is set |
| `status` | `todo` → `in_progress` → `blocked` → `done`, plus `cancelled` (admin only) |
| `blockedReason` | required while `blocked`; cleared on leaving it |
| `priority` | `urgent` | `normal` | `low` |
| `dueDate` | `YYYY-MM-DD` string or null (calendar day, compares as a string) |
| `assignees[]` | 1+ `{ id, name }` (any active users; name denormalised, `_id: false`). One shared `status` / checklist for the task. Replaces the old single `assignee` / `assigneeName` — convert existing docs with `npm run db:backfill-task-assignees`; reads tolerate un-migrated docs, list filters / visibility do not |
| `createdBy` / `createdByName` | the admin who set it; name denormalised |
| `lot` / `lotCode`, `project` / `projectCode` | optional links, code denormalised (`namingCode ?? lotReference`) |
| `checklist[]` | embedded `{ _id, text, done }`, ≤50; counters `checklistTotal` / `checklistDone` |
| `comments[]` | embedded `{ _id, author, authorName, text, at }`, ≤200; counter `commentCount` |
| `doneAt` / `cancelledAt` | set on entering `done` / `cancelled`, cleared on leaving |

History is not embedded: it is `activitylogs` rows with `task` set (kinds `task_created`,
`task_updated`, `task_reassigned` (assignee added / removed: "Assignees: added X, removed Y"), `task_status_changed`, `task_comment_added`,
`task_checklist_updated`), written by `withTaskAudit()` in the same transaction.

Indexes: `{'assignees.id',status,dueDate}` (multikey: tasks where I am an assignee, per-person counts) · `{createdBy,status,dueDate}`
· `{format,status,dueDate}` (format dashboards) · `{status,doneAt:-1}` (done recently) ·
`{lot}` · `{project}`.

**Derived rows.** Lots assigned to the viewer (`ArchiveLot.assignee`, in-flight stages) are shown
read-only in Today's tasks, labelled by stage (Decide / Scan / Tag / …). No Task document exists.

## `notifications` — DONE (`src/models/Notification.ts`)

Per-user inbox behind the header bell (dashboard alerts are computed from lot data and cannot
carry events). `{ user, kind, task, taskTitle, text, actorName, createdAt, readAt }`; kinds
`task_assigned` `task_reassigned` `task_removed` `task_comment` `task_blocked` `task_done` `task_status`
`task_cancelled`. Inserted in the same transaction as the task change; the actor is never notified
of their own action. Indexes `{user,createdAt:-1}`, `{user,readAt}`. Marking read is personal
read-state and is not audited.

`activitylogs` gained `task` (ObjectId) + `taskTitle` and the index `{task,at:-1}`; task rows carry
no lot / project / format so they never reach lot trails or format feeds.

---

## `lot_pickups` — DONE (`src/models/LotPickup.ts`)

Private per-person flag behind My lots' "Newly arrived" / "Lots" split: `{ user, lot, at }`. A lot
assigned to a person is "newly arrived" for them until a record exists for (user, lot); reassigning
shows it as newly arrived for the new assignee. Indexes: unique `{user,lot}`, `{user}`. Personal view
state — not audited, not an `ArchiveLot` mutation, never shown to others (cf. `notifications.readAt`).
No back-fill: existing assigned lots start as newly arrived. Stale records after a reassign are harmless.

---

## `fileindexes` — **TODO** (`src/models/FileIndex.ts`)

The reconciliation engine's source of truth. Lets reconciliation be a database diff
instead of a 50TB filesystem walk.

| Field | Type | Notes |
|---|---|---|
| `path` | String, **unique** | Full UNC path |
| `lot` | ObjectId → ArchiveLot, indexed | Nullable until matched |
| `matchedItemCode` | String, indexed, nullable | null = unrecognised filename |
| `sizeBytes` / `mtime` | | `mtime` drives incremental scans |
| `sha256` | String, nullable | Filled by `jobs/checksum.ts` |
| `lastVerifiedAt` | Date, indexed | Rolling fixity re-check |
| `seenAt` | Date | Last time the walker saw it |

Indexes: `{ path }` unique · `{ lot, matchedItemCode }` · `{ mtime: -1 }` ·
`{ lastVerifiedAt: 1 }` (oldest-first fixity queue)

---

## `attachments` — **TODO** (`src/models/Attachment.ts`)

| Field | Type | Notes |
|---|---|---|
| `lot` | ObjectId → ArchiveLot, indexed | |
| `kind` | Enum | `condition_photo` `data_list` `handover_note` `other` |
| `fileName` / `contentType` / `sizeBytes` | | |
| `storageKey` | String | S3/MinIO key or UNC path |
| `uploadedBy` | ObjectId → User | |
| `uploadedAt` | Date | |

> Store the key, not the bytes. Never serve a master through the app — derivatives only.

---

## `referencelists` — DONE (`src/models/ReferenceList.ts`)

Admin-manageable vocabularies (Tier-2). Seed inventory lives in
`src/lib/vocab-catalog.ts`; values are immutable after create (deactivate to retire).

| Field | Type | Notes |
|---|---|---|
| `key` | String, **unique** | e.g. `originSource`, `mediaSubtype.photo`, `stage` |
| `label` / `group` | String | Admin UI identity |
| `tier` | Enum | `open` (label CRUD) · `system` (app reads meta: stage flags, format subtype lists) |
| `protected` | Boolean | Seed keys cannot be deleted |
| `metaSchema[]` | `{ field, type, required, unique }` | Declares allowed `items[].meta` fields |
| `items[]` | subdocuments | `{ value, label, active, sortOrder, usageCount, meta }` |
| `revision` | Number | Optimistic concurrency for admin PATCH |
| `updatedBy` / `updatedAt` | | |

> `usageCount` is server-owned: bumped on write paths via `bumpUsage` / decremented via
> `transferUsage` when a lot field changes value. Delete-in-use guards read it.
> `items[].value` never changes — `assertExistingValuesImmutable` enforces this for every tier.

---

## `settings` — **TODO** (`src/models/Setting.ts`)

Single document, `key: 'global'`. Moves the alert thresholds out of env vars so an Admin
can change them in the UI: `decisionPendingDays`, `scanStuckDays`, `returnGraceDays`,
`storageCapacityTb`, `notify{Email,Sms}Enabled`.

Env vars stay as the fallback when the document is absent.

---

## `mlsoutbox` — **TODO** (`src/models/MlsOutbox.ts`)

| Field | Type | Notes |
|---|---|---|
| `lot` / `itemCode` | | |
| `operation` | Enum | `create_record` `apply_tags` `resolve_duplicate` |
| `payload` | Mixed | |
| `status` | Enum, indexed | `pending` `sent` `failed` |
| `attempts` / `lastError` / `nextAttemptAt` | | Exponential backoff |

Index: `{ status: 1, nextAttemptAt: 1 }` — the drain query.

---

## Counters — **TODO**

Naming-code sequences. A tiny collection, `{ _id: 'NEG-MUM', seq: 14 }`, incremented with
`findOneAndUpdate({ $inc: { seq: 1 } }, { upsert: true, returnDocument: 'after' })` **inside
the intake transaction**. Without this two concurrent intakes allocate the same code.
