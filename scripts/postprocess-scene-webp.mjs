import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import sharp from 'sharp';

const root = new URL('..', import.meta.url).pathname;
const generatedDir = join(root, 'web/generated');
const sceneMobilePath = join(generatedDir, 'Demo0620_1_webtoon_mobile.gltf');
const sceneMeshoptPath = join(generatedDir, 'Demo0620_1_webtoon_mobile_meshopt.gltf');
const sceneWebpDir = join(generatedDir, 'scene_textures_webp');

await convertSceneTexturesToWebp();
await addSceneWebpExtension(sceneMobilePath);
await addSceneWebpExtension(sceneMeshoptPath);

async function convertSceneTexturesToWebp() {
  const gltf = JSON.parse(await readFile(sceneMobilePath, 'utf8'));
  await mkdir(sceneWebpDir, { recursive: true });
  let converted = 0;

  for (const image of gltf.images ?? []) {
    if (!image.uri || image.uri.startsWith('data:')) {
      continue;
    }

    const sourcePath = join(dirname(sceneMobilePath), image.uri);
    if (!existsSync(sourcePath)) {
      continue;
    }

    const webpName = `${basename(image.uri, extname(image.uri))}.webp`;
    const webpPath = join(sceneWebpDir, webpName);
    await sharp(sourcePath)
      .rotate()
      .ensureAlpha()
      .webp({ quality: 74, effort: 4 })
      .toFile(webpPath);
    converted += 1;
  }

  console.log(`Wrote ${converted} scene WebP textures to ${sceneWebpDir}`);
}

async function addSceneWebpExtension(gltfPath) {
  if (!existsSync(gltfPath)) {
    return;
  }

  const gltf = JSON.parse(await readFile(gltfPath, 'utf8'));
  const webpImageIndexByOriginal = new Map();
  const originalImageCount = gltf.images?.length ?? 0;

  for (let imageIndex = 0; imageIndex < originalImageCount; imageIndex += 1) {
    const image = gltf.images[imageIndex];
    if (!image.uri || image.uri.startsWith('data:')) {
      continue;
    }

    const webpName = `${basename(image.uri, extname(image.uri))}.webp`;
    const webpPath = join(sceneWebpDir, webpName);
    if (!existsSync(webpPath)) {
      continue;
    }

    const webpUri = toPosix(relative(dirname(gltfPath), webpPath));
    webpImageIndexByOriginal.set(imageIndex, gltf.images.length);
    gltf.images.push({
      name: image.name ? `${image.name}_webp` : `${basename(image.uri, extname(image.uri))}_webp`,
      uri: webpUri,
      mimeType: 'image/webp',
    });
  }

  if (!webpImageIndexByOriginal.size) {
    await writeFile(gltfPath, `${JSON.stringify(gltf)}\n`);
    return;
  }

  gltf.extensionsUsed = unique([...(gltf.extensionsUsed ?? []), 'EXT_texture_webp']);
  for (const texture of gltf.textures ?? []) {
    const webpSource = webpImageIndexByOriginal.get(texture.source);
    if (webpSource === undefined) {
      continue;
    }

    texture.extensions = texture.extensions ?? {};
    texture.extensions.EXT_texture_webp = { source: webpSource };
  }

  await writeFile(gltfPath, `${JSON.stringify(gltf)}\n`);
  console.log(`Added EXT_texture_webp to ${gltfPath}`);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function toPosix(path) {
  return path.split('\\').join('/');
}
