# Patchmap 문서 커버리지 체크리스트

이 문서는 현재 저장소 기준으로 어떤 기능이 어느 가이드에 설명되었는지 확인하는 최종 점검표다.

## 1. Patchmap 공개 API 커버리지

| API | 설명 위치 | 상태 |
| --- | --- | --- |
| `new Patchmap()` | `public-api.md`, `overview.md` | covered |
| `init(element, opts)` | `public-api.md`, `overview.md` | covered |
| `draw(data)` | `public-api.md`, `overview.md`, `data-model.md` | covered |
| `update(opts)` | `public-api.md`, `overview.md`, `data-model.md`, `history-and-transformer.md` | covered |
| `destroy()` | `public-api.md`, `overview.md` | covered |
| `focus(ids, opts)` | `public-api.md`, `overview.md`, `interactions.md` | covered |
| `fit(ids, opts)` | `public-api.md`, `overview.md`, `interactions.md` | covered |
| `selector(path, opts)` | `public-api.md`, `overview.md`, `interactions.md` | covered |
| `rotation` | `public-api.md`, `overview.md` | covered |
| `flip` | `public-api.md`, `overview.md` | covered |
| `event` facade | `public-api.md`, `overview.md`, `interactions.md` | covered |
| `app` / `viewport` / `world` / `theme` | `public-api.md`, `overview.md` | covered |
| `undoRedoManager` | `public-api.md`, `overview.md`, `history-and-transformer.md` | covered |
| `stateManager` | `public-api.md`, `overview.md`, `interactions.md` | covered |
| `transformer` | `public-api.md`, `overview.md`, `history-and-transformer.md` | covered |
| `animationContext` | `public-api.md` | covered |

## 2. 공개 export 커버리지

| Export | 설명 위치 | 상태 |
| --- | --- | --- |
| `Patchmap` | `overview.md` | covered |
| `Command` | `history-and-transformer.md` | covered |
| `UndoRedoManager` | `history-and-transformer.md` | covered |
| `State` | `interactions.md`, `overview.md` | covered |
| `PROPAGATE_EVENT` | `interactions.md` | covered |
| `Transformer` | `history-and-transformer.md`, `overview.md` | covered |
| `selector` | `overview.md`, `interactions.md` | covered |
| `convertLegacyData` | `data-model.md` | covered |
| `findIntersectObject` | `interactions.md` | covered |
| `isMoved` | `interactions.md` | covered |
| `intersectPoint` | `interactions.md` | covered |
| `uid` | `interactions.md` | covered |

## 3. README API 섹션 커버리지

| README 항목 | 설명 위치 | 상태 |
| --- | --- | --- |
| `init(el, options)` | `public-api.md`, `overview.md` | covered |
| `destroy()` | `public-api.md`, `overview.md` | covered |
| `draw(data)` | `public-api.md`, `overview.md`, `data-model.md` | covered |
| `update(options)` | `public-api.md`, `overview.md`, `data-model.md`, `history-and-transformer.md` | covered |
| `event` | `public-api.md`, `overview.md`, `interactions.md` | covered |
| `viewport` | `public-api.md`, `overview.md`, `interactions.md` | covered |
| `asset` | `public-api.md`, `overview.md` | covered |
| `focus(ids, opts)` | `public-api.md`, `overview.md`, `interactions.md` | covered |
| `fit(ids, options)` | `public-api.md`, `overview.md`, `interactions.md` | covered |
| `rotation` | `public-api.md`, `overview.md` | covered |
| `flip` | `public-api.md`, `overview.md` | covered |
| `selector(path)` | `public-api.md`, `overview.md`, `interactions.md` | covered |
| `stateManager` | `public-api.md`, `overview.md`, `interactions.md` | covered |
| `SelectionState` | `interactions.md` | covered |
| `Transformer` | `public-api.md`, `overview.md`, `history-and-transformer.md` | covered |
| `undoRedoManager` | `history-and-transformer.md` | covered |
| 이벤트 목록 | `overview.md`, `interactions.md`, `history-and-transformer.md` | covered |

## 4. 데이터 스키마 커버리지

| 영역 | 설명 위치 | 상태 |
| --- | --- | --- |
| 최상위 `MapData` 구조 | `data-model.md` | covered |
| 요소 타입 `group`, `grid`, `item`, `relations`, `image`, `text`, `rect` | `data-model.md` | covered |
| 컴포넌트 타입 `background`, `bar`, `icon`, `text` | `data-model.md` | covered |
| primitive 타입 `size`, `gap`, `margin`, `padding`, `placement`, `color`, `radius`, `calc()` | `data-model.md` | covered |
| 정규화 규칙 | `data-model.md` | covered |
| 레거시 변환 | `data-model.md` | covered |

## 5. 상호작용/상태 커버리지

| 영역 | 설명 위치 | 상태 |
| --- | --- | --- |
| `patchmap.event` | `interactions.md` | covered |
| viewport plugin 제어 | `interactions.md` | covered |
| `selector(path)` 규칙 | `interactions.md` | covered |
| `focus()` / `fit()` 타깃 해석 | `interactions.md` | covered |
| `StateManager` | `interactions.md` | covered |
| `SelectionState` | `interactions.md` | covered |
| 충돌 판정 / 선택 헬퍼 | `interactions.md` | covered |

## 6. 히스토리/트랜스포머 커버리지

| 영역 | 설명 위치 | 상태 |
| --- | --- | --- |
| `UndoRedoManager` 메서드와 이벤트 | `history-and-transformer.md` | covered |
| `historyId` 번들링 | `history-and-transformer.md` | covered |
| `Command` / `UpdateCommand` / `BundleCommand` | `history-and-transformer.md` | covered |
| `Transformer` 옵션과 bounds 모드 | `history-and-transformer.md` | covered |
| resize handle / resize history | `history-and-transformer.md` | covered |
| `patchmap.transformer` setter 동작 | `history-and-transformer.md` | covered |
| `update_elements` 이벤트 | `history-and-transformer.md` | covered |

## 7. 남은 확인 항목

- 리뷰 에이전트 피드백이 모두 반영되었는지 확인한다.
- `project-context` runtime shape checker를 다시 실행한다.
- 문서 파일들이 모두 `docs/reference/patchmap/` 아래에 존재하는지 확인한다.
- `public-api.md`만 읽어도 공개 메서드 옵션 표면이 추적 가능한지 다시 점검한다.
