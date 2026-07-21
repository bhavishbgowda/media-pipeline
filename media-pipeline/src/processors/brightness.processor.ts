import sharp from "sharp";
import { env } from "../config/env";
import { BrightnessCheckResult } from "../types";
import { ProcessingError } from "../utils/errors";

// Brightness analysis using Sharp's built-in per-channel stats, converted
// to a single perceptual luminance figure (standard Rec. 601 weights).
export async function analyzeBrightness(filepath: string): Promise<BrightnessCheckResult> {
  try {
    const stats = await sharp(filepath).stats();
    const [r, g, b] = stats.channels;
    const averageBrightness = r.mean * 0.299 + g.mean * 0.587 + b.mean * 0.114;

    let status: BrightnessCheckResult["status"] = "NORMAL";
    if (averageBrightness < env.brightnessMin) status = "TOO_DARK";
    else if (averageBrightness > env.brightnessMax) status = "TOO_BRIGHT";

    return {
      averageBrightness: Number(averageBrightness.toFixed(2)),
      status,
      passed: status === "NORMAL",
    };
  } catch (err) {
    throw new ProcessingError(`Brightness analysis failed: ${(err as Error).message}`);
  }
}
