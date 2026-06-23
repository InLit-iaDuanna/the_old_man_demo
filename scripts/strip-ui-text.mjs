// Strip the Figma-outlined TEXT <path> elements from the full-screen UI-art SVGs,
// then rasterize the text-free art to the SAME WebP outputs the app already loads.
// The HTML layer renders the real (localizable) text on top, so the baked-in vector
// text in these SVGs is duplicated/conflicting — this removes it while preserving
// every bitmap layer (paper, cityscape, envelope, wax seal, footprints, blank
// button plaques) which are all <image>/<rect>/<pattern>, never <path>.
//
// Rule for removing a path (must match exactly):
//   - Only top-level SELF-CLOSING <path .../> elements are candidates.
//   - Remove it if fill="black"  OR  its `d` attribute length > 3000  (text glyphs).
//   - NEVER touch <path> inside <defs>/<clipPath> (clip geometry). We enforce this by
//     only editing the region of the file BEFORE the first <defs>, where Figma places
//     all drawable top-level paths. Small grid/slot paths (排序题) have non-black fill
//     and d-length < 3000, so they are kept.
//
// Run:  node --max-old-space-size=8192 scripts/strip-ui-text.mjs
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';

const root = new URL('..', import.meta.url).pathname;
const uiSrc = join(root, 'UI');
const uiOut = join(root, 'web/generated/ui_mobile');
const schoolOut = join(root, 'web/generated/school_mobile');
const cleanDir = join(root, 'web/generated/.ui-clean');

// Match rasterize-ui-art.mjs EXACTLY.
const RENDER_WIDTH = 1024;
const DENSITY = 144;
const WEBP_QUALITY = 82;

const D_LENGTH_THRESHOLD = 3000;

const jobs = [
  { svg: '体态引导1.svg', out: join(uiOut, 'guide-1.webp') },
  { svg: '体态引导2.svg', out: join(uiOut, 'guide-2.webp') },
  { svg: '体态引导3.svg', out: join(uiOut, 'guide-3.webp') },
  // guide-4 baked in the (now-removed) sensitivity slider as bitmap layers: image5 is
  // the gold ruler bar, image8 the round stamp acting as its knob. Drop both — the
  // sensitivity control is gone (auto-tuned now). The 进入游戏 wax-seal button stays.
  { svg: '体态引导4.svg', out: join(uiOut, 'guide-4.webp'), dropImageIds: ['image5', 'image8'] },
  { svg: '加载画面.svg', out: join(uiOut, 'loading-art.webp') },
  { svg: '排序题.svg', out: join(schoolOut, 'sort-board.webp') },
];

/**
 * Remove text <path .../> elements from the drawable region of an SVG string.
 * Returns { svg, removed } where removed is an array of { index, fill, dLength }.
 */
function stripTextPaths(svg) {
  // Everything before the first <defs> is the drawable region; clip geometry lives
  // inside <defs>/<clipPath> after it. If there is no <defs>, treat the whole file.
  const defsStart = svg.indexOf('<defs');
  const headEnd = defsStart === -1 ? svg.length : defsStart;
  const head = svg.slice(0, headEnd);
  const tail = svg.slice(headEnd);

  const removed = [];
  let pathIndex = 0;
  const selfClosingPath = /<path\b[^>]*?\/>/g;

  const newHead = head.replace(selfClosingPath, (tag) => {
    const currentIndex = pathIndex++;
    const fillMatch = tag.match(/fill="([^"]*)"/);
    const dMatch = tag.match(/\bd="([^"]*)"/);
    const fill = fillMatch ? fillMatch[1] : null;
    const dLength = dMatch ? dMatch[1].length : 0;

    const isText = fill === 'black' || dLength > D_LENGTH_THRESHOLD;
    if (isText) {
      removed.push({ index: currentIndex, fill: fill ?? '(none)', dLength });
      return ''; // strip it
    }
    return tag; // keep grid/slot lines etc.
  });

  return { svg: newHead + tail, removed };
}

/**
 * Drop specific bitmap layers by image-id stem (e.g. 'image5'). Figma paints each
 * layer with a <rect fill="url(#patternN)"/> where patternN references that <image>
 * via a <use href="#imageN">. We map pattern→image, then remove the placement rects
 * for the targeted images from the drawable region. Returns { svg, dropped }.
 */
function dropImageLayers(svg, imageIdStems) {
  // pattern id -> referenced image id (the <use> may use href or xlink:href)
  const patternToImage = new Map();
  const patternRe = /<pattern\b[^>]*id="(pattern[^"]+)"[^>]*>([\s\S]*?)<\/pattern>/g;
  let pm;
  while ((pm = patternRe.exec(svg)) !== null) {
    const ref = pm[2].match(/(?:xlink:href|href)="#(image[^"]+)"/);
    if (ref) patternToImage.set(pm[1], ref[1]);
  }

  const matchesStem = (imageId) =>
    imageIdStems.some((stem) => imageId === stem || imageId.startsWith(`${stem}_`));
  const targetPatterns = new Set(
    [...patternToImage.entries()].filter(([, img]) => matchesStem(img)).map(([pat]) => pat),
  );

  const dropped = [];
  if (targetPatterns.size === 0) {
    return { svg, dropped };
  }

  const defsStart = svg.indexOf('<defs');
  const headEnd = defsStart === -1 ? svg.length : defsStart;
  let head = svg.slice(0, headEnd);
  const tail = svg.slice(headEnd);

  // Remove self-closing placement rects/paths that paint a targeted pattern.
  head = head.replace(/<(rect|path)\b[^>]*?\/>/g, (tag) => {
    const fill = tag.match(/fill="url\(#(pattern[^)]+)\)"/);
    if (fill && targetPatterns.has(fill[1])) {
      dropped.push({ pattern: fill[1], image: patternToImage.get(fill[1]) });
      return '';
    }
    return tag;
  });

  return { svg: head + tail, dropped };
}

async function run() {
  await mkdir(uiOut, { recursive: true });
  await mkdir(schoolOut, { recursive: true });
  await mkdir(cleanDir, { recursive: true });

  const report = [];

  for (const job of jobs) {
    const srcPath = join(uiSrc, job.svg);
    try {
      const original = await readFile(srcPath, 'utf8');
      const { svg: stripped, removed } = stripTextPaths(original);
      let finalSvg = stripped;
      let dropped = [];
      if (job.dropImageIds?.length) {
        const result = dropImageLayers(finalSvg, job.dropImageIds);
        finalSvg = result.svg;
        dropped = result.dropped;
      }

      const cleanPath = join(cleanDir, job.svg);
      await writeFile(cleanPath, finalSvg, 'utf8');

      await sharp(cleanPath, { density: DENSITY, limitInputPixels: false, unlimited: true })
        .resize({ width: RENDER_WIDTH, withoutEnlargement: false })
        .webp({ quality: WEBP_QUALITY })
        .toFile(job.out);

      const { size } = await stat(job.out);
      const entry = { svg: job.svg, out: job.out.replace(root, ''), removed, dropped, webpBytes: size };
      report.push(entry);

      const nonBlack = removed.filter((r) => r.fill !== 'black');
      const flags = [];
      if (removed.length === 0) flags.push('REMOVED 0 PATHS');
      if (nonBlack.length > 0) flags.push(`NON-BLACK removed: ${nonBlack.map((r) => r.fill).join(', ')}`);
      if (dropped.length > 0) flags.push(`dropped layers: ${dropped.map((d) => d.image).join(', ')}`);
      console.info(
        `[strip] ${job.svg}: removed ${removed.length} path(s)` +
          (dropped.length ? `, dropped ${dropped.length} layer(s)` : '') +
          ` -> ${entry.out} (${(size / 1024).toFixed(1)} KB)` +
          (flags.length ? `  [!] ${flags.join(' | ')}` : '')
      );
      for (const r of removed) {
        console.info(`        - #${r.index} fill=${r.fill} dlen=${r.dLength}`);
      }
    } catch (error) {
      console.error(`[strip] FAILED ${job.svg}:`, error?.stack ?? error?.message ?? error);
      process.exitCode = 1;
    }
  }

  console.info(`\n[strip] clean SVGs kept in: ${cleanDir.replace(root, '')}`);
  console.info('[strip] JSON report:\n' + JSON.stringify(report, null, 2));
}

run();
