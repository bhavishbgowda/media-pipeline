export type UploadStatusValue = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface BlurCheckResult {
  score: number;
  threshold: number;
  passed: boolean;
}

export interface BrightnessCheckResult {
  averageBrightness: number;
  status: "TOO_DARK" | "TOO_BRIGHT" | "NORMAL";
  passed: boolean;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  duplicateOfId: string | null;
}

export interface ScreenshotCheckResult {
  suspected: boolean;
  confidence: number;
  reasons: string[];
}

export interface TamperCheckResult {
  suspected: boolean;
  confidence: number;
  reasons: string[];
}

export interface AnalysisResult {
  blur: BlurCheckResult;
  brightness: BrightnessCheckResult;
  duplicate: DuplicateCheckResult;
  screenshot: ScreenshotCheckResult;
  tamper: TamperCheckResult;
}

export interface AnalyzeJobPayload {
  uploadId: string;
  filepath: string;
  hash: string;
}
