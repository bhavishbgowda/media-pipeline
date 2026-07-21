import { createHash } from "crypto";
import { createReadStream } from "fs";

// Streams the file rather than loading it fully into memory so hashing
// large images doesn't blow up worker memory usage.
export function sha256File(filepath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filepath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}
