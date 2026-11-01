import { existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { IMAGE_VARIATIONS } from '../src/shared/products.ts';

const IMAGE_SIZES = [256, 1024, 2048] as const;
const OUTPUT_DIRECTORY = resolve(import.meta.dirname, '../public/generated');

/** 色相だけが違う単純な図形。JPEG は小さくなるが、デコード後の大きさは画素数で決まる */
function createSvg(imageId: number, size: number): string {
  const hue = (imageId * 360) / IMAGE_VARIATIONS;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="hsl(${hue} 70% 62%)"/>
        <stop offset="1" stop-color="hsl(${(hue + 50) % 360} 70% 38%)"/>
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill="url(#g)"/>
    <circle cx="50" cy="46" r="24" fill="hsl(${hue} 80% 88%)" opacity="0.85"/>
    <rect x="22" y="76" width="56" height="7" rx="3.5" fill="hsl(${hue} 80% 92%)" opacity="0.8"/>
  </svg>`;
}

async function generateImage(imageId: number, size: number): Promise<boolean> {
  const output = resolve(OUTPUT_DIRECTORY, `product-${imageId}-${size}.jpg`);
  if (existsSync(output)) {
    return false;
  }
  await sharp(Buffer.from(createSvg(imageId, size)))
    .jpeg({ quality: 80 })
    .toFile(output);
  return true;
}

mkdirSync(OUTPUT_DIRECTORY, { recursive: true });

const results = await Promise.all(
  Array.from({ length: IMAGE_VARIATIONS }, (_, imageId) => imageId).flatMap((imageId) =>
    IMAGE_SIZES.map((size) => generateImage(imageId, size)),
  ),
);

console.log(`generated ${results.filter(Boolean).length} of ${results.length} images`);
