# PATCH MAP

[English](./README.md)

`@conalog/patch-map`은 PATCH MAP v0.10 데이터셋을 위한 PixiJS v8 GPU
렌더러·인터랙션 런타임입니다. 권위 데이터는 dense store에 보관하고,
소수의 aggregate scene graph로 렌더링합니다. viewport, 선택, history,
asset, 화면 추출, lifecycle 정리까지 라이브러리가 직접 소유합니다.

## 설치

```sh
npm install @conalog/patch-map pixi.js
```

## 기본 사용법

```ts
import { PatchMap } from '@conalog/patch-map';

const data = [{
  type: 'item',
  id: 'rack-01',
  attrs: { x: 40, y: 32 },
  size: { width: 80, height: 120 },
  components: [
    {
      type: 'background',
      id: 'frame',
      source: { type: 'rect', fill: '#e2e8f0', radius: 6 },
    },
    {
      type: 'bar',
      id: 'usage',
      source: { type: 'rect', fill: '#2563eb', radius: 4 },
      size: { width: '72%', height: '65%' },
      placement: 'bottom',
      animation: true,
      animationDuration: 500,
    },
    {
      type: 'text',
      id: 'label',
      text: '65',
      placement: 'top',
      style: { fontSize: 14, fill: '#0f172a' },
    },
  ],
}];

const patchMap = await PatchMap.mount({
  container: '#map',
  data,
  fit: { padding: 24 },
});

patchMap.update({
  id: 'rack-01',
  bar: { height: 82 },
});

// 화면에서 제거할 때
await patchMap.destroy();
```

`mount()`는 production 기준인 WebGL2 Mesh renderer, 단 하나의 animation
frame loop, host 크기 관찰, 최초 fit을 자동으로 소유합니다. `destroy()`만
호출하면 이 자원도 함께 정리됩니다. `backend: 'webgpu'`는 실험 세션을
명시적으로 실행할 때만 사용하세요.

grid instance를 반복 갱신할 때는 JSONPath나 갱신마다 scene scan을 쓰지
않고 semantic target set을 한 번 조회해 재사용할 수 있습니다.

```ts
const usageBars = patchMap.targets.query({
  within: 'rack-grid',
  componentId: 'usage',
  type: 'bar',
  scope: 'instances',
});

patchMap.updateBatch({
  targets: usageBars,
  bar: {
    height: new Float32Array(usageBars.count).fill(75),
  },
}, { animate: true });
```

입력 객체는 내부 데이터와 분리되며 수정되지 않습니다. element ID와
component의 owner/ID identity가 유지됩니다. strict load와 mutation 오류는
부분 적용 없이 원자적으로 실패합니다.

## 지원 범위

- Node.js: 패키지 소비자는 `>=20`, 저장소 CI는 Node.js 22
- WebGL2: production 기준선
- WebGPU: experimental
- WebGL1·Canvas fallback: 미지원
- PixiJS peer dependency: `>=8 <9`

자세한 내용은 [제품 문서](./docs/patch-map/README.md), 배포에 포함되는
[예제](./examples/patch-map), `npm run lab`으로 실행하는 조작형 Lab에서
확인할 수 있습니다.

기존 host integration을 교체하는 경우에는 engine, frame loop, 저장,
teardown 경로를 바꾸기 전에 [마이그레이션 가이드](./docs/patch-map/migration.md)를
먼저 확인하세요.

## 개발 검증

Node.js 22(`.nvmrc`, 패키지 최소 20)에서 `npm ci`로 잠긴 의존성을 설치합니다. 변경 위험별
검증 범위는 [CONTRIBUTING.md](./CONTRIBUTING.md)를 참고하세요.

```sh
npm run typecheck
npm run lint
npm run unit
npm run build
npm run verify:contract
```

이 브랜치에서는 버전을 `0.10.0`으로 유지합니다. 배포 버전은 merge 후
올립니다.
