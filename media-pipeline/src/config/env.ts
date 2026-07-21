import dotenv from "dotenv";
dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 3000),

  databaseUrl: required("DATABASE_URL", "postgresql://mediapipeline:mediapipeline@localhost:5432/mediapipeline"),

  redisUrl: process.env.REDIS_URL || undefined,
  redisHost: process.env.REDIS_HOST ?? "localhost",
  redisPort: Number(process.env.REDIS_PORT ?? 6379),
  redisPassword: process.env.REDIS_PASSWORD || undefined,

  uploadDir: process.env.UPLOAD_DIR ?? "uploads",
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB ?? 10),

  queueName: process.env.QUEUE_NAME ?? "analysis-queue",
  queueMaxAttempts: Number(process.env.QUEUE_MAX_ATTEMPTS ?? 3),
  queueBackoffMs: Number(process.env.QUEUE_BACKOFF_MS ?? 2000),

  blurVarianceThreshold: Number(process.env.BLUR_VARIANCE_THRESHOLD ?? 100),
  brightnessMin: Number(process.env.BRIGHTNESS_MIN ?? 40),
  brightnessMax: Number(process.env.BRIGHTNESS_MAX ?? 220),

  embedWorker: process.env.EMBED_WORKER === "true",

  logLevel: process.env.LOG_LEVEL ?? "info",
};
