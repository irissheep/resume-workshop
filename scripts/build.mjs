import { build } from 'esbuild';
import { build as viteBuild } from 'vite';
import { mkdir } from 'node:fs/promises';
await mkdir('dist/main', { recursive: true });
await Promise.all([
  build({ entryPoints: ['src/main/index.ts'], outfile: 'dist/main/main.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'], target: 'node24' }),
  build({ entryPoints: ['src/main/preload.ts'], outfile: 'dist/main/preload.cjs', bundle: true, platform: 'node', format: 'cjs', external: ['electron'], target: 'node24' }),
  viteBuild()
]);
