import { copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { NodeIO } from '@gltf-transform/core';
import {
  EXTMeshoptCompression,
  EXTTextureWebP,
  KHRLightsPunctual,
  KHRMaterialsEmissiveStrength,
  KHRMaterialsUnlit,
  KHRTextureTransform,
} from '@gltf-transform/extensions';
import { dedup, flatten, join as joinMeshes, meshopt, prune, reorder, simplify, textureCompress, unlit } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const root = new URL('..', import.meta.url).pathname;
const generatedDir = join(root, 'web/generated');
const sceneSourcePath = join(generatedDir, 'Demo0620_1_webtoon.gltf');
const sceneSourceBinPath = join(generatedDir, 'Demo0620_1.bin');
const sceneMobilePath = join(generatedDir, 'Demo0620_1_webtoon_mobile.gltf');
const sceneMobileBinPath = join(generatedDir, 'Demo0620_1_mobile.bin');
const sceneMeshoptPath = join(generatedDir, 'Demo0620_1_webtoon_mobile_meshopt.gltf');
const sceneMeshoptBinPath = join(generatedDir, 'Demo0620_1_mobile_meshopt.bin');
const assetManifestPath = join(generatedDir, 'asset-manifest.json');
const lodSourcePath = process.env.LOD_FBX
  ?? '/Users/isduanna/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_mikuncc9wuyq22_7875/msg/file/2026-06/Demo1_LOD.FBX';
const lodOutputPath = join(generatedDir, 'Demo1_LOD.glb');
const lodMobilePath = join(generatedDir, 'Demo1_LOD_mobile.gltf');
const lodMobileBinPath = join(generatedDir, 'Demo1_LOD_mobile.bin');
const lodMobileMaxBytes = 40 * 1024 * 1024;
const grandpaModelSources = [
  ['models/爷爷待机(1).glb', 'web/generated/grandpa/normal-idle.glb'],
  ['models/爷爷行走1(1).glb', 'web/generated/grandpa/normal-walk.glb'],
  ['models/爷爷风格化，待机.glb', 'web/generated/grandpa/stylized-idle.glb'],
  ['models/爷爷风格化，行走(1).glb', 'web/generated/grandpa/stylized-walk.glb'],
];
const grandpaModelOutputDir = join(generatedDir, 'grandpa');
const cloudPngSources = [
  'property/云/ChatGPT Image 2026年6月20日 16_59_35 (1).png',
  'property/云/ChatGPT Image 2026年6月20日 16_59_35 (2).png',
  'property/云/ChatGPT Image 2026年6月20日 16_59_35 (3).png',
  'property/云/ChatGPT Image 2026年6月20日 16_59_36 (4).png',
  'property/云/ChatGPT Image 2026年6月20日 16_59_36 (5).png',
];
const cloudPreprocessScript = join(root, 'scripts/preprocess-cloud-image.py');
const dialogueVoiceSources = [
  ['property/对话音/爷爷1.mp3', 'grandpa-1.mp3'],
  ['property/对话音/爷爷2.mp3', 'grandpa-2.mp3'],
  ['property/对话音/小满 (1).mp3', 'xiaoman-1.mp3'],
  ['property/对话音/小满 (2).mp3', 'xiaoman-2.mp3'],
];
const voiceOutputDir = join(generatedDir, 'voice');
const propertyOutputDir = join(generatedDir, 'property_mobile');
const schoolOutputDir = join(generatedDir, 'school_mobile');
const uiOutputDir = join(generatedDir, 'ui_mobile');
const uiControlSvgPath = join(root, 'UI/对话框、按键、任务提示.svg');

const manifest = {
  scene: {
    meshopt: '/web/generated/Demo0620_1_webtoon_mobile_meshopt.gltf',
    mobile: '/web/generated/Demo0620_1_webtoon_mobile.gltf',
    fallback: '/web/generated/Demo0620_1_webtoon.gltf',
  },
  lodMobile: existsSync(lodMobilePath) ? '/web/generated/Demo1_LOD_mobile.gltf' : null,
  property: {},
  school: {},
  ui: {},
};

await mkdir(generatedDir, { recursive: true });
await optimizeSceneGltf();
await optimizeSceneMeshopt();
await optimizeLodScene();
await copyGrandpaModels();
await processCloudTextures();
await copyDialogueVoices();
await optimizePropertyImages();
await optimizeSchoolImages();
await optimizeUiImages();
await writeFile(assetManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${assetManifestPath}`);

async function optimizeSceneGltf() {
  if (!existsSync(sceneSourcePath) || !existsSync(sceneSourceBinPath)) {
    console.warn('Scene runtime GLTF missing; run npm run generate first.');
    return;
  }

  const gltf = JSON.parse(await readFile(sceneSourcePath, 'utf8'));
  const sourceBin = await readFile(sceneSourceBinPath);
  const keepAttributes = new Set(['POSITION', 'NORMAL', 'TEXCOORD_0']);
  const keptAccessorIndices = new Set();
  const removedBadAttributes = sanitizeGltfPrimitiveAttributes(gltf);
  if (removedBadAttributes) {
    console.warn(`Removed ${removedBadAttributes} invalid scene primitive attributes.`);
  }

  for (const mesh of gltf.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const positionAccessor = gltf.accessors?.[primitive.attributes?.POSITION];
      const positionCount = positionAccessor?.count ?? 0;
      for (const [name, accessorIndex] of Object.entries(primitive.attributes ?? {})) {
        const accessor = gltf.accessors?.[accessorIndex];
        const hasMatchingVertexCount = name === 'POSITION'
          ? accessor?.count > 0
          : accessor?.count === positionCount && accessor?.count > 0;
        if (keepAttributes.has(name) && hasMatchingVertexCount) {
          keptAccessorIndices.add(accessorIndex);
        } else {
          delete primitive.attributes[name];
        }
      }
      if (primitive.indices !== undefined) {
        keptAccessorIndices.add(primitive.indices);
      }
    }
  }

  const accessorMap = new Map();
  const bufferViewMap = new Map();
  const newAccessors = [];
  const newBufferViews = [];
  const chunks = [];
  let byteOffset = 0;

  for (const accessorIndex of [...keptAccessorIndices].sort((a, b) => a - b)) {
    const accessor = gltf.accessors?.[accessorIndex];
    const bufferView = gltf.bufferViews?.[accessor?.bufferView];
    if (!accessor || !bufferView) {
      continue;
    }

    let mappedBufferView = bufferViewMap.get(accessor.bufferView);
    if (mappedBufferView === undefined) {
      const originalOffset = bufferView.byteOffset ?? 0;
      const originalLength = bufferView.byteLength;
      const padding = (4 - (byteOffset % 4)) % 4;
      if (padding) {
        chunks.push(Buffer.alloc(padding));
        byteOffset += padding;
      }

      const chunk = sourceBin.subarray(originalOffset, originalOffset + originalLength);
      mappedBufferView = newBufferViews.length;
      bufferViewMap.set(accessor.bufferView, mappedBufferView);
      newBufferViews.push({
        buffer: 0,
        byteOffset,
        byteLength: originalLength,
        target: bufferView.target,
        ...(bufferView.byteStride ? { byteStride: bufferView.byteStride } : {}),
      });
      chunks.push(chunk);
      byteOffset += originalLength;
    }

    accessorMap.set(accessorIndex, newAccessors.length);
    newAccessors.push({
      ...accessor,
      bufferView: mappedBufferView,
    });
  }

  for (const mesh of gltf.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      for (const [name, accessorIndex] of Object.entries(primitive.attributes ?? {})) {
        primitive.attributes[name] = accessorMap.get(accessorIndex);
      }
      if (primitive.indices !== undefined) {
        primitive.indices = accessorMap.get(primitive.indices);
      }
    }
  }

  gltf.accessors = newAccessors;
  gltf.bufferViews = newBufferViews;
  gltf.buffers = [{ byteLength: byteOffset, uri: 'Demo0620_1_mobile.bin' }];

  await writeFile(sceneMobileBinPath, Buffer.concat(chunks));
  await writeFile(sceneMobilePath, `${JSON.stringify(gltf)}\n`);
  console.log(`Wrote ${sceneMobilePath}`);
}

async function optimizeSceneMeshopt() {
  if (!existsSync(sceneMobilePath) || !existsSync(sceneMobileBinPath)) {
    console.warn('Mobile scene GLTF missing; skipping meshopt scene.');
    return;
  }

  await MeshoptEncoder.ready;
  const io = new NodeIO()
    .registerExtensions([
      EXTMeshoptCompression,
      EXTTextureWebP,
      KHRLightsPunctual,
      KHRMaterialsEmissiveStrength,
      KHRMaterialsUnlit,
      KHRTextureTransform,
    ])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

  const document = await io.read(sceneMobilePath);
  for (const buffer of document.getRoot().listBuffers()) {
    buffer.setURI(basename(sceneMeshoptBinPath));
  }
  await document.transform(
    dedup(),
    prune(),
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    prune(),
  );

  await io.write(sceneMeshoptPath, document);
  await stripMeshoptFallbackBuffer(sceneMeshoptPath);
  await run(process.execPath, [join(dirname(new URL(import.meta.url).pathname), 'postprocess-scene-webp.mjs')]);
  await preferWebpOnly(sceneMeshoptPath);
  await sanitizeGltfPrimitiveAttributesFile(sceneMeshoptPath);
  await assertGltfExternalResources(sceneMeshoptPath);
  console.log(`Wrote ${sceneMeshoptPath}`);
}

async function stripMeshoptFallbackBuffer(gltfPath) {
  const gltf = JSON.parse(await readFile(gltfPath, 'utf8'));
  if (!gltf.buffers?.length) {
    return;
  }

  const fallbackBufferIndex = gltf.buffers.findIndex((buffer) => buffer.extensions?.EXT_meshopt_compression?.fallback);
  if (fallbackBufferIndex < 0) {
    return;
  }

  const bufferMap = new Map();
  const nextBuffers = [];
  gltf.buffers.forEach((buffer, index) => {
    if (index === fallbackBufferIndex) {
      return;
    }
    bufferMap.set(index, nextBuffers.length);
    nextBuffers.push(buffer);
  });

  for (const bufferView of gltf.bufferViews ?? []) {
    if (bufferView.buffer === fallbackBufferIndex) {
      delete bufferView.buffer;
      delete bufferView.byteOffset;
      delete bufferView.byteLength;
      continue;
    }
    bufferView.buffer = bufferMap.get(bufferView.buffer) ?? bufferView.buffer;
  }

  gltf.buffers = nextBuffers;
  await writeFile(gltfPath, `${JSON.stringify(gltf)}\n`);
}

async function assertGltfExternalResources(gltfPath) {
  const gltf = JSON.parse(await readFile(gltfPath, 'utf8'));
  const missing = [];
  for (const buffer of gltf.buffers ?? []) {
    if (buffer.uri && !buffer.uri.startsWith('data:')) {
      const path = join(dirname(gltfPath), buffer.uri);
      if (!existsSync(path)) {
        missing.push(buffer.uri);
      }
    }
  }
  for (const image of gltf.images ?? []) {
    if (image.uri && !image.uri.startsWith('data:')) {
      const path = join(dirname(gltfPath), image.uri);
      if (!existsSync(path)) {
        missing.push(image.uri);
      }
    }
  }

  if (missing.length) {
    throw new Error(`${basename(gltfPath)} references missing resources: ${missing.slice(0, 8).join(', ')}`);
  }
}

async function preferWebpOnly(gltfPath) {
  const gltf = JSON.parse(await readFile(gltfPath, 'utf8'));
  if (!gltf.textures?.length || !gltf.images?.length) {
    return;
  }

  const usedImageIndices = new Set();
  for (const texture of gltf.textures) {
    const webpSource = texture.extensions?.EXT_texture_webp?.source;
    if (webpSource !== undefined) {
      texture.source = webpSource;
      delete texture.extensions.EXT_texture_webp;
      if (!Object.keys(texture.extensions).length) {
        delete texture.extensions;
      }
    }
    if (texture.source !== undefined) {
      usedImageIndices.add(texture.source);
    }
  }

  const imageMap = new Map();
  const images = [];
  gltf.images.forEach((image, index) => {
    if (!usedImageIndices.has(index)) {
      return;
    }
    imageMap.set(index, images.length);
    images.push(image);
  });

  for (const texture of gltf.textures) {
    if (texture.source !== undefined) {
      texture.source = imageMap.get(texture.source);
    }
  }

  gltf.images = images;
  gltf.extensionsUsed = (gltf.extensionsUsed ?? []).filter((extension) => extension !== 'EXT_texture_webp');
  if (!gltf.extensionsUsed.length) {
    delete gltf.extensionsUsed;
  }
  if (gltf.extensionsRequired) {
    gltf.extensionsRequired = gltf.extensionsRequired.filter((extension) => extension !== 'EXT_texture_webp');
    if (!gltf.extensionsRequired.length) {
      delete gltf.extensionsRequired;
    }
  }

  await writeFile(gltfPath, `${JSON.stringify(gltf)}\n`);
}

async function optimizeLodScene() {
  if (!existsSync(lodSourcePath)) {
    console.warn(`LOD FBX missing; skipping LOD scene: ${lodSourcePath}`);
    manifest.lodMobile = existsSync(lodMobilePath) ? '/web/generated/Demo1_LOD_mobile.gltf' : null;
    return;
  }

  try {
    const require = createRequire(import.meta.url);
    const convert = require('fbx2gltf');
    await convert(lodSourcePath, lodOutputPath, ['--khr-materials-unlit']);
    console.log(`Wrote ${lodOutputPath}`);
  } catch (error) {
    console.warn(`LOD FBX conversion failed; keeping existing LOD if present. ${error.message}`);
  }

  if (!existsSync(lodOutputPath)) {
    manifest.lodMobile = null;
    return;
  }

  try {
    await optimizeLodMobileGlb();
    const lodMobileBytes = await gltfExternalResourceBytes(lodMobilePath);
    if (lodMobileBytes <= lodMobileMaxBytes) {
      manifest.lodMobile = '/web/generated/Demo1_LOD_mobile.gltf';
    } else {
      manifest.lodMobile = null;
      console.warn(`Mobile LOD is still too large; runtime will skip it: ${formatBytes(lodMobileBytes)}`);
    }
  } catch (error) {
    manifest.lodMobile = null;
    console.warn(`Mobile LOD optimization failed; runtime will skip LOD. ${error.message}`);
  }
}

async function optimizeLodMobileGlb() {
  await MeshoptEncoder.ready;
  await MeshoptSimplifier.ready;
  const io = new NodeIO()
    .registerExtensions([
      EXTMeshoptCompression,
      EXTTextureWebP,
      KHRLightsPunctual,
      KHRMaterialsEmissiveStrength,
      KHRMaterialsUnlit,
      KHRTextureTransform,
    ])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

  const document = await io.read(lodOutputPath);
  stripPrimitiveAttributes(document, new Set(['POSITION', 'NORMAL', 'TEXCOORD_0']));
  for (const buffer of document.getRoot().listBuffers()) {
    buffer.setURI(basename(lodMobileBinPath));
  }

  try {
    await document.transform(unlit());
  } catch (error) {
    console.warn(`LOD unlit transform skipped. ${error.message}`);
  }

  await document.transform(
    dedup(),
    prune(),
    flatten(),
    joinMeshes({ keepNamed: false, cleanup: true }),
    simplify({ simplifier: MeshoptSimplifier, ratio: 0.42, error: 0.018, lockBorder: true }),
    dedup(),
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [512, 512],
      quality: 70,
      effort: 5,
    }),
    reorder({ encoder: MeshoptEncoder, target: 'size' }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
    prune(),
  );

  await io.write(lodMobilePath, document);
  await stripMeshoptFallbackBuffer(lodMobilePath);
  await sanitizeGltfPrimitiveAttributesFile(lodMobilePath);
  await assertGltfExternalResources(lodMobilePath);
  console.log(`Wrote ${lodMobilePath} (${formatBytes(await gltfExternalResourceBytes(lodMobilePath))})`);
}

async function sanitizeGltfPrimitiveAttributesFile(gltfPath) {
  const gltf = JSON.parse(await readFile(gltfPath, 'utf8'));
  const removed = sanitizeGltfPrimitiveAttributes(gltf);
  if (!removed) {
    return;
  }
  await writeFile(gltfPath, `${JSON.stringify(gltf)}\n`);
  console.warn(`Removed ${removed} invalid primitive attributes from ${basename(gltfPath)}.`);
}

function sanitizeGltfPrimitiveAttributes(gltf) {
  let removed = 0;

  for (const mesh of gltf.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const attributes = primitive.attributes ?? {};
      const position = gltf.accessors?.[attributes.POSITION];
      if (!position?.count) {
        continue;
      }

      for (const [semantic, accessorIndex] of Object.entries(attributes)) {
        if (semantic === 'POSITION') {
          continue;
        }

        const accessor = gltf.accessors?.[accessorIndex];
        if (!accessor || accessor.count !== position.count) {
          delete attributes[semantic];
          removed += 1;
        }
      }

      if (primitive.indices !== undefined && !gltf.accessors?.[primitive.indices]) {
        delete primitive.indices;
        removed += 1;
      }
    }
  }

  return removed;
}

function stripPrimitiveAttributes(document, keepAttributes) {
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const positionCount = primitive.getAttribute('POSITION')?.getCount() ?? 0;
      for (const semantic of primitive.listSemantics()) {
        const attribute = primitive.getAttribute(semantic);
        const hasMatchingVertexCount = semantic === 'POSITION'
          ? attribute?.getCount() > 0
          : attribute?.getCount() === positionCount && attribute?.getCount() > 0;
        if (!keepAttributes.has(semantic) || !hasMatchingVertexCount) {
          primitive.setAttribute(semantic, null);
        }
      }
    }
  }
}

async function gltfExternalResourceBytes(gltfPath) {
  const gltf = JSON.parse(await readFile(gltfPath, 'utf8'));
  const resources = new Set([gltfPath]);
  for (const buffer of gltf.buffers ?? []) {
    if (buffer.uri && !buffer.uri.startsWith('data:')) {
      resources.add(join(dirname(gltfPath), buffer.uri));
    }
  }
  for (const image of gltf.images ?? []) {
    if (image.uri && !image.uri.startsWith('data:')) {
      resources.add(join(dirname(gltfPath), image.uri));
    }
  }

  let bytes = 0;
  for (const resource of resources) {
    bytes += await fileSize(resource);
  }
  return bytes;
}

async function fileSize(path) {
  return (await stat(path)).size;
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)}KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

async function copyGrandpaModels() {
  // 双时期爷爷模型（正常 / 风格化）拷贝到 ASCII 路径，供运行时 GLTFLoader 加载，
  // 避免中文文件名的 URL 编码问题。
  await mkdir(grandpaModelOutputDir, { recursive: true });
  for (const [relativeSource, destination] of grandpaModelSources) {
    const source = join(root, relativeSource);
    if (!existsSync(source)) {
      console.warn(`Grandpa model missing; skipping: ${relativeSource}`);
      continue;
    }
    await copyFile(source, join(root, destination));
    console.log(`Wrote ${destination}`);
  }
}

async function processCloudTextures() {
  // 把 property/云 的不透明 PNG 抠成透明软边云贴图，覆盖 cloud-1..5.png（世界空间 Sprite）。
  if (!existsSync(cloudPreprocessScript)) {
    console.warn('Cloud preprocess script missing; skipping cloud textures.');
    return;
  }
  for (let index = 0; index < cloudPngSources.length; index += 1) {
    const source = join(root, cloudPngSources[index]);
    if (!existsSync(source)) {
      console.warn(`Cloud source missing; skipping: ${cloudPngSources[index]}`);
      continue;
    }
    const destination = join(generatedDir, `cloud-${index + 1}.png`);
    await run('python3', [cloudPreprocessScript, source, destination, '768']);
  }
}

async function copyDialogueVoices() {
  // 对话音碎片拷到 ASCII 路径，供 DialogueVoicePlayer 随机组合播放。
  await mkdir(voiceOutputDir, { recursive: true });
  for (const [relativeSource, name] of dialogueVoiceSources) {
    const source = join(root, relativeSource);
    if (!existsSync(source)) {
      console.warn(`Voice source missing; skipping: ${relativeSource}`);
      continue;
    }
    await copyFile(source, join(voiceOutputDir, name));
    console.log(`Wrote voice/${name}`);
  }
}

async function optimizePropertyImages() {
  const images = [
    ['bag_now', 'property/bag_now/ChatGPT Image 2026年6月20日 18_48_49.png'],
    ['bag_past', 'property/bag_past/ChatGPT Image 2026年6月20日 18_44_38.png'],
    ['mail_now', 'property/mail_now/ChatGPT Image 2026年6月20日 18_40_25 (4).png'],
    ['mail_past', 'property/mail_past/ChatGPT Image 2026年6月20日 18_42_34 (4).png'],
    ['key_now_1', 'property/key_now/1.png'],
    ['key_now_2', 'property/key_now/2.png'],
    ['key_now_3', 'property/key_now/3.png'],
    ['key_past_1', 'property/key_past/1.png'],
    ['key_past_2', 'property/key_past/2.png'],
    ['key_past_3', 'property/key_past/3.png'],
  ];

  await mkdir(propertyOutputDir, { recursive: true });
  for (const [key, relativeSource] of images) {
    const source = join(root, relativeSource);
    const pngTarget = join(propertyOutputDir, `${key}.png`);
    const webpTarget = join(propertyOutputDir, `${key}.webp`);
    if (!existsSync(source)) {
      continue;
    }

    try {
      await run('python3', [
        join(dirname(new URL(import.meta.url).pathname), 'preprocess-property-image.py'),
        source,
        pngTarget,
      ]);
      await sharp(pngTarget)
        .webp({ quality: 78, effort: 5 })
        .toFile(webpTarget);
    } catch (error) {
      console.warn(`Property image preprocessing failed for ${relativeSource}; copying source.`, error.message);
      await copyFile(source, pngTarget);
      await sharp(source)
        .resize({ width: 768, height: 768, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 78, effort: 5 })
        .toFile(webpTarget);
    }

    manifest.property[key] = {
      webp: `/web/generated/property_mobile/${key}.webp`,
      png: `/web/generated/property_mobile/${key}.png`,
    };
  }
  console.log(`Wrote ${propertyOutputDir}`);
}

async function optimizeSchoolImages() {
  const images = [
    ['board', 'property/school/school-sort-board.jpg'],
    ['letter', 'property/school/32b625e7d81337e88fafbdc3ac41243a.jpg'],
    ['ride', 'property/school/8bcc6ac10847a1bb8147944bc138f38d.jpg'],
    ['cry', 'property/school/99ec07146e601e27941cdee552f372cd.png'],
    ['hug', 'property/school/ef754f79cb7b4ee26e1f10b4bdd0555d.jpg'],
  ];

  await mkdir(schoolOutputDir, { recursive: true });
  for (const [key, relativeSource] of images) {
    const source = join(root, relativeSource);
    if (!existsSync(source)) {
      continue;
    }

    const webpTarget = join(schoolOutputDir, `${key}.webp`);
    const jpegTarget = join(schoolOutputDir, `${key}.jpg`);
    const maxWidth = key === 'board' ? 768 : 512;
    await sharp(source)
      .resize({ width: maxWidth, height: maxWidth, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: key === 'board' ? 76 : 78, effort: 5 })
      .toFile(webpTarget);
    await sharp(source)
      .resize({ width: maxWidth, height: maxWidth, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: key === 'board' ? 78 : 80, mozjpeg: true })
      .toFile(jpegTarget);

    manifest.school[key] = {
      webp: `/web/generated/school_mobile/${key}.webp`,
      fallback: `/web/generated/school_mobile/${key}.jpg`,
    };
  }
  console.log(`Wrote ${schoolOutputDir}`);
}

async function optimizeUiImages() {
  const assets = [
    'mail-icon.png',
    'memory-1-icon.png',
    'memory-2-icon.png',
    'pause-button.png',
    'settings-button.png',
    'camera-button.png',
    'skip-button.png',
    'paperclip.png',
    'task-toast-panel.png',
    'dialog-panel.png',
    'letter-grandpa.png',
    'memory-1-card.png',
    'memory-2-1-card.png',
    'memory-2-2-card.png',
    'memory-2-3-card.png',
  ];

  await run('python3', [
    join(dirname(new URL(import.meta.url).pathname), 'preprocess-ui-assets.py'),
  ]);
  const svgButtonAssets = await extractSvgUiButtons();

  for (const name of assets) {
    const target = join(uiOutputDir, name);
    if (!existsSync(target)) {
      continue;
    }

    const key = basename(name, extname(name)).replace(/-([a-z0-9])/g, (_, char) => char.toUpperCase());
    manifest.ui[key] = `/web/generated/ui_mobile/${name}`;
  }

  if (svgButtonAssets.length) {
    console.log(`Wrote ${svgButtonAssets.length} SVG-derived UI assets to ${uiOutputDir}`);
    for (const name of svgButtonAssets) {
      console.log(`- ${name}`);
    }
  }
}

async function extractSvgUiButtons() {
  if (!existsSync(uiControlSvgPath)) {
    console.warn('UI control SVG missing; skipping SVG button extraction.');
    return [];
  }

  await mkdir(uiOutputDir, { recursive: true });
  const crops = [
    ['pause-button.png', { left: 430, top: 28, width: 79, height: 83 }],
    ['settings-button.png', { left: 430, top: 114, width: 79, height: 83 }],
    ['camera-button.png', { left: 430, top: 205, width: 79, height: 83 }],
    ['skip-button.png', { left: 430, top: 288, width: 82, height: 94 }],
    ['paperclip.png', { left: 417, top: 830, width: 53, height: 94 }],
    ['task-toast-panel.png', { left: 0, top: 186, width: 420, height: 64 }],
    ['dialog-panel.png', { left: 34, top: 694, width: 452, height: 192 }],
  ];

  await Promise.all(crops.map(([name, crop]) => (
    sharp(uiControlSvgPath, { density: 72 })
      .extract(crop)
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(join(uiOutputDir, name))
  )));
  return crops.map(([name]) => name);
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with ${code}`));
      }
    });
  });
}
