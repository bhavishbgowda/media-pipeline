import { Worker, Job } from "bullmq";
import { createRedisConnection } from "../config/redis";
import { env } from "../config/env";
import { logger } from "../config/logger";
import { AnalyzeJobPayload } from "../types";
import { analyzeImage } from "../analysis/analyzer";
import { uploadRepository } from "../repositories/upload.repository";
import { analysisRepository } from "../repositories/analysis.repository";
import { prisma } from "../config/prisma";

/**
 * Standalone worker process. Run separately from the API (see
 * docker-compose.yml: `api` and `worker` are two services from the same
 * image with different start commands) so image-analysis load can be
 * scaled independently of HTTP request load -- e.g. run 5 worker replicas
 * during a traffic spike without touching the API tier.
 */
async function processJob(job: Job<AnalyzeJobPayload>) {
  const { uploadId, filepath, hash } = job.data;
  const start = Date.now();
  logger.info({ uploadId, jobId: job.id, attempt: job.attemptsMade + 1 }, "Worker started processing job");

  await uploadRepository.updateStatus(uploadId, "PROCESSING");

  try {
    const result = await analyzeImage(uploadId, filepath, hash);
    await analysisRepository.upsertForUpload(uploadId, result);
    await uploadRepository.updateStatus(uploadId, "COMPLETED");

    logger.info(
      { uploadId, jobId: job.id, durationMs: Date.now() - start },
      "Worker finished processing job"
    );
  } catch (err) {
    logger.error({ err, uploadId, jobId: job.id, attempt: job.attemptsMade + 1 }, "Worker job failed");

    const isFinalAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (isFinalAttempt) {
      await uploadRepository.updateStatus(uploadId, "FAILED", (err as Error).message);
    }
    // Re-throw so BullMQ registers the failure and applies retry/backoff.
    throw err;
  }
}

const worker = new Worker<AnalyzeJobPayload>(env.queueName, processJob, {
  connection: createRedisConnection(),
  concurrency: 4,
});

worker.on("failed", (job, err) => {
  logger.error({ jobId: job?.id, err: err.message }, "Job permanently failed after all retries");
});

worker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Job marked completed by BullMQ");
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down worker gracefully`);
  await worker.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

logger.info(`Analysis worker started, listening on queue "${env.queueName}"`);
