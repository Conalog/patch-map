# PATCH MAP

[English](./README.md)

`@conalog/patch-map`은 PATCH MAP v0.10 데이터를 렌더링하고 상호작용하는
PixiJS v8 기반 GPU 런타임입니다. 공식 생성 경로는 `PatchMap.mount()`입니다.

## 설치

```sh
npm install @conalog/patch-map pixi.js
```

## 기본 사용법

```ts
import { PatchMap } from '@conalog/patch-map';

const patchMap = await PatchMap.mount({
  container: '#map',
  data: [{
    type: 'item',
    id: 'rack-01',
    attrs: { x: 40, y: 32 },
    size: { width: 80, height: 120 },
    components: [{
      type: 'bar',
      id: 'usage',
      source: { type: 'rect', fill: '#2563eb', radius: 4 },
      size: { width: '72%', height: '65%' },
      placement: 'bottom',
      animation: true,
      animationDuration: 500,
    }],
  }],
  fit: { padding: 24 },
});

patchMap.update({
  id: 'rack-01',
  bar: { height: 82 },
});

await patchMap.destroy();
```

마운트는 기본 WebGL2를 포함해 선택된 rendering surface, 단일 frame loop,
호스트 크기 관찰, 최초 publication, 정리를 소유합니다. 입력 데이터는 분리되어
호출자 객체를 변경하지 않으며, 유효하지 않은 strict load와 mutation은 원자적으로 실패합니다.

## 문서

- [공개 문서 시작점](./docs/patch-map/README.md)
- [API 및 PATCH MAP 데이터](./docs/patch-map/api-and-dataset.md)
- [호스트 통합과 lifecycle 소유권](./docs/patch-map/host-integration.md)
- [마이그레이션](./docs/patch-map/migration.md)
- [호환성과 릴리스 정책](./docs/patch-map/compatibility.md)
- [문제 해결](./docs/patch-map/troubleshooting.md)
- [실행 가능한 예제](./examples/patch-map)

상세 공개 문서의 canonical owner는 위 영문 문서입니다. 한국어 문서는 일부만
번역된 두 번째 체계를 만들지 않고 이 quickstart만 유지합니다.

## 지원 범위

- 패키지 소비자 Node.js `>=20`
- PixiJS `>=8 <9`
- 프로덕션 backend는 WebGL2이며 WebGPU는 실험적입니다

정확한 브라우저·도구·semver 정책은
[호환성 문서](./docs/patch-map/compatibility.md)를 확인하세요.
