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
prefix `-` for desc, default `-dateReceived`) · `q` (owner name, lot ref, naming code,
POC, facilitator, folder path, deed ref) ·
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

### `POST /api/lots` — DONE — create an intake

Role: `volunteer`+. Runs in **one transaction** (`SPEC.md` §4.4): allocate `lotReference`,
insert the lot, generate `quantity` × `LotItem`, write the `intake_created` audit entry.

Body mirrors the intake form; `quantityToDigitize ≤ quantity` and `conditionPhotoUrl` are
required. → `201 { id, lotReference, itemsCreated }`

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
| GET | `/api/lots/[lotId]/attachments` | TODO |
| POST | `/api/lots/[lotId]/attachments` | TODO — Multipart. Validate type and size; store the key, never the bytes |

---

## 6. Queues — DONE (live-verified)

Five screens, one shared shape. `src/server/queues/` is parameterised by stage (returns
by `return.status`). Rows reuse the lot-list shape; `daysInStage` / `overdue` /
`progress` / `counts` from the original sketch are not yet computed.

| Path | Stage filter |
|---|---|
| `/api/queues/decision` | `stage = decision` |
| `/api/queues/digitize` | `stage = scanning` |
| `/api/queues/mls` | `stage = mls_tag` |
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
| GET/POST | `/api/admin/lists` | `lists:manage` — full-item-replace PATCH, revision-guarded; DELETE refuses protected seed keys + in-use items |
| PATCH/DELETE | `/api/admin/lists/[key]` | `lists:manage` |
| GET | `/api/reference/[key]` | session only — active items for dropdowns (label-fallback client-side) |
| GET/POST | `/api/users` | `user:manage` — duplicate username/email → 409 |
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
