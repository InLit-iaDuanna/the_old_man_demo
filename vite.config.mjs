import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

function copyGeneratedRuntimeAssets() {
  const source = resolve('web/generated');
  const target = resolve('dist/web/generated');
  const styledTextureSource = resolve('models/Demo0620_1_runtime_512');
  const styledTextureTarget = resolve('dist/models/Demo0620_1_runtime_512');

  return {
    name: 'copy-generated-runtime-assets',
    apply: 'build',
    async closeBundle() {
      await rm(resolve('dist/web'), { recursive: true, force: true });
      await rm(resolve('dist/models'), { recursive: true, force: true });
      if (!existsSync(source)) {
        return;
      }
      await rm(target, { recursive: true, force: true });
      await cp(source, target, { recursive: true });
      await removeGeneratedScratch(target);
      if (existsSync(styledTextureSource)) {
        await mkdir(resolve('dist/models'), { recursive: true });
        await cp(styledTextureSource, styledTextureTarget, { recursive: true });
      }
    },
  };
}

async function removeGeneratedScratch(target) {
  await Promise.all([
    rm(resolve(target, 'Demo1_LOD.glb'), { force: true }),
    rm(resolve(target, 'grandpa_mobile.glb'), { force: true }),
    rm(resolve(target, 'tmp_lite.gltf'), { force: true }),
    rm(resolve(target, 'tmp_lite.bin'), { force: true }),
    rm(resolve(target, 'tmp_lite_r01.gltf'), { force: true }),
    rm(resolve(target, 'tmp_lite_r01.bin'), { force: true }),
    rm(resolve(target, 'tmp_lite_r02.gltf'), { force: true }),
    rm(resolve(target, 'tmp_lite_r02.bin'), { force: true }),
    rm(resolve(target, 'tmp_lod_r008.gltf'), { force: true }),
    rm(resolve(target, 'tmp_lod_r008.bin'), { force: true }),
    rm(resolve(target, 'tmp_lod_r014.gltf'), { force: true }),
    rm(resolve(target, 'tmp_lod_r014.bin'), { force: true }),
    rm(resolve(target, 'tmp_notex.gltf'), { force: true }),
    rm(resolve(target, 'tmp_notex.bin'), { force: true }),
  ]);
}

export default defineConfig({
  plugins: [copyGeneratedRuntimeAssets()],
  build: {
    assetsInlineLimit: 0,
  },
});
