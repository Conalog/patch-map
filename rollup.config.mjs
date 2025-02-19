import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import url from '@rollup/plugin-url';
import copy from 'rollup-plugin-copy';
import pkg from './package.json' assert { type: 'json' };

const EXTERNAL_PKGS = ['pixi.js', 'worker_threads', 'child_process', 'os'];

export default [
  {
    input: 'src/patch-map.ts',
    output: [
      {
        file: pkg.main,
        format: 'cjs',
        exports: 'named',
      },
      {
        file: pkg.module,
        format: 'esm',
      },
    ],
    plugins: [
      resolve(),
      commonjs(),
      url({
        include: ['**/*.svg', '**/*.woff2'],
        limit: Number.POSITIVE_INFINITY,
      }),
      copy({
        targets: [
          { src: 'src/assets/fonts/OFL-1.1.txt', dest: 'dist/assets/fonts' },
        ],
      }),
    ],
    external: (id) => {
      return EXTERNAL_PKGS.includes(id) || id.includes('?');
    },
  },
  {
    input: 'src/utils/worker/worker.js',
    output: [
      {
        dir: 'dist/utils/worker',
        format: 'esm',
        inlineDynamicImports: true,
      },
    ],
    plugins: [resolve(), commonjs()],
    external: (id) => {
      return id.includes('?');
    },
  },
];
