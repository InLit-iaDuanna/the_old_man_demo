import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const root = new URL('../..', import.meta.url).pathname;
const sourcePath = join(root, 'models/Demo0620_1/Demo0620_1.gltf');
const sourceBinPath = join(root, 'models/Demo0620_1/Demo0620_1.bin');
const outputDir = join(root, 'web/generated');
const outputPath = join(outputDir, 'Demo0620_1_webtoon.gltf');
const outputBinPath = join(outputDir, 'Demo0620_1.bin');
const runtimeTexturePrefix = '../../models/Demo0620_1_runtime_512/';

const source = JSON.parse(await readFile(sourcePath, 'utf8'));

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

const usedTextureIndices = new Set();

for (const material of source.materials ?? []) {
  const pbr = material.pbrMetallicRoughness ?? {};
  if (pbr.baseColorTexture) {
    usedTextureIndices.add(pbr.baseColorTexture.index);
  }

  if (material.emissiveTexture) {
    usedTextureIndices.add(material.emissiveTexture.index);
  }

  delete material.normalTexture;
  delete material.occlusionTexture;
  delete material.pbrMetallicRoughness?.metallicRoughnessTexture;
  delete material.extensions?.KHR_materials_ior;
  delete material.extensions?.KHR_materials_specular;

  material.extensions = material.extensions ?? {};
  material.extensions.KHR_materials_unlit = {};
  material.pbrMetallicRoughness = material.pbrMetallicRoughness ?? {};
  material.pbrMetallicRoughness.metallicFactor = 0;
  material.pbrMetallicRoughness.roughnessFactor = 1;
}

const textureIndexMap = new Map();
const imageIndexMap = new Map();
const newTextures = [];
const newImages = [];
const newSamplers = source.samplers ? cloneJson(source.samplers) : undefined;

for (const textureIndex of usedTextureIndices) {
  const texture = source.textures?.[textureIndex];
  if (!texture) continue;
  const imageIndex = texture.source;
  const image = source.images?.[imageIndex];
  if (!image?.uri) continue;

  let mappedImageIndex = imageIndexMap.get(imageIndex);
  if (mappedImageIndex === undefined) {
    mappedImageIndex = newImages.length;
    imageIndexMap.set(imageIndex, mappedImageIndex);
    newImages.push({
      ...cloneJson(image),
      uri: `${runtimeTexturePrefix}${image.uri}`,
    });
  }

  textureIndexMap.set(textureIndex, newTextures.length);
  newTextures.push({
    ...cloneJson(texture),
    source: mappedImageIndex,
  });
}

for (const material of source.materials ?? []) {
  const pbr = material.pbrMetallicRoughness ?? {};
  if (pbr.baseColorTexture) {
    pbr.baseColorTexture.index = textureIndexMap.get(pbr.baseColorTexture.index) ?? pbr.baseColorTexture.index;
  }
  if (material.emissiveTexture) {
    material.emissiveTexture.index = textureIndexMap.get(material.emissiveTexture.index) ?? material.emissiveTexture.index;
  }
}

source.textures = newTextures;
source.images = newImages;
if (newSamplers) {
  source.samplers = newSamplers;
}

source.buffers = (source.buffers ?? []).map((buffer) => ({
  ...buffer,
  uri: 'Demo0620_1.bin',
}));

source.extensionsUsed = Array.from(
  new Set([...(source.extensionsUsed ?? []).filter((name) => ![
    'KHR_materials_ior',
    'KHR_materials_specular',
  ].includes(name)), 'KHR_materials_unlit']),
);

delete source.extensionsRequired;

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(source)}\n`);
await copyFile(sourceBinPath, outputBinPath);

console.log(`Wrote ${outputPath}`);
