# Mini Job Queue Dashboard

A small full-stack job queue management dashboard: **NestJS** API + **React** frontend, built as a take-home assignment. The focus is API design, validation, and — especially — reasoning correctly about concurrent status updates.

- **Backend**: [`backend/`](backend) — NestJS, TypeORM, SQLite (dev) / PostgreSQL (prod)
- **Frontend**: [`frontend/`](frontend) — React + TypeScript + Vite

## Live URLs

| | URL |
|---|---|
| Frontend | https://job-queue-dashboard-six.vercel.app |
| Backend API | https://job-queue-backend-w4j9.onrender.com |

> **Note on the live backend:** it runs on Render's free tier using the SQLite fallback (no `DATABASE_URL` configured) rather than a shared Postgres instance — see [Deployment](#deployment) for why. That means job data **resets whenever the instance restarts** (free instances also spin down after ~15 min idle, so the first request after a while may take a few seconds to wake it up, and the job list will be empty again). This only affects the free hosted demo; local dev persists to a real SQLite file on disk indefinitely, and pointing `DATABASE_URL` at any Postgres instance switches production to durable storage with no code changes.

## Table of contents

- [Quick start](#quick-start)
- [API](#api)
- [Data model & validation](#data-model--validation)
- [The concurrency problem](#the-concurrency-problem-the-important-part)
- [Architecture decisions](#architecture-decisions)
- [Testing](#testing)
- [Deployment](#deployment)
- [Assumptions & trade-offs](#assumptions--trade-offs)
- [Bonus: rate limiting](#bonus-rate-limiting)
- [With more time](#with-more-time)

## Quick start

Requires Node 18+. No database installation needed for local dev — see [Architecture decisions](#architecture-decisions) for why.

```bash
# 1. Backend
cd backend
npm install
npm run start:dev        # http://localhost:3000

# 2. Frontend (in another terminal)
cd frontend
npm install
cp .env.example .env.development.local   # VITE_API_URL=http://localhost:3000
npm run dev               # http://localhost:5173
```

Open `http://localhost:5173`. The backend creates `backend/data/job-queue.sqlite` automatically on first run — nothing to configure.

### Run backend tests

```bash
cd backend
npm test
```

This includes a test that fires two concurrent status-update requests at the same job and asserts exactly one wins — see [The concurrency problem](#the-concurrency-problem-the-important-part).

## API

| Method | Path | Description |
|---|---|---|
| `POST` | `/jobs` | Create a job (`{ title, type }`), starts as `pending` |
| `GET` | `/jobs` | List all jobs, optional `?status=` filter |
| `GET` | `/jobs/counts` | Job counts grouped by status |
| `GET` | `/jobs/:id` | Get one job |
| `PATCH` | `/jobs/:id/status` | Update status (`{ status }`) |
| `DELETE` | `/jobs/:id` | Delete a job |

All errors return a consistent shape:

```json
{ "statusCode": 400, "path": "/jobs/…/status", "timestamp": "…", "message": "…" }
```

Example:

```bash
curl -X POST http://localhost:3000/jobs \
  -H 'Content-Type: application/json' \
  -d '{"title":"Send welcome emails","type":"email"}'

curl -X PATCH http://localhost:3000/jobs/<id>/status \
  -H 'Content-Type: application/json' \
  -d '{"status":"running"}'
```

## Data model & validation

```
Job {
  id: string (uuid)
  title: string      (1–200 chars, required)
  type: string       (1–100 chars, required)
  status: 'pending' | 'running' | 'completed' | 'failed'
  createdAt: Date
  version: number     // internal optimistic-lock counter, see below
}
```

- `class-validator` DTOs validate every request body (`CreateJobDto`, `UpdateStatusDto`, `FindJobsQueryDto`).
- A global `ValidationPipe` runs with `whitelist: true` + `forbidNonWhitelisted: true`, so unknown fields (e.g. a client trying to set `status` on create) are rejected with `400`, not silently dropped or accepted.
- A global exception filter normalizes **every** thrown error (validation errors, 404s, 409s, unexpected 500s) into the one JSON shape shown above.
- Route params (`:id`) are validated as UUIDs by `ParseUUIDPipe`, so a malformed id is a clean `400` instead of a confusing ORM error.

## The concurrency problem (the important part)

The assignment's core question: **two browser tabs both see a job as `pending` and both fire `PATCH /jobs/:id/status` with `running` at nearly the same time.** What happens?

**Where the rule is enforced.** Entirely on the server, in [`JobsService.updateStatus`](backend/src/jobs/jobs.service.ts). The allowed-transition table (`pending → running → completed|failed`, both `completed` and `failed` terminal) lives in [`job-status.enum.ts`](backend/src/jobs/job-status.enum.ts) and is checked before every write. The React app also only renders buttons for legal next states (see `NEXT_STATUSES` in `frontend/src/types.ts`), but that's a UX convenience only — it changes nothing about what the API accepts.

**What happens if someone bypasses the UI and calls the API directly?** Nothing changes. The rule lives in the service layer, not the frontend, so `curl -X PATCH .../status -d '{"status":"completed"}'` on a `pending` job gets rejected with `400 Bad Request` exactly like a click in the UI would be prevented from happening. There is no privileged path — the browser app is just another client.

**What happens when two requests arrive at nearly the same time?** This is the interesting failure mode, because the *naive* implementation of the rule above still gets it wrong:

```ts
// ❌ naive / racy
const job = await repo.findOneBy({ id });          // both requests read status = 'pending'
if (!isValidTransition(job.status, next)) throw …; // both pass the check
await repo.update({ id }, { status: next });        // both write — job "starts twice"
```

Both requests read `pending`, both see `pending → running` as legal, and both write `running`. No exception is thrown, nothing looks wrong from the outside, but a job that should only ever be picked up once by a worker just got two "start" signals — exactly the invalid/inconsistent state the assignment is asking us to prevent, and a naive smoke test wouldn't catch it because both requests "succeed".

The fix: make the status check part of the *same atomic database operation* as the write, instead of two separate steps with a gap in between, by using a conditional `UPDATE`:

```ts
// ✅ backend/src/jobs/jobs.service.ts
const result = await this.jobsRepository.update(
  { id: job.id, status: job.status },   // WHERE id = ? AND status = 'pending'
  { status: nextStatus },
);
if (result.affected === 0) {
  throw new ConflictException(`Job ${id} was modified by another request. Refresh and try again.`);
}
```

A single `UPDATE ... WHERE id = ? AND status = ?` statement is atomic at the database engine level — it's serialized internally even under concurrent access. Whichever request's UPDATE runs first flips the row; the second one's `WHERE` clause no longer matches (the status already changed), so it updates **zero rows**, and we turn that into a `409 Conflict`. No explicit row locks, transactions, or app-level mutex needed, and — critically — this holds across multiple server processes/pods talking to the same database, not just within one Node event loop. It works identically on SQLite and Postgres.

This is verified with a real test, not just described: [`jobs.service.spec.ts`](backend/src/jobs/jobs.service.spec.ts) fires two `updateStatus(id, 'running')` calls concurrently via `Promise.allSettled` and asserts exactly one resolves and the other rejects with `ConflictException`, then re-reads the job to confirm it ends up `running` (not corrupted, not double-applied).

**How this prevents inconsistent state in general:**
1. The transition table makes illegal states (e.g. `completed → running`) unrepresentable via the API, regardless of who's calling it.
2. The conditional `UPDATE` makes "read-then-write" races fail loudly (`409`) instead of silently double-applying.
3. A `VersionColumn` (`version` field on `Job`) gives a second, independent optimistic-lock guard for any future code path that updates a job outside this helper — belt-and-suspenders, not required for the fix above to work.
4. On the frontend, a `409`/`400` from a status update triggers a full re-fetch of the job list (`useJobs.ts`), so a tab that lost the race immediately shows the *real* current state instead of a stale one.

What I deliberately did **not** build: distributed locks, a message queue, or SELECT ... FOR UPDATE transactions. For a single Postgres/SQLite instance, the conditional UPDATE is sufficient, simpler, and has no extra moving parts to reason about — the assignment explicitly says not to over-engineer this.

## Architecture decisions

- **SQLite for local dev via `sql.js`, Postgres in production.** `AppModule` picks the TypeORM driver based on whether `DATABASE_URL` is set (see `backend/src/app.module.ts`). Both paths run through the identical entity/service code, so the concurrency guarantee above holds on either engine. `sql.js` (a WASM build of SQLite) was chosen over `better-sqlite3`/`sqlite3` specifically because it has **no native compilation step** — `npm install` works the same on any machine or CI runner without a C++ toolchain, which repeatedly bit local setup during development of this very assignment (see notes below). In production the app talks to a managed Postgres instance instead, which is the realistic choice once more than one server instance is running.
- **`TypeOrmModule` with `synchronize: true`.** Fine for a project this size with one entity and no migration history to preserve; a real production app would switch to versioned migrations.
- **State machine as a plain lookup table** (`JOB_STATUS_TRANSITIONS`), not a state-machine library — the rule set is small (4 states, 3 edges) and a table you can read in five seconds is easier to trust than a dependency.
- **Filtering/counts done client-side.** The frontend fetches the full job list once and derives the filtered view + per-status counts with `useMemo` (`App.tsx`), so switching filters is instant and counts always reflect the true totals regardless of which filter is active. The API still supports `GET /jobs?status=` server-side for any other consumer that doesn't want to hold the whole list in memory.
- **No frontend state library.** A handful of `useState`/`useMemo`/one custom hook (`useJobs`) is enough for this scope; Redux/Zustand would be pure ceremony here.

## Testing

```bash
cd backend && npm test
```

10 unit tests covering: job creation, every legal transition, every illegal transition (including trying to revive a `completed`/`failed` job), 404 on unknown ids, deletion, per-status counts, and the concurrent-update race described above. Also manually verified end-to-end with `curl`/concurrent `fetch` against a running server (validation errors, 404s, the full transition path, and burst traffic against the rate limiter).

## Deployment

- **Frontend** → Vercel (static Vite build)
- **Backend** → Render (free Node web service)

`backend/render.yaml` describes the Render web service as infrastructure-as-code. The live backend deliberately runs **without** `DATABASE_URL`, i.e. on the SQLite fallback rather than Postgres — this repo's Render account already had one (unrelated) free-tier Postgres database in use, and Render caps free accounts at one. Rather than share a database instance across two unrelated projects, the demo uses the ephemeral SQLite path and documents the trade-off above. Pointing `DATABASE_URL` at any Postgres connection string (Render, Supabase, Railway, etc.) switches production to durable storage with zero code changes — see `backend/src/app.module.ts`.

Also note: the live backend's CORS is left at its default (`origin: '*'`, see `backend/src/main.ts`) rather than locked to the frontend's exact origin, because the Render CLI used to script this deployment only accepts `--env-var` at service **creation** time, not on `services update`. Setting `CORS_ORIGIN` to the frontend URL (via the Render dashboard, or by recreating the service with the flag below) would close that off — reasonable for a real deployment, not essential for this demo since the API has no auth/cookies for a wildcard origin to expose.

To redeploy yourself:

```bash
# Backend (Render) - SQLite fallback, as deployed here
render services create --name job-queue-backend --type web_service \
  --repo <your-repo-url> --root-directory backend --runtime node \
  --build-command "npm install && npm run build" \
  --start-command "npm run start:prod" \
  --env-var CORS_ORIGIN=<your-frontend-url> \
  --plan free --confirm

# ...or with durable Postgres storage instead, add:
#   --env-var DATABASE_URL=<postgres-connection-string>

# Frontend (Vercel)
cd frontend
echo "VITE_API_URL=<your-backend-url>" > .env.production
vercel --prod --yes
```

## Assumptions & trade-offs

- **Exact transition set.** The assignment's diagram (`pending → running → completed`, branching to `failed`) is read strictly: `pending` can only go to `running`; `running` can go to `completed` or `failed`; nothing leaves `completed`/`failed`. A direct `pending → failed` (e.g. "job was invalid, never even started") is *not* allowed under this reading — a reasonable alternative interpretation, but not what the diagram literally shows.
- **`type` is a free-text field**, not a fixed enum, since the assignment doesn't specify a closed set of job types. It's still required and length-limited.
- **Deleting a job is allowed in any status**, including `running`. In a real system you'd probably require cancelling a running job first, or soft-delete + audit trail; kept simple here since the assignment doesn't call it out as a special case.
- **No auth.** Out of scope for this assignment; noted as the most obvious real-world gap (see below).
- **`synchronize: true` instead of migrations** — acceptable for a single-entity take-home, not for a real production schema.

## Bonus: rate limiting

Added global per-IP rate limiting (`@nestjs/throttler`, 30 requests / 10s, see `backend/src/app.module.ts`) as the one production-readiness improvement.

**Why this one:** the assignment's own edge-case prompt ("what happens if someone bypasses the React app and calls the API directly?") is exactly the scenario rate limiting defends against. Once an API is reachable by anything other than a well-behaved UI, it needs to defend itself against a runaway script, a buggy retry loop, or deliberate abuse — the frontend being polite is not a security boundary. It's a five-line change with no new infrastructure, fails safe (`429 Too Many Requests`, using the same global error shape as everything else), and doesn't get in the way of normal dashboard use (verified: 30 legitimate requests pass, request 30+ in a 10s burst gets a `429`).

## With more time

- **Authentication/authorization** (e.g. an API key or JWT guard on write endpoints) — the single most obvious gap for a real deployment.
- **Pagination + sorting** on `GET /jobs` once the table grows past a page or two.
- **Optimistic UI updates** on the frontend (flip the badge immediately, roll back on error) instead of waiting for the round trip — snappier, though it adds rollback complexity that felt like scope creep for this size of app.
- **A `statusHistory` table** (who/when/what changed) instead of just the current status — turns "was this job double-started?" from a hypothetical into something you can actually audit.
- **Structured/correlated logging** (request id per log line) to make debugging a production incident tractable.
- **E2E tests** (Supertest against a real HTTP server, Playwright for the frontend) in addition to the current unit tests.
