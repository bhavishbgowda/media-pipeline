import { Queue } from "bullmq";
import { createRedisConnection } from "../config/redis";
import { env } from "../config/env";
import { JOB_NAMES } from "../constants";
import { AnalyzeJobPayload } from "../types";
import { QueueError } from "../utils/errors";
import { logger } from "../config/logger";

// Single BullMQ queue for the "analyze image" job. Retry policy (attempts +
// exponential backoff) is defined here so both the producer (this file)
// and BullMQ itself agree on retry semantics without duplicating config.
export const analysisQueue = new Queue<AnalyzeJobPayload>(env.queueName, {
  connection: createRedisConnection(),
  defaultJobOptions: {
    attempts: env.queueMaxAttempts,
    backoff: { type: "exponential", delay: env.queueBackoffMs },
    removeOnComplete: { age: 3600, count: 1000 },
    // Keep failed jobs around (a lightweight "dead letter" view) so they
    // can be inspected via BullMQ tooling instead of vanishing silently.
    removeOnFail: { age: 24 * 3600 },
  },
});

export async function enqueueAnalysisJob(payload: AnalyzeJobPayload): Promise<void> {
  try {
    await analysisQueue.add(JOB_NAMES.ANALYZE_IMAGE, payload, { jobId: payload.uploadId });
  } catch (err) {
    logger.error({ err, payload }, "Failed to enqueue analysis job");
    throw new QueueError(`Could not enqueue processing job: ${(err as Error).message}`);
  }
}
