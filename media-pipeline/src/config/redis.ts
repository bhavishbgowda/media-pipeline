import IORedis from "ioredis";
import { env } from "./env";

// BullMQ requires maxRetriesPerRequest: null on the connection it manages.
// We export a factory so both the API process (queue producer) and the
// worker process (queue consumer) get correctly configured, independent
// connections rather than sharing one across processes.
export function createRedisConnection(): IORedis {
  if (env.redisUrl) {
    return new IORedis(env.redisUrl, {
      maxRetriesPerRequest: null,
      tls: env.redisUrl.startsWith("rediss://") ? { rejectUnauthorized: false } : undefined,
    });
  }
  return new IORedis({
    host: env.redisHost,
    port: env.redisPort,
    password: env.redisPassword,
    maxRetriesPerRequest: null,
  });
}
