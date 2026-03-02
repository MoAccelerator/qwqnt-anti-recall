import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { builtinModules } from 'node:module';
import viteCp from 'vite-plugin-cp';
import viteOxlint from 'unplugin-oxlint/vite';
import viteZipPack from 'unplugin-zip-pack/vite';
import Plugin from './package.json';

const SRC_DIR = resolve(__dirname, './src');
const OUTPUT_DIR = resolve(__dirname, './dist');

const external = ['electron', ...builtinModules.flatMap(m => [m, `node:${m}`])];
const runtimeExternal = ['level-party'];

const BaseConfig = defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@': SRC_DIR,
    },
  },
});

const configs = {
  main: defineConfig({
    ...BaseConfig,

    plugins: [
      viteOxlint({
        includes: ['src/**/*.js', 'src/**/*.ts'],
        fix: true,
      }),
    ],
    build: {
      minify: true,
      ssr: true,
      outDir: resolve(OUTPUT_DIR, './main'),
      lib: {
        entry: resolve(SRC_DIR, './main/index.ts'),
        formats: [ 'cjs' ],

        fileName: () => 'index.cjs',
      },
      rollupOptions: {
        external: [...external, ...runtimeExternal],
      },
      target: 'node23',
    },
    esbuild: {
      platform: 'node',
    },
  }),
  preload: defineConfig({
    ...BaseConfig,

    plugins: [
      viteOxlint({
        includes: ['src/**/*.js', 'src/**/*.ts'],
        fix: true,
      }),
    ],
    build: {
      minify: true,
      outDir: resolve(OUTPUT_DIR, './preload'),
      lib: {
        entry: resolve(SRC_DIR, './preload/index.ts'),
        formats: [ 'cjs' ],

        fileName: () => 'index.cjs',
      },
      rollupOptions: {
        external,
      },
    },
  }),
  renderer: defineConfig({
    ...BaseConfig,

    plugins: [
      viteOxlint({
        includes: ['src/**/*.js', 'src/**/*.ts'],
        fix: true,
      }),
      viteCp({
        targets: [{ src: './package.json', dest: 'dist' }],
      }),
      viteZipPack({
        in: OUTPUT_DIR,
        out: resolve(__dirname, `./${Plugin.name}.zip`),
      }),
    ],
    build: {
      minify: true,
      outDir: resolve(OUTPUT_DIR, './renderer'),
      lib: {
        entry: resolve(SRC_DIR, './renderer/index.ts'),
        formats: [ 'es' ],
        fileName: () => 'index.js',
      },
      rollupOptions: {
        input: resolve(SRC_DIR, './renderer/index.ts'),
        external,
      },
    },
  }),
};

export default defineConfig(({ mode }) => configs[mode as keyof typeof configs]);