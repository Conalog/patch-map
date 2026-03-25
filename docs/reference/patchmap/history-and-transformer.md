# Patchmap history / transformer 가이드

이 문서는 현재 구현 기준으로 `history`와 `transformer`의 동작만 정리한다. 설명 근거는 `src/command/**`, `src/transformer/**`, `src/patchmap.js`, `src/utils/get.js`, `src/utils/bounds.js`, `src/utils/viewport.js`, 그리고 README의 해당 섹션이다.

## 1. UndoRedoManager 모델

`UndoRedoManager`는 명령 스택과 현재 위치를 따로 관리한다.

- 스택은 내부 배열 `commands`와 현재 인덱스 `index`로 구성된다.
- `commands` getter는 내부 배열의 복사본을 돌려준다.
- 기본 최대 저장 개수는 50개다.
- 새 명령을 실행하면 현재 인덱스 뒤의 redo 스택은 잘린다.

### `execute(command, options)`

`execute()`는 다음 순서로 동작한다.

1. `command.execute()`를 먼저 호출한다.
2. 현재 redo 스택을 제거한다.
3. `options.historyId`가 있으면 같은 `historyId`를 가진 직전 명령과 묶을 수 있는지 검사한다.
4. 같은 `historyId`가 연속으로 들어오면 기존 `BundleCommand`에 추가하거나, 단일 명령을 `BundleCommand`로 바꾼다.
5. 같은 `historyId`가 아니면 새 항목으로 스택에 넣는다.

중요한 점은 `historyId`가 같아도 **연속된 명령**일 때만 하나의 undo/redo 단계로 묶인다는 것이다. 중간에 다른 history가 끼면 새 번들이 시작된다.

### `undo()`, `redo()`

- `undo()`는 현재 인덱스의 명령에 대해 `undo()`를 호출한 뒤 인덱스를 하나 내린다.
- `redo()`는 인덱스를 먼저 올린 뒤 해당 명령의 `execute()`를 다시 호출한다.
- 둘 다 가능 여부는 `canUndo()`, `canRedo()`로 확인한다.

### `clear()`, `destroy()`

- `clear()`는 명령 스택을 비우고 인덱스를 `-1`로 되돌린다.
- `destroy()`는 키보드 단축키 리스너를 제거하고 `clear()`를 호출한 뒤, 모든 리스너를 해제한다.
- `destroy()`는 `history:destroyed`를 emit한다.

### 핫키

핫키는 `Patchmap.init()`에서 `undoRedoManager._setHotkeys()`를 호출할 때만 등록된다. 즉, `UndoRedoManager`를 단독으로 만든다고 자동 연결되지는 않는다.

현재 단축키는 다음과 같다.

- `Ctrl/Cmd + Z`: undo
- `Ctrl/Cmd + Shift + Z`: redo
- `Ctrl/Cmd + Y`: redo

편집 가능한 요소 필터링은 넓지 않다. 현재 구현의 `isInput()`은 `element.type === 'text'`, `element.tagName === 'INPUT'`, `element.type === 'textarea'`, `element.type === 'SELECT'`만 검사한다. 즉 일반적인 모든 editable target을 포괄한다고 보면 안 된다.

## 2. Command / UpdateCommand / BundleCommand

### `Command`

`Command`는 추상 베이스다.

- 생성 시 `id`를 받는다.
- `execute()`와 `undo()`는 서브클래스가 구현해야 한다.
- 구현하지 않으면 에러를 던진다.

### `UpdateCommand`

`UpdateCommand`는 공개 API로 직접 생성하는 타입이 아니라, `element.apply(..., { historyId })` 경로에서 내부적으로 만들어진다.

- 생성 시 대상 element, changes, options를 저장한다.
- `previousProps`를 미리 캡처한다.
- `execute()`는 현재 element에 변경사항을 적용한다.
- `undo()`는 캡처해 둔 이전 상태를 `mergeStrategy: 'replace'`로 복원한다.
- undo 중에는 `historyId: false`로 다시 history 기록이 쌓이지 않게 막는다.

부분 `attrs` 업데이트를 undo할 때는, 원래 props에 없던 attr 값도 element의 raw 값에서 채워 넣는다. 그래서 `attrs.x`만 바꾼 경우에도 나머지 `attrs`와 원래 인스턴스 값이 유지된다.

### `BundleCommand`

`BundleCommand`는 여러 명령을 하나로 묶는 래퍼다.

- `execute()`는 안에 든 명령을 앞에서부터 순서대로 실행한다.
- `undo()`는 뒤에서부터 역순으로 되돌린다.
- `addCommand()`는 새 명령을 배열 끝에 추가한다.

실사용 관점에서는 사용자가 직접 다루기보다 `UndoRedoManager`가 같은 `historyId`를 묶기 위해 내부적으로 만든다고 보는 편이 맞다.

### 공개 사용 패턴

현재 공개적으로 history를 여는 대표 경로는 `patchmap.update({ history })`다.

- `history: true`는 호출마다 새 `historyId`를 만든다.
- `history: 'same-id'`처럼 문자열을 넘기면 같은 문자열이 같은 히스토리 단위가 된다.

즉, 여러 `update()` 호출을 한 단계로 묶고 싶다면 `true`가 아니라 **같은 문자열**을 직접 넘겨야 한다.

## 3. Transformer 목적과 옵션

`Transformer`는 선택된 요소의 bounds를 시각화하고, 현재 구현에서는 리사이즈를 제공하는 시각적 도구다. 현재 코드 기준으로는 회전 핸들은 없다.

생성 시 옵션은 아래와 같다.

- `elements`: 초기 선택 요소 배열
- `wireframeStyle`: 윤곽선 스타일
- `boundsDisplayMode`: bounds 표시 모드
- `resizeHandles`: group bounds 리사이즈 핸들 표시 여부
- `resizeHistory`: 리사이즈 변경을 history에 기록할지 여부

기본값은 다음과 같다.

- `wireframeStyle.thickness = 1.5`
- `wireframeStyle.color = '#1099FF'`
- `boundsDisplayMode = 'all'`
- `resizeHandles = false`
- `resizeHistory = false`

설정 객체는 생성 시 검증된다. 잘못된 타입이 들어오면 생성 단계에서 예외가 난다.

### SelectionModel 표면

`Transformer`는 내부에 `SelectionModel`을 가진다.

- `transformer.selection`은 선택 모델 인스턴스를 돌려준다.
- `transformer.elements`는 `selection.elements`의 편의 getter다.
- `transformer.elements = value`는 `selection.set(value)`로 이어진다.
- `selection`은 `add()`, `remove()`, `set()`, `destroy()`를 가진다.

`SelectionModel.elements` getter는 복사본을 반환하므로, 반환 배열을 직접 수정해도 선택 상태는 바뀌지 않는다.

선택이 바뀌면 `SelectionModel`이 `update`를 emit하고, `Transformer`는 이를 받아 redraw를 예약한 뒤 `update_elements`를 emit한다.

또한 `Transformer`는 viewport에 추가된 뒤 `zoomed`, `zoomed-end` 이벤트를 구독한다. 그래서 확대/축소나 flip처럼 viewport scale이 바뀌면 redraw를 예약하고, 선 두께와 핸들 크기를 현재 절대 scale 기준으로 다시 계산한다. 음수 scale(`flip`)에서도 `getSafeViewportScale()`로 절대값을 써서 시각 두께를 안정적으로 유지한다.

## 4. Bounds 표시 모드와 리사이즈 핸들

`boundsDisplayMode`는 다음 네 가지다.

- `all`: 개별 element bounds와 group bounds를 함께 보여준다.
- `groupOnly`: group bounds만 보여준다.
- `elementOnly`: 개별 element bounds를 보여준다.
- `none`: bounds를 숨긴다.

주의할 점은 화면에 보이는 "group bounds"가 두 종류라는 점이다.

- wireframe의 group bounds는 **현재 선택된 모든 요소**를 합쳐 axis-aligned bounds로 그린다.
- resize frame과 handle은 **resizable + unlocked 요소만 추린 subset**으로 viewport 좌표계에서 따로 계산한다.

그래서 회전된 선택이나 잠긴 요소가 섞인 선택에서는, 보이는 외곽선과 실제 리사이즈 핸들 프레임이 완전히 같은 집합/기하를 쓰지 않을 수 있다. `resizeHandles`가 `true`일 때는 이 resize frame을 위해 group bounds가 추가로 그려질 수 있고, `boundsDisplayMode = 'none'`일 때만 핸들도 함께 완전히 숨는다.

리사이즈 UI는 두 층으로 나뉜다.

- 실제로 보이는 corner handle 4개
- 클릭 가능한 edge hit target 4개

모두 `ResizeHandleLayer`가 lazy 생성하며, corner는 핸들로 보이고 edge는 거의 투명한 hit area로만 쓰인다.

리사이즈는 다음 규칙을 따른다.

- 선택 요소 중 리사이즈 가능한 요소만 대상이 된다.
- locked이거나 리사이즈 불가인 요소는 제외된다.
- 드래그 중 `Shift`를 누르면 aspect ratio가 유지된다.
- `resizeHandles = false`로 바꾸면 현재 핸들을 지우고 진행 중인 resize gesture도 종료한다.

`resizeHistory = true`이면 한 번의 drag gesture에 대해 하나의 `historyId`를 만들어, 그 제스처에서 적용된 모든 element 변경이 같은 undo 단계로 묶인다.

## 5. `patchmap.transformer` setter

`Patchmap`의 `transformer` setter는 현재 인스턴스를 교체하는 역할을 한다.

- 기존 transformer가 살아 있으면 먼저 `viewport`의 `object_transformed` 리스너를 제거한다.
- 이어서 기존 transformer를 `destroy(true)`로 정리한다.
- 새 값이 `Transformer` 인스턴스가 아니면 console error를 남기고 내부 참조를 `null`로 둔다.
- 유효한 인스턴스면 `viewport.addChild()`로 붙이고 `object_transformed`를 `transformer.update`에 연결한다.

즉, setter는 단순 참조 교체가 아니라 **기존 인스턴스의 teardown까지 포함**한다.

`Patchmap.init()`에서 `opts.transformer`를 넘기면 이 setter를 통해 연결된다.

## 6. 관련 이벤트

history/transformer 사용자 입장에서 직접 볼 수 있는 이벤트는 아래가 핵심이다.

### `UndoRedoManager`

- `history:executed`
- `history:undone`
- `history:redone`
- `history:cleared`
- `history:destroyed`
- `history:*`

각 history 이벤트는 일반 이벤트와 함께 namespace wildcard에도 걸린다. `history:*`를 구독하면 `namespace`와 `type`이 보강된 payload를 받을 수 있다.

### `Transformer`

- `update_elements`

이 이벤트는 `selection.elements`가 바뀌었을 때와 resize drag 중에 emit된다. payload는 `target`, `current`, `added`, `removed`를 포함한다.

### 주변 이벤트

- `patchmap:initialized`
- `patchmap:destroyed`

이 둘은 transformer를 붙이거나 떼는 생명주기와 직접 맞닿아 있다.

중요한 caveat 하나는, resize drag는 `element.apply()`를 직접 호출하므로 `patchmap.update()` 경로를 타지 않는다. 따라서 resize가 곧바로 `patchmap:updated`로 이어지지는 않는다.

## 7. 실무 예시

### 7-1. history가 있는 update

```js
patchmap.update({
  path: '$..[?(@.id=="item-1")]',
  changes: { attrs: { x: 200 } },
  history: true,
});

patchmap.undoRedoManager.undo();
patchmap.undoRedoManager.redo();
```

`history: true`는 호출마다 고유 id를 새로 만든다. 여러 호출을 한 단계로 묶고 싶으면 같은 문자열을 직접 넘겨야 한다.

### 7-2. transformer 연결

```js
import { Patchmap, Transformer } from '@conalog/patch-map';

const patchmap = new Patchmap();
await patchmap.init(document.body);
patchmap.draw([
  {
    type: 'item',
    id: 'group-1',
    size: 80,
  },
]);

patchmap.transformer = new Transformer({
  elements: [patchmap.selector('$..[?(@.id=="group-1")]')[0]],
  resizeHandles: true,
  resizeHistory: true,
});
```

### 7-3. selection 변경 감지

```js
patchmap.transformer.on('update_elements', ({ current, added, removed }) => {
  console.log({ current, added, removed });
});
```

## 8. 주의할 점

- `UndoRedoManager.commands`는 복사본이라 직접 수정해도 내부 히스토리는 바뀌지 않는다.
- `patchmap.draw()`는 렌더링 전에 `undoRedoManager.clear()`를 호출하므로, 새 데이터를 다시 그리면 기존 history는 사라진다.
- `Transformer`는 `boundsDisplayMode = 'none'`일 때 핸들도 숨긴다.
- 리사이즈 대상은 항상 resizable candidate만 남는다.
- `patchmap.transformer`를 다시 대입하면 기존 transformer는 destroy된다.
- resize history는 `resizeHistory`를 켜야만 붙는다.
- `update_elements`는 selection/resize 갱신을 알릴 뿐, `patchmap:updated`와는 별개다.
