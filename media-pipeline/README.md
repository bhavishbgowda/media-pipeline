# Intelligent Media Processing Pipeline

A backend system that accepts vehicle images, stores them, processes them **asynchronously**, runs a set of image-quality/validity checks, and exposes APIs to fetch processing status and analysis results.

Built with Node.js, Express, TypeScript, PostgreSQL (Prisma), BullMQ + Redis, and Sharp/Tesseract.js for image analysis.

---

## Table of Contents

- [Architecture](#architecture)
- [Folder Structure](#folder-structure)
- [Database Design](#database-design)
- [Setup & Running Instructions](#setup--running-instructions)
- [Docker](#docker)
- [Environment Variables](#environment-variables)
- [API Documentation](#api-documentation)
- [Design Decisions](#design-decisions)
- [Trade-offs](#trade-offs)
- [Assumptions](#assumptions)
- [Future Improvements](#future-improvements)
- [Testing](#testing)
- [AI Usage Disclosure](#ai-usage-disclosure)

---

## Architecture

### Processing flow

```
Client
  │  POST /upload (multipart/form-data)
  ▼
Upload Controller ──▶ Validation (mime type, size) ──▶ Multer saves file to disk
  │
  ▼
Upload Service
  │  1. SHA256 hash the file
  │  2. Persist Upload row (status = PENDING)
  │  3. Enqueue BullMQ job {uploadId, filepath, hash}
  ▼
Returns 202 { processingId, status: "PENDING" }   ◀── client can poll from here
  │
  │   (async, separate worker process)
  ▼
BullMQ Worker picks up job
  │  status → PROCESSING
  ▼
Analyzer runs 6 checks in parallel (Promise.all):
  blur • brightness • duplicate • plate OCR • screenshot heuristic • tamper heuristic
  │
  ├─ success ─▶ Analysis row saved ─▶ status → COMPLETED
  └─ failure ─▶ retry (exponential backoff, up to N attempts)
                 └─ final attempt fails ─▶ status → FAILED (failureReason recorded)
```

The API process and the worker process are **separate BullMQ participants** (see `docker-compose.yml`: `api` and `worker` are two containers built from the same image, running `dist/server.js` and `dist/workers/analysis.worker.js` respectively). This means:

- The HTTP tier stays responsive under heavy image-processing load — uploads still return in milliseconds even if the worker queue is backed up.
- Worker replicas can be scaled independently (`docker compose up --scale worker=3`) without touching the API tier.

### Queue strategy

- **BullMQ** (Redis-backed) chosen over an in-memory queue because status must survive process restarts, and over RabbitMQ/SQS because BullMQ is the lowest-friction option that still gives real retry/backoff/concurrency primitives without extra infrastructure beyond Redis (which the take-home already implies via the tech stack).
- Retries: `attempts: 3`, `backoff: exponential, delay: 2000ms` (configurable via env). On the final failed attempt the Upload row is marked `FAILED` with the error message recorded as `failureReason`.
- A lightweight "dead letter" view: failed jobs are kept in Redis for 24h (`removeOnFail: { age: 86400 }`) so they can be inspected via BullMQ tooling/Bull Board instead of vanishing.
- Job idempotency: the BullMQ job ID is set to the `uploadId`, so re-enqueueing the same upload (e.g. a future manual "retry" endpoint) can't create duplicate jobs for the same row.

### Major design decisions

- **Repository pattern**: `src/repositories/*` are the only modules that touch `prisma.upload` / `prisma.analysis`. Services depend on repository interfaces, not Prisma directly — the ORM/database could be swapped without touching business logic.
- **Service layer**: all business logic (hashing, duplicate semantics, enqueue-then-rollback-on-failure) lives in `src/services/*`. Controllers are intentionally thin — they only translate HTTP ⇄ service calls.
- **Centralized error handling**: every error extends `AppError` (`src/utils/errors.ts`) with a `statusCode` and `isOperational` flag. One error middleware (`src/middlewares/errorHandler.ts`) maps every error path (validation, Multer, services, unexpected exceptions) to a correct HTTP response, so no controller ever writes its own `try/catch → res.status(...)` block.
- **Structured logging (Pino)**: request start/end + duration via `pino-http`, worker start/finish + duration in `analysis.worker.ts`, and every error logged with context.
- **Validation (Zod)**: request params (e.g. `id` must be a UUID) are validated before reaching a controller; file type/size validated by Multer's `fileFilter`/`limits`.

---

## Folder Structure

```
src/
  config/          env loading, Pino logger, Prisma client singleton, Redis connection factory
  constants/        allowed mime types, plate regex, screenshot resolution list, job names
  interfaces/       (reserved for cross-cutting interfaces as the project grows)
  types/            shared TypeScript types (analysis result shapes, job payloads)
  validators/       Zod schemas
  middlewares/      multer upload config, Zod validation middleware, request logger, centralized error handler
  utils/            custom error classes, async handler wrapper, SHA256 file hashing
  repositories/      Prisma access — Upload & Analysis, nothing else touches the DB
  services/         business logic (upload orchestration, status/result/failure retrieval)
  queues/           BullMQ queue definition + enqueue helper
  processors/        one file per image check (blur, brightness, duplicate, plate, screenshot, tamper)
  analysis/          analyzer.ts — orchestrates all processors for one upload
  workers/           BullMQ worker process entrypoint
  controllers/       thin HTTP handlers
  routes/            Express route wiring
  app.ts             Express app factory (middleware pipeline)
  server.ts          API process entrypoint
prisma/
  schema.prisma      Upload + Analysis models
scripts/
  smoke-test.sh, generate-sample-image.js   manual/CI-friendly end-to-end test
uploads/             local file storage (gitignored, volume-mounted in Docker)
logs/                reserved for file-based log output if added later
```

Each folder has exactly one responsibility, per the brief.

---

## Database Design

Two tables, 1:1 relationship:

**Upload** — always created immediately on upload; represents the lifecycle of the file itself.
| column | type | notes |
|---|---|---|
| id | uuid | PK, also used as the BullMQ job id |
| filename | string | original filename |
| filepath | string | path on disk |
| mimeType, sizeBytes | | from Multer |
| hash | string | SHA256, indexed — powers duplicate detection |
| status | enum | PENDING → PROCESSING → COMPLETED / FAILED |
| failureReason | string? | populated only when status = FAILED |
| createdAt, updatedAt | | |

**Analysis** — created only once processing completes; holds the output of all six checks plus a full `resultJson` blob for forward-compatibility (new checks can be added without a migration).

Splitting these into two tables (rather than one wide table) keeps the "pending" row lightweight and models the real lifecycle honestly: an upload can exist without an analysis, but never the reverse.

---

## Setup & Running Instructions

### Prerequisites
- Node.js 20+
- Docker & Docker Compose (recommended path)
- OR local PostgreSQL 16 + Redis 7 if running without Docker

### Option A — Docker Compose (recommended, fastest to a working system)

```bash
git clone <repo-url> && cd media-pipeline
docker compose up --build
```

This starts Postgres, Redis, runs `prisma migrate deploy` via a one-shot `migrate` service, then starts the `api` (port 3000) and `worker` containers. Uploaded files persist in a named Docker volume.

Verify:
```bash
curl http://localhost:3000/health
```

### Option B — Local (no Docker)

```bash
npm install
cp .env.example .env          # edit DATABASE_URL / REDIS_HOST if needed
npx prisma migrate dev --name init
npm run prisma:generate

# terminal 1
npm run dev

# terminal 2
npm run dev:worker
```

> **Note:** `npx prisma generate` downloads a small native query-engine binary from Prisma's CDN the first time it runs. This requires normal outbound internet access (this is a one-time step and works on any standard machine/CI runner).

### Option C — Deploy on Render (Cloud Production Deployment)

#### 1-Click Blueprint Deployment (Recommended)
1. Push your repository to GitHub / GitLab.
2. Go to [Render Dashboard](https://dashboard.render.com/) -> **New** -> **Blueprint**.
3. Connect your repository and select `render.yaml`.
4. Click **Apply**. Render will automatically provision PostgreSQL, Redis, compile TypeScript, run database migrations, and deploy the Web Service with embedded worker processing enabled (`EMBED_WORKER=true`).

#### Manual Dashboard Setup on Render
1. **New PostgreSQL Database**: Create a database named `media-pipeline-db`. Copy the **Internal Database URL**.
2. **New Key-Value (Redis)**: Create a Redis instance named `media-pipeline-redis`. Copy the **Internal Redis URL**.
3. **New Web Service**:
   - **Environment**: Node
   - **Build Command**: `npm install && npm run build && npx prisma generate`
   - **Start Command**: `npm run start:migrate`
   - **Environment Variables**:
     - `DATABASE_URL`: *(paste Internal Database URL)*
     - `REDIS_URL`: *(paste Internal Redis URL)*
     - `EMBED_WORKER`: `true`
     - `UPLOAD_DIR`: `./uploads`
     - `MAX_FILE_SIZE_MB`: `10`

> **Multi-Process Scaling on Render (Paid Plan)**:
> If you prefer running background workers as an isolated process on Render, set `EMBED_WORKER=false` on the Web Service and create a **Background Worker Service** on Render with Start Command `npm run start:worker`. Mount a shared **Render Persistent Disk** at `/app/uploads` on both services so the worker can access uploaded files.

---

## Docker

- `Dockerfile`: multi-stage build (builder compiles TypeScript + runs `prisma generate`; runtime image only ships `dist/`, `node_modules`, and the generated Prisma client).
- `docker-compose.yml`: `postgres`, `redis`, a one-shot `migrate` service (`prisma migrate deploy`), and separately-scalable `api` + `worker` services, both built from the same image.

---

## Environment Variables

See `.env.example` for the full list with defaults. Key ones:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_HOST` / `REDIS_PORT` | Redis connection for BullMQ |
| `UPLOAD_DIR` | Local storage path for uploaded files |
| `MAX_FILE_SIZE_MB` | Multer upload size limit |
| `QUEUE_MAX_ATTEMPTS` / `QUEUE_BACKOFF_MS` | Retry policy |
| `BLUR_VARIANCE_THRESHOLD` | Laplacian-variance cutoff below which an image is "blurry" |
| `BRIGHTNESS_MIN` / `BRIGHTNESS_MAX` | Acceptable brightness band |

---

## API Documentation

### `POST /upload`
Multipart form upload, field name `image`. Returns immediately (202) without waiting for analysis.

```bash
curl -X POST http://localhost:3000/upload -F "image=@vehicle.jpg"
```
```json
// 202 Accepted
{
  "processingId": "3d6c1e2a-8b1a-4b8e-9b0e-2a6b7c9e1234",
  "status": "PENDING"
}
```
Errors: `400` no file / wrong field name / unsupported mime type / file too large.

### `GET /status/:id`
```bash
curl http://localhost:3000/status/3d6c1e2a-8b1a-4b8e-9b0e-2a6b7c9e1234
```
```json
// 200 OK
{
  "processingId": "3d6c1e2a-8b1a-4b8e-9b0e-2a6b7c9e1234",
  "status": "PROCESSING",
  "createdAt": "2026-07-21T06:40:00.000Z",
  "updatedAt": "2026-07-21T06:40:02.000Z"
}
```
Errors: `400` invalid UUID, `404` unknown id.

### `GET /result/:id`
Only valid once `status = COMPLETED`.
```json
// 200 OK
{
  "blur": { "score": 342.11, "threshold": 100, "passed": true },
  "brightness": { "averageBrightness": 128.4, "status": "NORMAL", "passed": true },
  "duplicate": { "isDuplicate": false, "duplicateOfId": null },
  "plate": { "extractedText": "KA05MH1234", "isValid": true, "confidence": 87.2 },
  "screenshot": { "suspected": false, "confidence": 0.3, "reasons": ["No EXIF/camera metadata present"] },
  "tamper": { "suspected": false, "confidence": 0.18, "reasons": [] }
}
```
Errors: `400` if still pending/processing (with current status in the message), `404` unknown id, `422`-originating failures surface via `/failure/:id` instead.

### `GET /failure/:id`
Only valid once `status = FAILED`.
```json
// 200 OK
{
  "processingId": "3d6c1e2a-8b1a-4b8e-9b0e-2a6b7c9e1234",
  "status": "FAILED",
  "failureReason": "OCR extraction failed: ..."
}
```

### `GET /health`
```json
// 200 OK (or 503 if a dependency is down)
{ "status": "ok", "checks": { "database": "ok", "redis": "ok" } }
```

Every response uses proper HTTP status codes (`202` accept-and-process, `200` success, `400` validation, `404` not found, `409` reserved for future hard-duplicate-reject use, `422` invalid image, `500` unexpected, `503` queue/dependency unavailable).

---

## Design Decisions

1. **Sharp instead of OpenCV** for blur/brightness/tamper/screenshot checks (see [Trade-offs](#trade-offs)) — same statistical techniques (variance of Laplacian, channel means, re-compression diffing), no native-build fragility.
2. **Duplicate uploads are not rejected outright.** The brief asks the system to "detect duplicate uploads" and "return duplicate upload id if found" — this is modeled as a *flag in the analysis result*, not a `409` on upload, so a legitimate re-submission/retry from the field still gets processed and recorded.
3. **Six checks, not four.** Beyond the four the original internal brief specified (blur, brightness, duplicate, plate OCR), the actual assignment PDF's "Problem Context" explicitly calls out **screenshot/photo-of-photo** and **edited/tampered-looking image** as issues the system should attempt to identify — both are implemented as heuristics.
4. **Enqueue-after-persist, with rollback.** The Upload row is created before the job is enqueued; if enqueueing fails, the row is immediately marked `FAILED` rather than left stuck in `PENDING` forever.

---

## Trade-offs

- **OpenCV → Sharp.** `opencv4nodejs` requires a native build toolchain (cmake, Python, several GB of build layers) that is fragile in constrained/CI/Docker environments and would have made this take-home much slower to build and run. Sharp (libvips-backed, prebuilt binaries) computes the same statistics (variance of Laplacian for blur, channel means for brightness) directly. This is disclosed rather than silently substituted.
- **Screenshot & tamper checks are coarse heuristics, not classifiers.** The assignment brief explicitly says ML perfection is not the goal ("goal is to evaluate ... ability to structure uncertainty"). These two checks intentionally err toward being conservative (fewer false positives) rather than aggressive, and both return a `confidence` + `reasons[]` so a human reviewer can sanity-check the signal instead of trusting a bare boolean.
- **OCR plate normalization is basic.** Common OCR confusions (0/O, 1/I, 5/S) are not auto-corrected; the raw cleaned text and confidence are always returned so a human can override.
- **Single Postgres instance, no read replicas.** Fine for a take-home; noted as a scalability concern for real traffic (see Future Improvements).
- **No authentication/authorization layer.** Out of scope per the brief's focus on system design; would be required before any real deployment.
- **Local disk storage**, not S3/GCS. Matches the brief's stated tech stack; the repository pattern for file access is isolated enough (`upload.repository.ts` stores only `filepath`) that swapping to object storage later is a contained change.

---

## Assumptions

- "Indian number plate" validation targets the standard civilian format (`SS-DD-CC-NNNN`, e.g. `KA05MH1234`); BH-series and other special formats are out of scope.
- A single uploaded file per request (`image` field); batch upload is not required by the brief.
- "Duplicate" means byte-identical content (SHA256 match), not perceptually-similar-but-different-bytes images (that would require perceptual hashing, e.g. pHash — noted under Future Improvements).
- The worker and API can share the same Postgres/Redis instances at this scale; no multi-tenancy is assumed.
- Reviewers will run this via Docker Compose or local Node 20 — no cloud deployment is assumed or required.

---

## Future Improvements

- Perceptual hashing (pHash/dHash) for near-duplicate detection, not just exact-byte duplicates.
- Region-level tamper heatmap (real ELA visualization) instead of a single whole-image score.
- Rate limiting (e.g. `express-rate-limit`) on `/upload`.
- Move file storage to S3/GCS with signed URLs; keep the repository pattern boundary that already isolates this.
- Bull Board (or similar) mounted as an admin UI for queue/dead-letter inspection.
- Structured automated test suite (unit tests per processor with fixture images of known blur/brightness values; integration tests hitting a test database).
- OpenCV-based checks as an optional, feature-flagged alternative processor for teams that already have the native toolchain available and want OpenCV-specific algorithms (e.g. contour-based tamper detection).
- Horizontal read scaling for Postgres if result-read volume grows much larger than write volume.

---

## Testing

Automated compile-time verification: `npm run lint` (`tsc --noEmit`) — the whole codebase type-checks cleanly.

Manual/smoke end-to-end test (works against local or Docker Compose):
```bash
npm install        # only needed once, for the sharp dependency used by the generator script
BASE_URL=http://localhost:3000 ./scripts/smoke-test.sh
```
This generates a sample image (if one isn't already at `scripts/sample-vehicle.jpg`), uploads it, polls `/status/:id` until it reaches `COMPLETED`/`FAILED`, then fetches `/result/:id` or `/failure/:id`.

Sample requests/responses for every endpoint are documented above under [API Documentation](#api-documentation).

---

## AI Usage Disclosure

This project was built collaboratively with Claude (Anthropic) as a mentoring/pair-programming partner, per the assignment's explicit encouragement to use AI tools and disclose usage.

**Where AI was used:**
- Scaffolding the layered architecture (repository/service/controller separation) and the initial file-by-file implementation.
- Drafting the blur/brightness/screenshot/tamper heuristics and their formulas (variance of Laplacian, Rec.601 luminance weighting, EXIF/resolution heuristic, re-compression diffing).
- Drafting this README.

**Where AI suggestions were reconsidered or rejected:**
- The original spec called for OpenCV; AI proposed Sharp instead specifically to avoid native-build fragility in Docker/CI, and this substitution is called out explicitly rather than left implicit, since silently swapping a named dependency would misrepresent what was built.
- An early version of the screenshot heuristic flagged *any* image missing EXIF data as "suspected" — this was rejected as too aggressive (missing EXIF is extremely common and not itself suspicious) and reworked so "suspected" requires the stronger resolution-match signal, with missing-EXIF only contributing to a confidence score alongside `reasons[]`.

**How generated code was verified:**
- The entire codebase was compiled with `tsc --noEmit` in strict mode and all resulting type errors were fixed before delivery.
- `npm install` was run against the real `package.json` to confirm all dependencies resolve and install cleanly.
- A real bug was caught during this verification pass: `sharp().ensureAlpha(false)` in the tamper processor was passing a boolean where Sharp's API expects a numeric alpha value, which would have thrown at runtime on every request. This was fixed to use `.removeAlpha()` instead, which is what the code actually needed (a consistent, alpha-free channel count for the pixel diff).
- Prisma's native query-engine download (`prisma generate`) could not be executed in the build/verification sandbox because it requires reaching `binaries.prisma.sh`, a domain outside that sandbox's network allowlist — this is a sandbox networking constraint, not a code defect, and the command is expected to succeed normally on a developer machine or CI runner with standard internet access (documented under Setup).

**Bugs introduced by AI and how they were fixed:**
- See the `ensureAlpha` bug above — caught by actually compiling the code rather than trusting it by inspection, and fixed before delivery.
- An overly aggressive screenshot-detection default (see above) was caught by manually reasoning through the false-positive rate before accepting the heuristic, not by a test failure — a reminder that heuristic thresholds need human judgment, not just working code.
