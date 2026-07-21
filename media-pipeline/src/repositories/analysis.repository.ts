import { Analysis, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { DatabaseError } from "../utils/errors";
import { AnalysisResult } from "../types";

class AnalysisRepository {
  async upsertForUpload(uploadId: string, result: AnalysisResult): Promise<Analysis> {
    try {
      return await prisma.analysis.upsert({
        where: { uploadId },
        create: {
          uploadId,
          blurScore: result.blur.score,
          blurThreshold: result.blur.threshold,
          blurPassed: result.blur.passed,
          brightnessAverage: result.brightness.averageBrightness,
          brightnessStatus: result.brightness.status,
          brightnessPassed: result.brightness.passed,
          isDuplicate: result.duplicate.isDuplicate,
          duplicateOfId: result.duplicate.duplicateOfId,
          screenshotSuspected: result.screenshot.suspected,
          screenshotConfidence: result.screenshot.confidence,
          tamperSuspected: result.tamper.suspected,
          tamperConfidence: result.tamper.confidence,
          resultJson: result as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
        update: {
          blurScore: result.blur.score,
          blurThreshold: result.blur.threshold,
          blurPassed: result.blur.passed,
          brightnessAverage: result.brightness.averageBrightness,
          brightnessStatus: result.brightness.status,
          brightnessPassed: result.brightness.passed,
          isDuplicate: result.duplicate.isDuplicate,
          duplicateOfId: result.duplicate.duplicateOfId,
          screenshotSuspected: result.screenshot.suspected,
          screenshotConfidence: result.screenshot.confidence,
          tamperSuspected: result.tamper.suspected,
          tamperConfidence: result.tamper.confidence,
          resultJson: result as unknown as Prisma.InputJsonValue,
          completedAt: new Date(),
        },
      });
    } catch (err) {
      throw new DatabaseError(`Failed to save analysis for upload ${uploadId}: ${(err as Error).message}`);
    }
  }

  async findByUploadId(uploadId: string): Promise<Analysis | null> {
    try {
      return await prisma.analysis.findUnique({ where: { uploadId } });
    } catch (err) {
      throw new DatabaseError(`Failed to fetch analysis for upload ${uploadId}: ${(err as Error).message}`);
    }
  }
}

export const analysisRepository = new AnalysisRepository();
