import { createApp } from "./app";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { prisma } from "./config/prisma";

const app = createApp();

const server = app.listen(env.port, () => {
  logger.info(`API server listening on port ${env.port} (${env.nodeEnv})`);

  if (env.embedWorker) {
    import("./workers/analysis.worker").then(() => {
      logger.info("Embedded BullMQ analysis worker initialized inside API process");
    }).catch((err) => {
      logger.error({ err }, "Failed to start embedded BullMQ worker");
    });
  }
});

async function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
