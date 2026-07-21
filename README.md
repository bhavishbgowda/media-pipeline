# Intelligent Media Processing Pipeline

An asynchronous, Dockerized backend service that analyzes uploaded images using multiple validation processors and returns structured analysis results.

---

# Features

- Blur Detection
- Brightness Analysis
- Duplicate Image Detection
- Screenshot Detection
- Tamper Detection
- Asynchronous Processing using BullMQ
- Dockerized Deployment
- PostgreSQL with Prisma ORM
- REST API built using Express and TypeScript

---

# Tech Stack

| Technology | Purpose |
|------------|---------|
| Node.js | Runtime |
| TypeScript | Programming Language |
| Express.js | REST API |
| PostgreSQL | Database |
| Prisma ORM | Database Access |
| Redis | Queue Backend |
| BullMQ | Background Job Processing |
| Docker | Containerization |

---

# Project Architecture

```
                Client
                   │
                   ▼
             POST /upload
                   │
                   ▼
              Express API
                   │
                   ▼
          Store Upload Metadata
             (PostgreSQL)
                   │
                   ▼
          Add Job to BullMQ Queue
                   │
                   ▼
              Redis Queue
                   │
                   ▼
          Background Worker
                   │
                   ▼
     ┌────────────────────────────┐
     │ Blur Detection             │
     │ Brightness Analysis        │
     │ Duplicate Detection        │
     │ Screenshot Detection       │
     │ Tamper Detection           │
     └────────────────────────────┘
                   │
                   ▼
        Save Results to Database
                   │
                   ▼
        GET /status
        GET /result
```

---

# Project Structure

```
src
│
├── analysis
├── config
├── constants
├── controllers
├── middlewares
├── processors
├── queues
├── repositories
├── routes
├── services
├── workers
└── utils
```

---

# API Endpoints

## Health Check

```
GET /health
```

Response

```json
{
  "status": "ok"
}
```

---

## Upload Image

```
POST /upload
```

Form Data

```
image : file
```

Response

```json
{
  "processingId": "xxxxxxxx",
  "status": "PENDING"
}
```

---

## Check Processing Status

```
GET /status/:processingId
```

Example Response

```json
{
  "processingId": "...",
  "status": "COMPLETED"
}
```

---

## Get Analysis Result

```
GET /result/:processingId
```

Example Response

```json
{
  "blur": {
    "score": 1533.66,
    "passed": true
  },
  "brightness": {
    "status": "NORMAL"
  },
  "duplicate": {
    "isDuplicate": true
  },
  "screenshot": {
    "suspected": false
  },
  "tamper": {
    "suspected": false
  }
}
```

---

# Running Locally

Clone the repository

```bash
git clone https://github.com/bhavishbgowda/media-pipeline.git
```

Install dependencies

```bash
npm install
```

Start the application

```bash
docker compose up --build
```

The API will be available at

```
http://localhost:3000
```

---

# Environment Variables

Create a `.env` file with the following variables.

```
DATABASE_URL=

REDIS_URL=

PORT=3000

NODE_ENV=development
```

---

# Processing Workflow

1. User uploads an image.
2. Upload metadata is stored in PostgreSQL.
3. A processing job is added to the BullMQ queue.
4. The worker processes the image.
5. Results are stored in PostgreSQL.
6. The client retrieves the status and final analysis using the API.

---

# Sample Analysis

- Blur Detection
- Brightness Analysis
- Duplicate Detection
- Screenshot Detection
- Tamper Detection

---

# Future Improvements

- Image Quality Scoring
- Face Detection
- Object Detection
- Cloud Storage Integration
- Authentication and Authorization
- Monitoring Dashboard

---

# Author

**Bhavish B**

Computer Science and Engineering Student

GitHub: https://github.com/bhavishbgowda
