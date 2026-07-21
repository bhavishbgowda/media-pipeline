import { detectBlur } from "../processors/blur.processor";
import { analyzeBrightness } from "../processors/brightness.processor";
import { detectDuplicate } from "../processors/duplicate.processor";
import { detectScreenshot } from "../processors/screenshot.processor";
import { detectTampering } from "../processors/tamper.processor";
import { AnalysisResult } from "../types";
import { logger } from "../config/logger";

/**
 * Orchestrates all six image checks for a single upload.
 *
 * Checks run in parallel via Promise.all since they are independent and
 * each only reads the file from disk (no shared mutable state, no
 * ordering dependency). If any single check throws, the whole analysis
 * is considered failed -- callers (the worker) are responsible for
 * marking the upload FAILED and recording the reason.
 */
export async function analyzeImage(
  uploadId: string,
  filepath: string,
  hash: string
): Promise<AnalysisResult> {
  const start = Date.now();

 const [blur, brightness, duplicate, screenshot, tamper] = await Promise.all([
  detectBlur(filepath),
  analyzeBrightness(filepath),
  detectDuplicate(uploadId, hash),
  detectScreenshot(filepath),
  detectTampering(filepath),
]);

return {
  blur,
  brightness,
  duplicate,
  screenshot,
  tamper,
};
}