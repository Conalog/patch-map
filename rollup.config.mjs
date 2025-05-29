import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import url from '@rollup/plugin-url';
import copy from 'rollup-plugin-copy';
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
    external: ['pixi.js'],
  },
];
