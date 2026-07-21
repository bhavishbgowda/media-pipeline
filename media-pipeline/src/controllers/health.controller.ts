import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { createRedisConnection } from "../config/redis";

export async function getHealth(_req: Request, res: Response) {
  const checks: Record<string, "ok" | "down"> = { database: "down", redis: "down" };

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "ok";
  } catch {
    checks.database = "down";
  }

  const redis = createRedisConnection();
  try {
    await redis.ping();
    checks.redis = "ok";
  } catch {
    checks.redis = "down";
  } finally {
    redis.disconnect();
  }

  const healthy = Object.values(checks).every((v) => v === "ok");
  res.status(healthy ? 200 : 503).json({ status: healthy ? "ok" : "degraded", checks });
}
