export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

// Indian vehicle number plate format (standard, non-BH series):
// 2 letters (state) + 1-2 digits (RTO code) + 1-3 letters (series) + 4 digits (unique number)
// e.g. KA05MH1234, DL3CAB1234

// Common screenshot resolutions (portrait + landscape) used as a weak
// signal for the screenshot/photo-of-photo heuristic. Not exhaustive by
// design -- see README "Trade-offs" for why this is intentionally simple.
export const COMMON_SCREENSHOT_RESOLUTIONS: Array<[number, number]> = [
  [1080, 1920], [1920, 1080],
  [1170, 2532], [2532, 1170],
  [1080, 2400], [2400, 1080],
  [750, 1334], [1334, 750],
  [1440, 2960], [2960, 1440],
];

export const JOB_NAMES = {
  ANALYZE_IMAGE: "analyze-image",
} as const;
