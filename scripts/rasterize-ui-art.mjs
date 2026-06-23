// Rasterize the large embedded-bitmap UI SVGs (Figma exports, 8–37MB each) into
// right-sized WebP so the loading screen, somatosensory-guidance (体感引导) screen,
// and school sort board can show the real artwork without shipping tens of MB of SVG.
//
// Run:  node --max-old-space-size=8192 scripts/rasterize-ui-art.mjs
//
// Button/panel crops are still produced by optimize-assets.mjs::extractSvgUiButtons;
// this script only covers the full-screen art that was previously CSS-only / a JPG.
import { mkdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const root = new URL('..', import.meta.url).pathname;
const uiSrc = join(root, 'UI');
const uiOut = join(root, 'web/generated/ui_mobile');
const schoolOut = join(root, 'web/generated/school_mobile');

// viewBox is 512x956 for every screen; render at 2x for retina crispness.
const RENDER_WIDTH = 1024;
const DENSITY = 144; // 72dpi * 2 → ~1024px wide from the 512-unit viewBox
const WEBP_QUALITY = 82;

const jobs = [
  { svg: '加载画面.svg', out: join(uiOut, 'loading-art.webp') },
  { svg: '体态引导1.svg', out: join(uiOut, 'guide-1.webp') },
  { svg: '体态引导2.svg', out: join(uiOut, 'guide-2.webp') },
  { svg: '体态引导3.svg', out: join(uiOut, 'guide-3.webp') },
  { svg: '体态引导4.svg', out: join(uiOut, 'guide-4.webp') },
  { svg: '排序题.svg', out: join(schoolOut, 'sort-board.webp') },
  // 结语 (ending) screens are plain PNG exports; convert to webp too.
  { svg: '结语1.png', out: join(uiOut, 'ending-1.webp') },
  { svg: '结语2.png', out: join(uiOut, 'ending-2.webp') },
];

async function run() {
  await mkdir(uiOut, { recursive: true });
  await mkdir(schoolOut, { recursive: true });

  for (const job of jobs) {
    const srcPath = join(uiSrc, job.svg);
    try {
      await sharp(srcPath, { density: DENSITY, limitInputPixels: false, unlimited: true })
        .resize({ width: RENDER_WIDTH, withoutEnlargement: false })
        .webp({ quality: WEBP_QUALITY })
        .toFile(job.out);
      const { size } = await stat(job.out);
      console.info(`[ui-art] ${job.svg} -> ${job.out.replace(root, '')} (${(size / 1024).toFixed(1)} KB)`);
    } catch (error) {
      console.error(`[ui-art] FAILED ${job.svg}:`, error?.message ?? error);
      process.exitCode = 1;
    }
  }
}

run();
