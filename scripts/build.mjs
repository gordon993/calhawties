// Build script: resizes /images/* into public/images/*, writes public/manifest.json,
// and copies the static site (site/*) into public/. Run with `npm run build`.
import { readdir, mkdir, rm, cp, readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.resolve(import.meta.dirname, "..");
const IMAGES_SRC = path.join(ROOT, "images");
const SITE_SRC = path.join(ROOT, "site");
const PUBLIC_DIR = path.join(ROOT, "public");
const CAPTIONS_FILE = path.join(ROOT, "captions.json");

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"]);
const MAX_EDGE = 1000;
const WEBP_QUALITY = 82;

function titleCaseFromFilename(filename) {
  const base = filename.replace(path.extname(filename), "");
  const words = base
    .replace(/[-_]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") || base;
}

function slugify(filename) {
  const base = filename.replace(path.extname(filename), "");
  return base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function loadCaptionOverrides() {
  try {
    const raw = await readFile(CAPTIONS_FILE, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === "ENOENT") return {};
    throw new Error(`captions.json is not valid JSON: ${err.message}`);
  }
}

async function main() {
  await stat(IMAGES_SRC).catch(() => {
    throw new Error(`Missing ${IMAGES_SRC} — create it and add some photos before building.`);
  });

  const captionOverrides = await loadCaptionOverrides();

  const entries = (await readdir(IMAGES_SRC, { withFileTypes: true }))
    .filter((e) => e.isFile() && IMAGE_EXTENSIONS.has(path.extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort();

  if (entries.length === 0) {
    throw new Error(`No images found in ${IMAGES_SRC}. Add some photos (.jpg, .jpeg, .png, .webp) and rerun.`);
  }

  await rm(PUBLIC_DIR, { recursive: true, force: true });
  await mkdir(path.join(PUBLIC_DIR, "images"), { recursive: true });

  // Copy the static site source (index.html, styles.css, app.js, bracket.js, results.html...)
  await cp(SITE_SRC, PUBLIC_DIR, { recursive: true });

  const usedIds = new Set();
  const manifest = [];

  for (const filename of entries) {
    let id = slugify(filename);
    if (!id) id = "image";
    while (usedIds.has(id)) id = `${id}-2`;
    usedIds.add(id);

    const outName = `${id}.webp`;
    const inputPath = path.join(IMAGES_SRC, filename);
    const outputPath = path.join(PUBLIC_DIR, "images", outName);

    const img = sharp(inputPath).rotate(); // auto-orient from EXIF, then metadata is dropped (no withMetadata call)
    const resized = img.resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: "inside",
      withoutEnlargement: true,
    });
    const { width, height } = await resized.webp({ quality: WEBP_QUALITY }).toFile(outputPath);

    const caption = captionOverrides[filename] || titleCaseFromFilename(filename);

    manifest.push({
      id,
      src: `images/${outName}`,
      alt: caption,
      width,
      height,
    });

    console.log(`  ${filename} -> ${outName} (${width}x${height}) "${caption}"`);
  }

  await writeFile(path.join(PUBLIC_DIR, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`\nBuilt ${manifest.length} images into public/. Manifest written to public/manifest.json.`);
}

main().catch((err) => {
  console.error(`\nBuild failed: ${err.message}`);
  process.exit(1);
});
