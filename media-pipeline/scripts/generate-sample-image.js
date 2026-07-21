// Generates a small synthetic JPEG for manual/smoke testing so reviewers
// don't need to supply their own vehicle photo just to try the API.
const sharp = require("sharp");
const path = require("path");

async function main() {
  const width = 800, height = 600;
  const buffer = Buffer.alloc(width * height * 3);
  for (let i = 0; i < buffer.length; i += 3) {
    buffer[i] = 120; buffer[i + 1] = 140; buffer[i + 2] = 160;
  }
  const outPath = path.join(__dirname, "sample-vehicle.jpg");
  await sharp(buffer, { raw: { width, height, channels: 3 } }).jpeg({ quality: 85 }).toFile(outPath);
  console.log(`Sample image written to ${outPath}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
