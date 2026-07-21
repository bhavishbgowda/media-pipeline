import fs from "fs/promises";
import { Upload } from "@prisma/client";
import { uploadRepository } from "../repositories/upload.repository";
import { enqueueAnalysisJob } from "../queues/analysis.queue";
import { sha256File } from "../utils/hash";
import { logger } from "../config/logger";

export interface UploadResult {
  processingId: string;
  status: Upload["status"];
}

class UploadService {
  /**
   * Business logic for accepting an upload:
   *  1. Hash the file (integrity + duplicate detection key)
   *  2. Persist metadata as PENDING
   *  3. Enqueue the async analysis job
   *  4. Return immediately with the processing id
   *
   * Duplicate handling is intentionally NOT a hard rejection here: we still
   * accept and record the upload (status PENDING -> COMPLETED), but the
   * duplicate-detection check will flag `isDuplicate` + `duplicateOfId` in
   * the analysis result. This matches the brief ("detect duplicate uploads
   * ... return duplicate upload id if found") rather than blocking the
   * request outright, since a legitimate re-upload/retry shouldn't 4xx.
   */
  async handleUpload(file: Express.Multer.File): Promise<UploadResult> {
    let hash: string;
    try {
      hash = await sha256File(file.path);
    } catch (err) {
      // Clean up the orphaned file if we can't even hash it.
      await fs.unlink(file.path).catch(() => undefined);
      throw err;
    }

    const upload = await uploadRepository.create({
      filename: file.originalname,
      filepath: file.path,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      hash,
    });

    try {
      await enqueueAnalysisJob({ uploadId: upload.id, filepath: upload.filepath, hash });
    } catch (err) {
      // Enqueue failed after the DB row was created -- mark it FAILED
      // immediately rather than leaving a PENDING row that will never
      // move (avoids silent stuck uploads).
      await uploadRepository.updateStatus(upload.id, "FAILED", "Failed to enqueue processing job");
      logger.error({ err, uploadId: upload.id }, "Enqueue failed after upload record created");
      throw err;
    }

    return { processingId: upload.id, status: upload.status };
  }
}

export const uploadService = new UploadService();
