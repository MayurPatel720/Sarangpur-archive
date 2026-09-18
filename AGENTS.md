# AGENTS.md — rules for AI coding agents working in this repository

Read this before writing any code. It is the contract; `docs/SPEC.md`,
`docs/DATA-MODEL.md` and `docs/API.md` are the detail.

Project: **Archive Tracker** — Sarangpur Archive Program. Tracks photo, video and audio
lots from intake through decision, digitization, MLS tagging, storage, returns and
discards. Internal tool, ~20 concurrent users, ~50TB of media (the media lives on file
servers; the database holds metadata only).

---

## Stack — do not substitute

| Layer | Choice | Version |
|---|---|---|
| Framework | Next.js App Router | 16.x |
| Language | TypeScript, `strict`, `noUncheckedIndexedAccess` | 5.7 |
| Database | MongoDB + Mongoose | 7.x / 8.x |
| Server state | TanStack Query | v5 |
| Validation | Zod | v3 |
| Styling | Tailwind CSS | v4 |
| Queue | BullMQ + Redis | to be added |
| Auth | Auth.js (NextAuth v5) | to be added |

**Do not add** a component library (MUI, shadcn, Ant), a state manager (Redux, Zustand),
an ORM other than Mongoose, or a CSS-in-JS library. The primitives in
`src/components/ui/primitives.tsx` cover the design system.

---

## Non-negotiable rules

### 1. Every mutation goes through `withAudit()`

Never call `.save()`, `.updateOne()` or `.insertMany()` on `ArchiveLot` directly from a
route handler. Mutations must run through the audit wrapper (`src/server/audit.ts`), which
in one transaction: applies the change, writes the `ActivityLog` entry, and updates
`stageEnteredAt` when the stage changed. A change with no audit trail is a bug.

### 2. Aggregation pipelines are plain data, in `src/server/*/pipelines.ts`

Pipelines are exported as `Record<string, unknown>[]` from a file that imports nothing
from Mongoose. This is what lets `scripts/verify-pipelines.ts` execute them through
`mingo` without a database. The single cast to Mongoose's `PipelineStage[]` lives in
`queries.ts` as `asPipeline()`. Do not inline a pipeline in a route handler.

### 3. Every API response is Zod-validated on the server before it is returned

Route handlers are one-liners that delegate to `handleQuery(schema, fn)` in
`src/lib/api.ts`. The schema lives in `src/types/`. The client parses the same schema
in `src/lib/api-client.ts`. Never return an unvalidated object.

### 4. No `$lookup` on read paths

MongoDB joins are slow and this schema is built to avoid them. Denormalise at write time
instead — `ActivityLog` already stores `actorName` and `lotCode`, and `ArchiveLot` stores
`digitization.expectedFileCount` / `foundFileCount` rather than counting `LotItem`s.
If you think you need a `$lookup`, you probably need a denormalised field.

### 5. Denormalised audit fields are never back-filled

`ActivityLog.actorName` and `lotCode` record what was true when the event happened. A
user rename must not rewrite history.

### 6. Lists are paginated server-side

Never fetch a whole collection to filter it in the browser. `ArchiveLot` will reach six
figures. Use `skip`/`limit` with an indexed sort, and return `{ rows, total, page }`.

### 7. Colour comes from tokens, never hex

All design tokens are in `src/app/globals.css` under `@theme`. Use `bg-surface`,
`text-ink-2`, `border-line`. A hex code in a component is a bug. Status is never
communicated by colour alone — the `Badge` component renders a coloured dot *and* a label.

### 8. Every query key comes from `src/lib/query-keys.ts`

No inline arrays in `useQuery`. Mutations invalidate via those keys.

### 9. Role checks live in `src/server/permissions.ts`

Never inline `session.user.role === 'admin'`. Roles: `volunteer`, `reviewer`,
`lead_reviewer`, `admin`.

### 10. Scripts load env via `scripts/load-env.ts`

`dotenv/config` does **not** read `.env.local`. Use `requireEnv()` from `load-env.ts`.

---

## File conventions

- Components: `PascalCase.tsx`. One exported component per file, named, not default.
- Route handlers: always `route.ts`, always `export const dynamic = 'force-dynamic'`.
- Server-only logic: `src/server/<domain>/`. Never import it into a `'use client'` file.
- Domain enums: `src/lib/domain.ts` only. Every union derives from a `const` array there.
- Client components: `'use client'` at the top, and only where interactivity is required.

## Definition of done for any feature

1. `npm run typecheck` clean.
2. Zod schema for every new API response, in `src/types/`.
3. New pipelines covered in `scripts/verify-pipelines.ts` with hand-computed expectations.
4. Loading and error states on every screen — `Skeleton` and `ErrorState` exist; use them.
5. Mutations write an audit entry.
6. `npm run build` passes.

## What already exists — do not rewrite it

The dashboard read path is complete and verified. `src/lib/domain.ts`,
`src/lib/mongo.ts`, `src/lib/api.ts`, `src/components/ui/`, `src/models/`, and
`src/server/dashboard/` are finished reference implementations. **Copy their patterns**
when building new features rather than inventing new ones.

See `docs/SPEC.md` for the full file tree and build order.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
