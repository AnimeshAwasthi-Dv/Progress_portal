import { mkdir } from "node:fs/promises";
import sharp from "sharp";

await mkdir("images/generated", { recursive: true });
await Promise.all([48, 96, 192].map((size) => sharp("images/logo.png")
  .resize(size, size, { fit: "inside", withoutEnlargement: true })
  .webp({ quality: 85 })
  .toFile(`images/generated/logo-${size}.webp`)));
