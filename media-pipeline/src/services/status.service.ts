import { uploadRepository } from "../repositories/upload.repository";
import { analysisRepository } from "../repositories/analysis.repository";
import { NotFoundError, ValidationError } from "../utils/errors";

class StatusService {
  async getStatus(id: string) {
    const upload = await uploadRepository.findById(id);
    if (!upload) throw new NotFoundError(`No upload found with id ${id}`);
    return {
      processingId: upload.id,
      status: upload.status,
      createdAt: upload.createdAt,
      updatedAt: upload.updatedAt,
    };
  }

  async getResult(id: string) {
    const upload = await uploadRepository.findById(id);
    if (!upload) throw new NotFoundError(`No upload found with id ${id}`);
    if (upload.status !== "COMPLETED") {
      throw new ValidationError(
        `Analysis not yet complete for upload ${id} (current status: ${upload.status})`
      );
    }
    const analysis = await analysisRepository.findByUploadId(id);
    if (!analysis) throw new NotFoundError(`No analysis result found for upload ${id}`);
    return analysis.resultJson;
  }

  async getFailure(id: string) {
    const upload = await uploadRepository.findById(id);
    if (!upload) throw new NotFoundError(`No upload found with id ${id}`);
    if (upload.status !== "FAILED") {
      throw new ValidationError(`Upload ${id} has not failed (current status: ${upload.status})`);
    }
    return {
      processingId: upload.id,
      status: upload.status,
      failureReason: upload.failureReason,
    };
  }
}

export const statusService = new StatusService();
