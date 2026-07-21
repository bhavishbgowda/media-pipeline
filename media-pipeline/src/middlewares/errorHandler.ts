import { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import { logger } from "../config/logger";
import { AppError } from "../utils/errors";

// Centralized error middleware. Every request path (validation, multer,
// controllers, async handlers) funnels here. Operational errors (AppError)
// are returned with their intended status + message. Anything unexpected
// is logged with full detail but returned to the client as a generic 500
// so internals are never leaked.
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof MulterError) {
    logger.warn({ err }, "Multer upload error");
    return res.status(400).json({
      error: { message: err.message, code: err.code },
    });
  }

  if (err instanceof AppError) {
    const level = err.isOperational ? "warn" : "error";
    logger[level]({ err, details: err.details }, err.message);
    return res.status(err.statusCode).json({
      error: {
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  logger.error({ err }, "Unhandled exception");
  return res.status(500).json({
    error: { message: "Internal server error" },
  });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: { message: `Route not found: ${req.method} ${req.originalUrl}` } });
}
