// Centralized custom error hierarchy. Every error the app throws deliberately
// extends AppError so the error middleware can map it to a proper HTTP
// status code without string-matching messages.
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(message: string, statusCode: number, isOperational = true, details?: unknown) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, true, details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404, true);
  }
}

export class InvalidImageError extends AppError {
  constructor(message = "Uploaded file is not a valid, readable image") {
    super(message, 422, true);
  }
}

export class DuplicateUploadError extends AppError {
  constructor(message = "Duplicate upload detected") {
    super(message, 409, true);
  }
}

export class QueueError extends AppError {
  constructor(message = "Failed to enqueue processing job") {
    super(message, 503, true);
  }
}

export class DatabaseError extends AppError {
  constructor(message = "Database operation failed") {
    super(message, 500, false);
  }
}

export class ProcessingError extends AppError {
  constructor(message = "Image analysis failed", details?: unknown) {
    super(message, 500, true, details);
  }
}

export class OcrError extends AppError {
  constructor(message = "OCR extraction failed") {
    super(message, 500, true);
  }
}
