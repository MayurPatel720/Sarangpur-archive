# Plan — Project intake wizard, child lots, shared-data sync

Status: draft for review. Nothing built yet.

## What we're building (in one paragraph)

An admin creates a project through a multi-step wizard that looks like New intake,
plus a project-details step at the start and an Assign step at the end. Only the
project details and the media quantities are mandatory. Finishing the wizard creates
the project **and one child lot per format** (photo / video / audio / documents /
prasadi), each assigned to a member. The intake details (owner, origin, contacts,
condition, rights…) are **one shared value for the whole project**. Whatever the admin
filled in appears in every child lot. Whatever they left blank, the assignee fills in
on their lot, and it syncs back to the project and to every sibling lot.

## Decisions locked in (from the Q&A)

| # | Decision |
|---|---|
| 1 | Project wizard = intake steps + project name/code. On finish it creates the child lots immediately. |
| 2 | Split rule: **one child lot per format**. E.g. 35mm 50 + prints 30 → one Photo lot (80); VHS 15 → Video lot; letters 40 → Documents lot. |
| 3 | Mandatory for the admin: project details + media lines/quantities. Everything else is optional. |
| 4 | Shared fields have **one value** across the project and all its child lots. An edit anywhere (project or any child) updates all of them. |
| 5 | **Shared:** date received, origin source, owner, points of contact, facilitator, condition notes/photo, reason for sending, sender remarks, photo metadata, return request, rights. **Per lot:** media lines/quantities, digital file path, physical/container label flags. |
| 6 | Child lots start in the normal **Intake** stage, even with gaps. |
| 7 | A lot **cannot leave Intake** until date received, origin and owner name are filled. |
| 8 | Assignee owns the lot end to end. **Only the assignee and admins** can change it. Assignment only restricts; it never grants (role permissions still apply). |
| 9 | Quantities: the assignee edits media lines in their lot, and project totals = sum of its lots. An admin adding a new format later creates a new child lot. |
| 10 | Attaching an existing lot to a project is kept. **The project wins**: its shared values overwrite the lot's. |
| 11 | The manual Team list is removed. Team = the people assigned lots. Coordinator stays. |
| 12 | Step order for both intake and project: Origin & contacts → **Condition & notes → Media & quantities** → Rights & review. |

## Phase 1 — Reorder the intake steps (small, ships alone)

`src/components/lots/IntakeForm.tsx`
- `STEPS` / `STEP_INTROS`: swap steps 1 and 2.
- `validateStep`: media validation moves from index 1 → 2.
- `submit()`: error routing currently hard-codes step `1` for line errors and `0` for the rest. Line errors now go to step `2`.
- Review summary: show the sections in the new order.
- `LotDetail` "Edit intake record": same section order, for consistency.

## Phase 2 — Data model

**`Project`** (`src/models/Project.ts`)
- Add `shared` subdoc with every shared field from decision 5. It uses the same shapes as `ArchiveLot`, all optional.
- Remove `team`. Keep `coordinator` / `coordinatorName`.

**`ArchiveLot`** (`src/models/ArchiveLot.ts`)
- `syncProjectId: ObjectId | null` (indexed): the one project whose shared data this lot mirrors. `projectIds` stays the many-to-many membership. A lot syncs with at most one project.
- `assignee: ObjectId | null` (indexed) and `assigneeName` (denormalised at write time and never back-filled, per rule 5).
- Make `dateReceived` and `owner` conditionally required: required only when `syncProjectId` is null. Standalone intake keeps today's rules.
- Ripple: Zod row/detail schemas in `src/types/lot.ts`, plus the register, queue rows, search and pipelines that read `owner.name` / `dateReceived`, must tolerate null and show "—". Audit with `grep` and run `npm run verify`.

**Docs:** update `docs/DATA-MODEL.md` and `docs/API.md` (AGENTS.md requires it).

## Phase 3 — Project wizard + child-lot creation

**UI**: a new full page `/projects/new` (replacing the create dialog). The wizard steps:
1. **Project**: code (unique, immutable), name, description, coordinator, start and target dates. *Required: code, name.*
2. **Origin & contacts**: same fields as intake, all optional.
3. **Condition & notes**: optional.
4. **Media & quantities**: the same editable table as intake. *Required: at least 1 line.*
5. **Rights**: optional.
6. **Assign & review**: one row per format group ("Photo — 80 items: 35mm 50, 6x6 prints 30") with an assignee picker per row, plus **"Assign all to [user] [Apply]"**. Below that, the full review summary.

**Refactor**: pull the step sections out of `IntakeForm` into shared components (`OriginContactsStep`, `ConditionStep`, `MediaLinesStep`, `RightsStep`, `ReviewSummary`). They take a `mode: 'lot' | 'project'` that switches required markers and validation. Intake and project then render the same UI.

**Server**: extend `POST /api/projects`.
- New body: project fields + `shared` + `mediaLines` + `assignments: { format, assigneeId? }[]`.
- One transaction:
  1. Create the project.
  2. Group lines by format.
  3. Per group, create a lot through a refactored `createLotCore()`, extracted from `createIntake`, which already handles the lot reference, `LotItem`s and activity entries. Set `syncProjectId`, `projectIds`, `assignee`, the shared values, and `receiver` = the admin.
  4. Set `lotCount`.

**Project detail page**: becomes the project's control panel.
- **Edit details** reuses wizard steps 1–5 and writes shared values (see Phase 4).
- **Add media**: new lines go into the existing lot of that format, or, for a new format, create a new child lot with an assignee picker.
- **Reassign** per lot.
- Team panel shows distinct assignees from the project's lots. This is an indexed query on `projectIds`, with no `$lookup`.

## Phase 4 — Shared-data sync (the core of change #3)

One write path: `applySharedPatch(projectId, patch, ctx, session)` in a new `src/server/projects/sync.ts`. In one transaction it:
1. Updates `project.shared`.
2. Applies the same patch to every lot with that `syncProjectId`. Each lot goes through `withAudit()`, so every lot gets its own activity entry (rule 1).

Callers:
- **Project edit**: writes the shared fields → fan-out.
- **Lot PATCH** (`patchLot`): split the body into shared and per-lot keys. If the lot has `syncProjectId`, shared keys go through `applySharedPatch`, and per-lot keys go through the normal path. The lot's `version` check still guards the request.
- **Attach existing lot** (`assignLot`), project wins:
  - Project values overwrite the lot's shared fields.
  - Where the project field is empty and the lot has a value, the lot's value fills the project, and therefore the siblings.
  - The lot's `syncProjectId` is then set.
- **Unattach**: the lot keeps its current values, and `syncProjectId` is cleared.

UI: the lot edit form shows a banner, "Shared with project DWARKA-2026: changes apply to all 3 lots."

## Phase 5 — Intake gate

- `submitForDecision` (`src/server/lots/mutations.ts`): reject with 400 and the list of missing fields if date received, origin or owner name is empty.
- `DecisionSection`: show a checklist of the missing items and disable "Send to decision" until they're filled.
- This applies to all lots. Standalone lots already always have these fields, so nothing changes for them.

## Phase 6 — Assignee permissions + My lots

- New helper `assertCanWorkLot(lot, ctx)`: if the lot has an assignee or a `syncProjectId`, only the assignee or an admin passes. Unassigned project lots are admin-only. It runs *in addition to* the role grant check.
- Call it in every lot mutation: `patchLot`, `submitForDecision`, the decision/triage/override functions, scan, reconcile, MLS tag/duplicate, return, discard/reverse, item create, attachments.
- Queues still list every lot. On someone else's project lot, the action buttons are disabled with "Assigned to Ravi".
- Add an **"Assigned to me"** filter on the register and queues, and a **My lots** sidebar entry (using the indexed `assignee` field).

## Phase 7 — Editing media lines after creation

Today `mediaLines` are frozen after intake. New endpoint (or `patchLot` field), assignee/admin only:
- Add, edit or remove lines in the lot. Child lots stay single-format.
- Raising a quantity adds `LotItem`s. Lowering it removes trailing unscanned items, and is refused below the scanned count.
- Recompute the lot's top-level sums. Project totals already come from its lots via the progress pipeline.

## Phase 8 — Verification and docs

- `npm run typecheck`, `npm run verify` (pipelines, seed, decision rule…).
- New `scripts/verify-project-sync.ts`, which covers:
  - Creating a project with 3 formats produces 3 lots with the right quantities and assignees.
  - An edit on child A shows up on the project and on child B.
  - Attach-wins behaves as specified.
  - The gate blocks an incomplete lot.
  - A non-assignee gets 403.
- Drive the full flow in the browser against the local Mongo.
- Update `docs/SPEC.md`, `docs/DATA-MODEL.md`, `docs/API.md`.

## Still open (my default in brackets; tell me if wrong)

1. Is an assignee required on every child lot at creation? [No. An unassigned lot is admin-only until assigned.]
2. A lot already synced to project A gets attached to project B: allow? [No, refuse with a clear message. It can still be a plain member without sync.]
3. Should standalone **New intake** also get a "Project" picker that pre-fills from a project and makes the new lot a synced child? [Yes. It's cheap once Phase 4 exists.]
4. Media lines editable only while the lot is in Intake? [Yes.]
5. Who counts as "admin" for the assignee rule? [Anyone holding `project:assign`.]
6. Child lots' `receiver` (shown as "Received by"): [the admin who created the project.]
7. Existing projects and their lots (made before this change): [Leave them as plain membership, not synced. An admin can detach and re-attach a lot to start syncing.]
