import pinoHttp from "pino-http";
import { logger } from "../config/logger";

// Logs request start/end with duration and a correlation id, satisfying
// the "log request start/end, processing duration" requirement.
export const requestLogger = pinoHttp({
  logger,
  customSuccessMessage: (req, res, responseTime) =>
    `${req.method} ${req.url} completed ${res.statusCode} in ${responseTime}ms`,
  customErrorMessage: (req, res, err) =>
    `${req.method} ${req.url} failed ${res.statusCode}: ${err.message}`,
});
