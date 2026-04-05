/**
 * One-shot: compress public/images/clubs/*.png to ~100KB JPEGs (same tuning as server.js uploads).
 * Usage: node scripts/compress-club-images.js
 */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const TARGET = 100 * 1024;
const dir = path.join(__dirname, "../public/images/clubs");

async function toTargetJpeg(absPath) {
  const stem = path.basename(absPath, path.extname(absPath));
  const outPath = path.join(dir, stem + ".jpg");
  const meta = await sharp(absPath).metadata();
  const hasAlpha = !!meta.hasAlpha;
  let maxEdge = 2048;
  let quality = 82;
  let buf = null;

  for (let attempt = 0; attempt < 36; attempt++) {
    let img = sharp(absPath).rotate().resize(maxEdge, maxEdge, {
      fit: "inside",
      withoutEnlargement: true,
    });
    if (hasAlpha) {
      img = img.flatten({ background: { r: 255, g: 255, b: 255 } });
    }
    buf = await img
      .jpeg({
        quality,
        mozjpeg: true,
        chromaSubsampling: "4:2:0",
      })
      .toBuffer();
    if (buf.length <= TARGET) break;
    if (quality > 44) {
      quality -= 7;
    } else if (maxEdge > 400) {
      maxEdge = Math.max(400, Math.floor(maxEdge * 0.72));
      quality = Math.min(quality + 4, 78);
    } else {
      quality = Math.max(28, quality - 5);
    }
  }

  await fs.promises.writeFile(outPath, buf);
  return { stem, bytes: buf.length, outPath };
}

(async function main() {
  await fs.promises.mkdir(dir, { recursive: true });
  const names = await fs.promises.readdir(dir);
  const pngs = names.filter((f) => f.toLowerCase().endsWith(".png"));
  if (!pngs.length) {
    console.log("No PNG files in", dir);
    process.exit(0);
  }
  for (const f of pngs) {
    const abs = path.join(dir, f);
    const { stem, bytes } = await toTargetJpeg(abs);
    await fs.promises.unlink(abs);
    console.log(stem + ".jpg\t" + Math.round(bytes / 102.4) / 10 + " KB");
  }
})().catch(function (e) {
  console.error(e);
  process.exit(1);
});
