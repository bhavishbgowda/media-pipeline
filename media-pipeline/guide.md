# Comprehensive Developer & Operational Guide: Intelligent Media Processing Pipeline

Welcome to the **Intelligent Media Processing Pipeline** guide. This document provides an exhaustive, production-grade breakdown of the system architecture, component design, database model, image analysis engines, API specifications, operational procedures, and design trade-offs.

---

## Table of Contents

1. [System Overview & Key Features](#1-system-overview--key-features)
2. [Architecture & System Flow](#2-architecture--system-flow)
3. [Project Directory & Module Structure](#3-project-directory--module-structure)
4. [Database Design & Schema Rationale](#4-database-design--schema-rationale)
5. [Deep-Dive into the Image Analysis Pipeline](#5-deep-dive-into-the-image-analysis-pipeline)
   - [5.1 Blur Detection (Laplacian Variance)](#51-blur-detection-laplacian-variance)
   - [5.2 Brightness Analysis (Rec. 601 Perceptual Luminance)](#52-brightness-analysis-rec-601-perceptual-luminance)
   - [5.3 Duplicate Detection (SHA-256 Hashing)](#53-duplicate-detection-sha-256-hashing)
   - [5.4 Indian Vehicle Plate OCR & Validation](#54-indian-vehicle-plate-ocr--validation)
   - [5.5 Screenshot / Photo-of-Photo Heuristic](#55-screenshot--photo-of-photo-heuristic)
   - [5.6 Image Tamper / ELA Approximation](#56-image-tamper--ela-approximation)
6. [API Specification & Interaction Lifecycle](#6-api-specification--interaction-lifecycle)
7. [Error Handling, Validation & Logging](#7-error-handling-validation--logging)
8. [Setup, Docker & Deployment Guide](#8-setup-docker--deployment-guide)
9. [Trade-offs, Assumptions & Future Roadmap](#9-trade-offs-assumptions--future-roadmap)

---

## 1. System Overview & Key Features

The **Intelligent Media Processing Pipeline** is an asynchronous backend service engineered for ingesting vehicle inspection images, performing automated quality & authenticity validations, and serving processing results via standard REST endpoints.

### Key Capabilities
- **Non-blocking Ingestion**: Accepts file uploads and responds immediately with `202 Accepted` and a unique `processingId` (UUID v4).
- **Asynchronous Task Queue**: Uses **BullMQ** backed by **Redis** to execute intensive processing tasks without blocking HTTP request threads.
- **Independent Worker Scaling**: The API server and background workers are isolated, enabling worker process scaling (`docker compose up --scale worker=N`) based on workload intensity.
- **6-Point Quality & Authenticity Check**: Performs Blur Detection, Brightness Verification, Duplicate Identification, Number Plate OCR, Screenshot Detection, and Image Tamper Detection.
- **Resilient Storage & ORM**: Leverages **PostgreSQL** with **Prisma ORM** using a decoupled 1:1 schema pattern (`Upload` and `Analysis`).
- **Production-Ready Operations**: Centralized operational error handling, input validation with **Zod**, and structured JSON logging with **Pino**.

---

## 2. Architecture & System Flow

### System Architecture Diagram

```
                              +--------------------+
                              |    Client App      |
                              +---------+----------+
                                        |
                 POST /upload (multipart) | GET /status/:id | GET /result/:id
                                        v
+-----------------------------------------------------------------------------------+
| Express API Tier (App / Controller)                                                |
|  - File Validation (Multer, Zod)                                                 |
|  - SHA-256 Hash Computation                                                       |
|  - Persist Upload Record (Status: PENDING)                                        |
|  - Enqueue Job to Redis via BullMQ                                                |
+-------------------+---------------------------------------------------------------+
                    |
                    | (Job Enqueued: { uploadId, filepath, hash })
                    v
          +-------------------+
          |    Redis Store    |  <--- Queue Persistence & Job States
          +---------+---------+
                    |
                    | (Dequeues Job)
                    v
+-----------------------------------------------------------------------------------+
| BullMQ Worker Tier (Standalone Worker Process)                                    |
|  1. Status -> PROCESSING                                                          |
|  2. Execute 6 Analysis Processors concurrently (Promise.all):                    |
|     + Blur  + Brightness  + Duplicate  + Plate OCR  + Screenshot  + Tamper        |
|  3. On Success -> Save Analysis Record -> Status: COMPLETED                       |
|  4. On Failure -> Exponential Retry Backoff -> Final Failure: Status: FAILED       |
+-------------------+---------------------------------------------------------------+
                    |
                    v
          +-------------------+
          |   PostgreSQL DB   |  <--- Prisma ORM (Upload & Analysis Tables)
          +-------------------+
```

---

## 3. Project Directory & Module Structure

The project follows a clean, single-responsibility layered architecture:

```
media-pipeline/
├── Dockerfile                   # Multi-stage Docker build config
├── docker-compose.yml           # Multi-container setup (Postgres, Redis, API, Worker, Migration)
├── package.json                 # Dependencies & scripts
├── tsconfig.json                # TypeScript compiler configuration
├── prisma/
│   └── schema.prisma            # Prisma database schema definition
├── scripts/
│   ├── generate-sample-image.js # Helper script to generate sample test images
│   └── smoke-test.sh            # Automated end-to-end smoke test script
└── src/
    ├── app.ts                   # Express application factory & middleware setup
    ├── server.ts                # API server entrypoint
    ├── analysis/
    │   └── analyzer.ts          # Main orchestrator for parallel analysis checks
    ├── config/                  # Environment, Logger, Prisma, and Redis singletons
    ├── constants/               # Global regexes, allowed mime types, screen resolution matrices
    ├── controllers/             # Thin HTTP route handlers (Upload, Status, Health)
    ├── middlewares/             # Multer upload handler, Zod validator, Logger, Error middleware
    ├── processors/              # Core logic for the 6 individual inspection checks
    │   ├── blur.processor.ts
    │   ├── brightness.processor.ts
    │   ├── duplicate.processor.ts
    │   ├── plate.processor.ts
    │   ├── screenshot.processor.ts
    │   └── tamper.processor.ts
    ├── queues/                  # BullMQ queue instance and enqueue helpers
    ├── repositories/            # Prisma abstraction layer (UploadRepository, AnalysisRepository)
    ├── routes/                  # Express route definitions
    ├── services/                # Business logic orchestration (UploadService, StatusService)
    ├── types/                   # Shared TypeScript interfaces & types
    ├── utils/                   # Custom error classes, async handlers, hashing utilities
    ├── validators/              # Zod validation schemas
    └── workers/                 # Standalone BullMQ worker process entrypoint
```

---

## 4. Database Design & Schema Rationale

The database uses PostgreSQL managed via Prisma ORM (`prisma/schema.prisma`).

### Dual-Table 1:1 Pattern (`Upload` & `Analysis`)

```prisma
enum UploadStatus {
  PENDING
  PROCESSING
  COMPLETED
  FAILED
}

model Upload {
  id            String       @id @default(uuid())
  filename      String
  filepath      String
  mimeType      String
  sizeBytes     Int
  hash          String
  status        UploadStatus @default(PENDING)
  failureReason String?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  analysis Analysis?

  @@index([hash])
  @@index([status])
}

model Analysis {
  id       String @id @default(uuid())
  uploadId String @unique
  upload   Upload @relation(fields: [uploadId], references: [id], onDelete: Cascade)

  // Blur Check
  blurScore     Float?
  blurThreshold Float?
  blurPassed    Boolean?

  // Brightness Check
  brightnessAverage Float?
  brightnessStatus  String?
  brightnessPassed  Boolean?

  // Duplicate Check
  isDuplicate   Boolean?
  duplicateOfId String?

  // Plate OCR Check
  vehicleNumberRaw   String?
  vehicleNumberValid Boolean?
  ocrConfidence      Float?

  // Screenshot Heuristic
  screenshotSuspected  Boolean?
  screenshotConfidence Float?

  // Tamper Heuristic
  tamperSuspected  Boolean?
  tamperConfidence Float?

  // Raw extensible output
  resultJson  Json?
  completedAt DateTime?
  createdAt   DateTime  @default(now())
}
```

### Design Rationale
1. **Lifecycle Isolation**: `Upload` stores immediate upload metadata present from request arrival. `Analysis` is only created upon job completion. Keeping `Upload` lightweight prevents lock contention and bloat when thousands of jobs remain `PENDING`.
2. **Re-Analysis Ready**: If algorithm thresholds change or a check is updated, an existing `Upload` record can have its `Analysis` re-calculated without altering upload metadata.
3. **Deduplication Indexing**: An index on `Upload.hash` allows $O(1)$ fast lookups during file ingestion.
4. **Forward Compatibility**: `resultJson` stores full raw check results, permitting schema-less additions of future processor attributes without needing immediate database migrations.

---

## 5. Deep-Dive into the Image Analysis Pipeline

All 6 checks are executed concurrently inside `src/analysis/analyzer.ts` using `Promise.all`:

```typescript
const [blur, brightness, duplicate, plate, screenshot, tamper] = await Promise.all([
  detectBlur(filepath),
  analyzeBrightness(filepath),
  detectDuplicate(uploadId, hash),
  extractAndValidatePlate(filepath),
  detectScreenshot(filepath),
  detectTampering(filepath),
]);
```

### 5.1 Blur Detection (Laplacian Variance)
- **File**: `src/processors/blur.processor.ts`
- **Methodology**: Converts image to grayscale raw pixel buffer using `sharp`. Applies a 3x3 Laplacian convolution matrix:
  $$\begin{bmatrix} 0 & 1 & 0 \\ 1 & -4 & 1 \\ 0 & 1 & 0 \end{bmatrix}$$
- **Formula**: Calculates variance of Laplacian values $\sigma^2 = \frac{1}{N} \sum (x_i - \mu)^2$.
- **Decision Rule**: Higher variance indicates sharp edges; low variance indicates blur. If $\sigma^2 < \text{BLUR\_VARIANCE\_THRESHOLD}$ (default: `100.0`), the image fails the blur test.

### 5.2 Brightness Analysis (Rec. 601 Perceptual Luminance)
- **File**: `src/processors/brightness.processor.ts`
- **Methodology**: Uses `sharp.stats()` to extract mean values for Red ($R$), Green ($G$), and Blue ($B$) channels.
- **Formula**:
  $$\text{Luminance} = 0.299 \times \mu_R + 0.587 \times \mu_G + 0.114 \times \mu_B$$
- **Decision Rule**: Returns `TOO_DARK` if luminance $< 40$, `TOO_BRIGHT` if luminance $> 220$, and `NORMAL` otherwise.

### 5.3 Duplicate Detection (SHA-256 Hashing)
- **File**: `src/processors/duplicate.processor.ts` & `src/utils/hash.ts`
- **Methodology**: Computes SHA-256 hash during upload stream. Queries `UploadRepository.findByHash(hash)`.
- **Decision Rule**: If another record exists with a matching hash and different `uploadId`, marks `isDuplicate: true` and attaches `duplicateOfId`.

### 5.4 Indian Vehicle Plate OCR & Validation
- **File**: `src/processors/plate.processor.ts`
- **Methodology**: Spawns a `tesseract.js` worker (`eng` language model) to recognize text. Strips non-alphanumeric characters and converts to uppercase.
- **Validation Standard**: Tests against standard Indian civilian plate format regex (`^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4}$`, e.g., `KA05MH1234` or `DL01C1234`).
- **Output**: Returns extracted raw/cleaned text, boolean `isValid`, and Tesseract confidence percentage.

### 5.5 Screenshot / Photo-of-Photo Heuristic
- **File**: `src/processors/screenshot.processor.ts`
- **Methodology**: Inspects image metadata for EXIF camera headers (make, model, exposure) and checks dimensions against `COMMON_SCREENSHOT_RESOLUTIONS` (e.g., $1080 \times 2400$, $1170 \times 2532$).
- **Decision Rule**: Absence of EXIF adds +0.3 confidence; exact match with screen resolution adds +0.7 confidence. Flags `suspected: true` if resolution matches.

### 5.6 Image Tamper / ELA Approximation
- **File**: `src/processors/tamper.processor.ts`
- **Methodology**: Approximates Error Level Analysis (ELA). Converts image to alpha-free raw buffer, re-compresses it to JPEG at Quality 90, resizes back, and calculates mean absolute pixel difference:
  $$\text{MAD} = \frac{1}{N} \sum_{i=1}^N |P_{\text{orig}}[i] - P_{\text{recompressed}}[i]|$$
- **Decision Rule**: High divergence indicates multiple lossy edit cycles. If $\text{MAD} > 12.0$, flags `suspected: true`.

---

## 6. API Specification & Interaction Lifecycle

### Endpoints Overview

| Method | Path | Description | HTTP Status Codes |
|---|---|---|---|
| `POST` | `/upload` | Submit image for processing | `202`, `400`, `500` |
| `GET` | `/status/:id` | Query upload processing state | `200`, `400`, `404` |
| `GET` | `/result/:id` | Fetch completed analysis output | `200`, `400`, `404` |
| `GET` | `/failure/:id` | Fetch error details for failed jobs | `200`, `400`, `404` |
| `GET` | `/health` | Liveness and dependency checks | `200`, `503` |

### Detailed API Usage Examples

#### 1. File Upload (`POST /upload`)
- **Request**: `multipart/form-data` with field `image`.
```bash
curl -X POST http://localhost:3000/upload \
  -F "image=@/path/to/vehicle.jpg"
```
- **Response (`202 Accepted`)**:
```json
{
  "processingId": "3d6c1e2a-8b1a-4b8e-9b0e-2a6b7c9e1234",
  "status": "PENDING"
}
```

#### 2. Check Status (`GET /status/:id`)
```bash
curl http://localhost:3000/status/3d6c1e2a-8b1a-4b8e-9b0e-2a6b7c9e1234
```
- **Response (`200 OK`)**:
```json
{
  "processingId": "3d6c1e2a-8b1a-4b8e-9b0e-2a6b7c9e1234",
  "status": "PROCESSING",
  "createdAt": "2026-07-21T06:40:00.000Z",
  "updatedAt": "2026-07-21T06:40:02.000Z"
}
```

#### 3. Fetch Analysis Result (`GET /result/:id`)
```bash
curl http://localhost:3000/result/3d6c1e2a-8b1a-4b8e-9b0e-2a6b7c9e1234
```
- **Response (`200 OK`)**:
```json
{
  "blur": {
    "score": 342.11,
    "threshold": 100,
    "passed": true
  },
  "brightness": {
    "averageBrightness": 128.4,
    "status": "NORMAL",
    "passed": true
  },
  "duplicate": {
    "isDuplicate": false,
    "duplicateOfId": null
  },
  "plate": {
    "extractedText": "KA05MH1234",
    "isValid": true,
    "confidence": 87.2
  },
  "screenshot": {
    "suspected": false,
    "confidence": 0.3,
    "reasons": [
      "No EXIF/camera metadata present"
    ]
  },
  "tamper": {
    "suspected": false,
    "confidence": 0.18,
    "reasons": []
  }
}
```

#### 4. Fetch Failure Reason (`GET /failure/:id`)
```bash
curl http://localhost:3000/failure/3d6c1e2a-8b1a-4b8e-9b0e-2a6b7c9e1234
```
- **Response (`200 OK`)**:
```json
{
  "processingId": "3d6c1e2a-8b1a-4b8e-9b0e-2a6b7c9e1234",
  "status": "FAILED",
  "failureReason": "OCR extraction failed: Tesseract worker terminated unexpectedly"
}
```

---

## 7. Error Handling, Validation & Logging

### Error Hierarchy (`src/utils/errors.ts`)
- `AppError`: Base custom error with `statusCode` and `isOperational` flags.
- `NotFoundError` (`404`): Returned when upload IDs do not exist.
- `ValidationError` (`400`): Returned on invalid inputs or Zod validation errors.
- `ProcessingError` (`500`): Internal image analysis failure.
- `OcrError` (`500`): Tesseract execution failure.

### Centralized Error Middleware (`src/middlewares/errorHandler.ts`)
Interprets throw paths without requiring `try/catch` boilerplate in controllers. Maps known operational errors to HTTP responses and logs unexpected internal errors securely.

### Logging Infrastructure (`src/config/logger.ts`)
Structured JSON logging using `pino` and `pino-http`. Includes timestamping, request IDs, execution durations (`durationMs`), and error stack trace formatting.

---

## 8. Setup, Docker & Deployment Guide

### Prerequisites
- **Node.js**: v20+
- **Docker & Docker Compose** (Recommended)
- OR **PostgreSQL 16+** & **Redis 7+** for local execution.

### Environment Setup (`.env`)
Copy `.env.example` to `.env`:
```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/media_pipeline?schema=public
REDIS_HOST=localhost
REDIS_PORT=6379
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=10
QUEUE_MAX_ATTEMPTS=3
QUEUE_BACKOFF_MS=2000
BLUR_VARIANCE_THRESHOLD=100.0
BRIGHTNESS_MIN=40.0
BRIGHTNESS_MAX=220.0
```

### Running with Docker Compose (Recommended)
```bash
# Build images and start Postgres, Redis, Migration, API, and Worker containers
docker compose up --build

# Scale worker instances dynamically
docker compose up --scale worker=3 -d
```

### Running Locally (Without Docker)
```bash
# 1. Install dependencies
npm install

# 2. Run Prisma migrations & client generation
npx prisma migrate dev --name init
npm run prisma:generate

# 3. Start API server (Terminal 1)
npm run dev

# 4. Start Worker process (Terminal 2)
npm run dev:worker
```

### Deploying on Render (Production Cloud)

#### Option 1: 1-Click Blueprint Deployment (`render.yaml`)
1. Push your code to GitHub or GitLab.
2. Log into [Render Dashboard](https://dashboard.render.com/) and click **New** -> **Blueprint**.
3. Select your repository. Render will automatically parse [`render.yaml`](file:///c:/Users/BHAVISH%20B/OneDrive/Documents/gOGig/media-pipeline/media-pipeline/render.yaml) and provision:
   - **PostgreSQL Database** (`media-pipeline-db`)
   - **Redis Service** (`media-pipeline-redis`)
   - **API Web Service** (`media-pipeline-api`) with `EMBED_WORKER=true` and automatic Prisma database migrations on launch.

#### Option 2: Manual Render Service Creation
1. **Provision Database**: Create a **PostgreSQL** instance on Render. Save the Internal Database URL (`postgres://...`).
2. **Provision Redis**: Create a **Redis** instance on Render. Save the Internal Redis Connection String (`redis://...`).
3. **Provision Web Service**:
   - Environment: `Node`
   - Build Command: `npm install && npm run build && npx prisma generate`
   - Start Command: `npm run start:migrate`
   - Environment Variables:
     - `DATABASE_URL` = *(Internal PostgreSQL URL)*
     - `REDIS_URL` = *(Internal Redis URL)*
     - `EMBED_WORKER` = `true`
     - `UPLOAD_DIR` = `./uploads`

### Verification & Automated Testing
```bash
# Run type check linting
npm run lint

# Execute automated smoke test script
BASE_URL=http://localhost:3000 ./scripts/smoke-test.sh
```

---

## 9. Trade-offs, Assumptions & Future Roadmap

### Design Trade-offs
1. **Sharp vs. OpenCV**: Sharp (libvips) was chosen over `opencv4nodejs` to prevent heavy native compilation toolchains (CMake/Python) in Docker environments. Sharp computes identical statistical values (Laplacian variance, Rec 601 luminance) cleanly and quickly.
2. **Heuristics vs. Deep Learning**: Tamper and screenshot detection rely on deterministic heuristics (re-compression pixel diffs, resolution grids, EXIF headers) rather than heavy ML classifiers, maintaining fast execution times.
3. **Exact SHA-256 vs. Perceptual Hashing**: Exact byte hashing detects byte-identical uploads instantly. Near-duplicate images (resized or slightly edited) are not detected by SHA-256.

### Future Improvements
- **Perceptual Hashing (pHash)**: Implement perceptual image hashing to detect modified/resized duplicate uploads.
- **S3 / Cloud Storage Integration**: Replace local filesystem storage with AWS S3 or GCP Cloud Storage using signed URLs.
- **Queue Administration Dashboard**: Integrate Bull Board for visual dead-letter queue inspection and manual retry triggering.
- **Rate Limiting & Auth**: Add API Key or JWT authentication and express rate limiting on `/upload`.
