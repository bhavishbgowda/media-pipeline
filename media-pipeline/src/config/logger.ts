import pino from "pino";
import { env } from "./env";

// Structured logging (Pino). In development we pretty-print for readability;
// in production we emit raw JSON lines suitable for shipping to a log
// aggregator (ELK, Loki, CloudWatch, etc).
export const logger = pino({
  level: env.logLevel,
  transport:
    env.nodeEnv === "development"
      ? { target: "pino-pretty", options: { colorize: true, translateTime: "SYS:standard" } }
      : undefined,
  base: { service: "media-pipeline" },
});
