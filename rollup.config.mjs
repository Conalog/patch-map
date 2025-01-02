import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import copy from 'rollup-plugin-copy';
import pkg from './package.json' assert { type: 'json' };

export default [
  {
    input: 'src/patch-map.ts',
    output: [
      {
        file: pkg.main,
        format: 'cjs',
        exportess: 'named',
      },
      {
        file: pkg.module,
        format: 'esm',
      },
    ],
    plugins: [
      resolve(),
      commonjs(),
      copy({
        targets: [{ src: 'src/**/*.svg', dest: 'dist/assets/icons' }],
      }),
      copy({
        targets: [
          { src: 'src/**/*.woff2', dest: 'dist/assets/fonts' },
          { src: 'src/assets/fonts/OFL-1.1.txt', dest: 'dist/assets/fonts' },
        ],
      }),
    ],
    external: (id) =>
      id === 'pixi.js' || id.endsWith('.svg') || id.endsWith('.woff2'),
  },
];
