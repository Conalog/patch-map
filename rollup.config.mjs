import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import url from '@rollup/plugin-url';
import copy from 'rollup-plugin-copy';
import { dts } from 'rollup-plugin-dts';
import pkg from './package.json' with { type: 'json' };

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
      {
        file: pkg.umd,
        format: 'umd',
        name: 'Patchmap',
        inlineDynamicImports: true,
        globals: {
          'pixi.js': 'PIXI',
          nanoid: 'nanoid$1',
          vm: 'vm',
        },
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
    external: ['pixi.js', 'nanoid', 'vm'],
  },
  {
    input: 'dist/types/patch-map.d.ts',
    output: [
      {
        file: pkg.types,
        format: 'es',
      },
      {
        file: 'dist/index.d.cts',
        format: 'es',
      },
    ],
    plugins: [dts()],
  },
];
