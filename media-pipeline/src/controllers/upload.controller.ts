import { Request, Response } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { uploadService } from "../services/upload.service";
import { ValidationError } from "../utils/errors";

export const uploadImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ValidationError("No image file provided. Attach a file under field name 'image'.");
  }
  const result = await uploadService.handleUpload(req.file);
  res.status(202).json(result);
});
