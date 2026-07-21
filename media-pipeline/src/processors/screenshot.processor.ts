import sharp from "sharp";
import { COMMON_SCREENSHOT_RESOLUTIONS } from "../constants";
import { ScreenshotCheckResult } from "../types";
import { ProcessingError } from "../utils/errors";

/**
 * Screenshot / photo-of-photo heuristic.
 *
 * This is intentionally a heuristic, not a classifier -- the assignment
 * brief explicitly states ML perfection is not the goal. We combine two
 * weak signals and require both (or a strong single signal) before
 * flagging, to keep the false-positive rate reasonable:
 *
 *  1. Missing EXIF/camera metadata: real camera photos almost always carry
 *     EXIF (make/model/orientation). Screenshots and re-saved/edited images
 *     frequently strip it.
 *  2. Exact match against common device screen resolutions.
 *
 * Photo-of-photo (photographing a screen or a printed photo) is much
 * harder to detect heuristically without a trained model; we approximate
 * it by treating "no EXIF + suspicious resolution" as the same bucket,
 * and call this out explicitly in the README rather than overclaiming
 * accuracy we don't have.
 */
export async function detectScreenshot(filepath: string): Promise<ScreenshotCheckResult> {
  try {
    const metadata = await sharp(filepath).metadata();
    const reasons: string[] = [];

    const hasExif = Boolean(metadata.exif && metadata.exif.length > 0);
    if (!hasExif) reasons.push("No EXIF/camera metadata present");

    const { width, height } = metadata;
    const matchesScreenRes =
      width !== undefined &&
      height !== undefined &&
      COMMON_SCREENSHOT_RESOLUTIONS.some(([w, h]) => w === width && h === height);
    if (matchesScreenRes) reasons.push(`Resolution ${width}x${height} matches a common device screen size`);

    // Missing EXIF alone is common (many apps strip it) and is too weak a
    // signal on its own -- we only flag "suspected" when the resolution
    // also matches a known screen size; missing EXIF just nudges confidence.
    let confidence = 0;
    if (!hasExif) confidence += 0.3;
    if (matchesScreenRes) confidence += 0.7;

    return {
      suspected: matchesScreenRes,
      confidence: Number(Math.min(confidence, 1).toFixed(2)),
      reasons,
    };
  } catch (err) {
    throw new ProcessingError(`Screenshot heuristic failed: ${(err as Error).message}`);
  }
}
