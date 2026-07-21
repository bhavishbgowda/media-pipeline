import { PrismaClient } from "@prisma/client";
import { env } from "./env";

// Single shared PrismaClient instance (recommended by Prisma docs to avoid
// exhausting DB connections across hot-reloads / multiple imports).
export const prisma = new PrismaClient({
  log: env.nodeEnv === "development" ? ["warn", "error"] : ["error"],
});
