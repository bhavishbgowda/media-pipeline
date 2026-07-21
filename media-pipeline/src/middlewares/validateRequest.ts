import { NextFunction, Request, Response } from "express";
import { AnyZodObject, ZodError } from "zod";
import { ValidationError } from "../utils/errors";

type RequestPart = "body" | "params" | "query";

// Generic Zod-based validation middleware. Validates the given request
// part and replaces it with the parsed (and type-coerced) value so
// downstream controllers get trusted, typed data.
export const validate = (schema: AnyZodObject, part: RequestPart = "body") =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse(req[part]);
      (req as any)[part] = parsed;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(new ValidationError("Request validation failed", err.errors));
      }
      next(err);
    }
  };
