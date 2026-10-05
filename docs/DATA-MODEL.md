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
`format` (enum, indexed) · `dataType` (`physical`|`digital`) · `mediaSubtype` (String) ·
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

One physical item: a frame, a print, a tape. Carries a code like `NEG-MUM-014-01-03`.

**Not embedded in the lot.** A lot can hold thousands, the reconciler updates them
individually, and the 16MB document ceiling would eventually be hit.

| Field | Type | Notes |
|---|---|---|
| `lot` | ObjectId → ArchiveLot, indexed | |
| `code` | String, **unique** | `{PREFIX}-{ORIGIN}-{NNNN}-R-000`, issued per item at creation — e.g. `MDV-AHM-0002-R-000`. PREFIX = the item's own media sub-type (`MDV`, `DVC`, `BTC`, …), ORIGIN = lot origin (`OTH` until known), NNNN = running number per prefix+origin, `R` = raw (`D` = duplicate, reserved), `000` = copy number. Counters: `counters` `itemCode:{PREFIX}-{ORIGIN}` |
| `groupNo` / `itemNo` | Number ≥1 | Roll / tape / album, then position |
| `selectedForDigitization` | Boolean, indexed | False for items excluded at intake |
| `notDigitizedReason` | Enum, indexed | `duplicate_in_mls` `condition_too_poor` `not_significant` `other` |
| `digitized` | Boolean, indexed | Set by the reconciler |
| `fileName` / `fileBytes` / `sha256` | | `sha256` is the fixity anchor |
| `taggedInMls` | Boolean, indexed | |
| `mlsDuplicate` / `mlsDuplicateOf` | | |
| `name` | String | Item title. **Required before the item may get a decision** |
| `nameOnCase` / `description` / `month` / `place` / `event` / `people` / `remarks` | String | Filled in the Items grid |
| `year` | Number 1800–2200 | |
| `physicalSource` / `itemCondition` | String | Admin lists `physicalSource`, `itemCondition` |
| `digitalSource` | String | System-filled at capture |
| `decision.existsInMls` / `newCopyIsBetter` / `conditionUsable` / `significant` | Boolean \| null | Three-state answers |
| `decision.verdict` | `archive` \| `return_or_discard` \| null | Server-computed with `computeVerdict` per item |
| `decision.disposition` | `return` \| `discard` \| null | Chosen when verdict is return_or_discard; reason in `notDigitizedReason` |
| `decision.decidedBy` / `decidedAt` | | Set when the item's result becomes final |
| `dispositionStatus` | `pending` \| `done` \| null | Item-level return/discard inside an otherwise archived lot |
| `dispositionDoneAt` / `dispositionDoneByName` / `lotReference` | | Denormalised for the item queues |

Indexes: `{ lot, groupNo, itemNo }` · `{ lot, digitized }` ·
`{ selectedForDigitization, notDigitizedReason }` · `{ decision.disposition, dispositionStatus }`

**Per-item decisions ("split by item").** When every item of a lot has a final result,
the lot is decided automatically (`finalizeItemDecisions`): any archived item → lot
archived (stage metadata, naming code, only archived items selected), other items queued
item by item in Returns / Discards; no archived item → lot-level return (any return) or
discard.

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
