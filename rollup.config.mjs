import commonjs from '@rollup/plugin-commonjs';
import resolve from '@rollup/plugin-node-resolve';
import pkg from './package.json' assert { type: 'json' };

export default [
  {
    input: 'src/patch-map.ts', // 진입점 파일
    output: [
      {
        file: pkg.main,
        format: 'cjs', // CommonJS 형식
      },
      {
        file: pkg.module,
        format: 'esm', // ES Module 형식
      },
    ],
    plugins: [resolve(), commonjs()],
    external: ['pixi.js'], // 외부 종속성
  },
];
