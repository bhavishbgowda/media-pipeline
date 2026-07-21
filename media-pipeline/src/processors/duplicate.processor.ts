import { uploadRepository } from "../repositories/upload.repository";
import { DuplicateCheckResult } from "../types";

// The SHA256 hash is computed once at upload time (see upload.service.ts)
// and stored on the Upload row immediately -- this lets us reject/flag
// duplicates before ever enqueueing a job. This processor re-checks at
// analysis time too, since a second upload with the same hash could have
// been queued concurrently before the first one's DB row committed.
export async function detectDuplicate(uploadId: string, hash: string): Promise<DuplicateCheckResult> {
  const existing = await uploadRepository.findByHash(hash);
  if (existing && existing.id !== uploadId) {
    return { isDuplicate: true, duplicateOfId: existing.id };
  }
  return { isDuplicate: false, duplicateOfId: null };
}
