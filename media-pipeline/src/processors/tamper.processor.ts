import sharp from "sharp";
import { TamperCheckResult } from "../types";
import { ProcessingError } from "../utils/errors";

/**
 * Tamper / editing heuristic, approximating Error Level Analysis (ELA).
 *
 * Real ELA re-saves the image at a known JPEG quality and diffs it against
 * the original -- regions that were edited after the last save tend to
 * have a different error level than untouched regions, because they
 * haven't been through the same number of lossy compression cycles.
 *
 * We approximate this cheaply with Sharp: re-encode at a fixed quality,
 * compute the mean absolute pixel difference against the original, and
 * treat unusually high divergence as a tamper signal. This is a coarse,
 * whole-image approximation (no region-level heatmap) -- good enough to
 * flag "this file was probably re-saved/edited by software", explicitly
 * NOT a forensic-grade tamper detector. See README "Trade-offs".
 */
export async function detectTampering(filepath: string): Promise<TamperCheckResult> {
  try {
    const original = await sharp(filepath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const recompressedBuffer = await sharp(filepath).jpeg({ quality: 90 }).toBuffer();
    const recompressed = await sharp(recompressedBuffer)
      .resize(original.info.width, original.info.height)
      .raw()
      .toBuffer({ resolveWithObject: true });

    const a = original.data;
    const b = recompressed.data;
    const len = Math.min(a.length, b.length);

    let sumAbsDiff = 0;
    for (let i = 0; i < len; i++) {
      sumAbsDiff += Math.abs(a[i] - b[i]);
    }
    const meanAbsDiff = sumAbsDiff / len;

    // Empirically, a fresh (never-edited) JPEG re-compressed at quality 90
    // shows a low, fairly uniform mean absolute difference. A high value
    // suggests the source has already gone through multiple edit/save
    // cycles or heavy post-processing. Threshold chosen conservatively to
    // avoid flagging ordinary photos; documented as tunable in README.
    const TAMPER_THRESHOLD = 12;
    const suspected = meanAbsDiff > TAMPER_THRESHOLD;
    const reasons = suspected
      ? [`Re-compression error level (${meanAbsDiff.toFixed(2)}) exceeds baseline threshold (${TAMPER_THRESHOLD})`]
      : [];

    return {
      suspected,
      confidence: Number(Math.min(meanAbsDiff / (TAMPER_THRESHOLD * 2), 1).toFixed(2)),
      reasons,
    };
  } catch (err) {
    throw new ProcessingError(`Tamper heuristic failed: ${(err as Error).message}`);
  }
}
