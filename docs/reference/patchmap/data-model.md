# Patch Map 데이터 모델 가이드

이 문서는 현재 `patch-map` 구현이 실제로 받아들이는 데이터 형식만 정리한다.  
기준 소스는 `README.md`의 `draw(data)` 설명, `src/display/data-schema/*.js`, `src/display/normalize.js`, `src/utils/spacing.js`, `src/utils/convert.js`, `src/utils/validator.js`다.

## 1) 검증 흐름

- `patchmap.draw(data)`는 입력을 `JSON.parse(JSON.stringify(data))`로 한 번 복제한 뒤 처리한다.
- 따라서 `draw()` 입력은 plain JSON 객체/배열 형태가 가장 안전하다. 스키마가 일부 비JSON 값도 허용하더라도 복제 과정에서 보존되지 않을 수 있다.
- 입력이 객체이고 `grids` 키를 가지면 `convertLegacyData()`로 구형 데이터 형식을 새 형식으로 바꾼다.
- 이후 `validateMapData()`가 `mapDataSchema`로 검증한다.
- 검증에 성공하면 내부적으로 `canvas` 루트에 감싸서 렌더링하지만, 외부에서 작성하는 최상위 데이터는 배열이다.
- `update({ changes })`는 기본적으로 `normalizeChanges()`를 거친 뒤 병합한다. `normalize` 옵션을 끌 수 있다.
- 스키마는 대부분 `.strict()`이므로 알 수 없는 속성은 실패한다.

## 2) 최상위 구조

### MapData

- 최상위 데이터는 `Element[]`다.
- 허용되는 요소 타입은 `group`, `grid`, `item`, `relations`, `image`, `text`, `rect`다.
- `id`는 생략 가능하며 기본값은 `uid()`로 생성된다.
- `show`는 기본값 `true`다.
- 요소 타입(`group`, `grid`, `item`, `relations`, `image`, `text`, `rect`)은 `locked`를 사용할 수 있고 기본값은 `false`다.
- `mapDataSchema`는 루트 배열과 `group.children`만 재귀적으로 검사한다. 즉, 중복 ID 검사는 최상위 요소와 group 하위 요소에 적용된다.

```js
const data = [
  { type: 'item', id: 'node-a', size: 80 },
  {
    type: 'group',
    id: 'cluster-1',
    children: [
      { type: 'item', id: 'node-b', size: { width: 120, height: 80 } },
    ],
  },
];
```

## 3) 요소 타입

### group

- 필수: `children`
- `children`은 `Element[]`다.
- `attrs`는 그룹 전체의 위치나 원시 속성을 담는 용도로 쓴다.
- 빈 `children: []`는 허용된다.

```js
{
  type: 'group',
  id: 'group-api',
  attrs: { x: 100, y: 50 },
  children: [
    { type: 'item', id: 'api-1', size: 64 },
    { type: 'item', id: 'api-2', size: 64, locked: true },
  ],
}
```

### grid

- 필수: `cells`, `item`
- `cells`는 2차원 배열이며 각 칸은 `0`, `1`, 문자열 중 하나여야 한다.
- 허용값 안에서의 활성 규칙은 다음처럼 이해하면 된다.
  - `0`은 비활성이다.
  - `1`과 비어 있지 않은 문자열은 활성이다.
  - 빈 문자열 `''`도 스키마상 문자열이므로 입력 자체는 가능하지만, 런타임에서는 비활성으로 처리된다.
- `inactiveCellStrategy` 기본값은 `destroy`다. `hide`를 쓰면 비활성 셀도 유지되지만 `show: false`가 된다.
- `gap` 기본값은 `0`이다.
- `item.size`는 필수이며 숫자 하나를 쓰면 정사각형으로 확장된다.
- `item.components` 기본값은 `[]`, `item.padding` 기본값은 `0`, `item.contentOrientation` 기본값은 `upright`다.
- 각 활성 셀은 런타임에 `${grid.id}.${rowIndex}.${colIndex}` 형식의 item ID로 생성된다. 예를 들어 `rack` grid의 첫 행 첫 열은 `rack.0.0`이다.
- 생성된 셀 item의 `label`은 `String(cell)` 값이 된다.

```js
{
  type: 'grid',
  id: 'rack',
  cells: [
    [1, 0, 1],
    ['db', 1, 1],
  ],
  gap: 4,
  inactiveCellStrategy: 'hide',
  item: {
    size: 40,
    components: [
      { type: 'background', source: { type: 'rect', fill: 'white', radius: 6 } },
      { type: 'icon', source: 'server', size: 16 },
    ],
  },
}
```

### item

- 필수: `size`
- `components` 기본값은 `[]`
- `padding` 기본값은 `0`
- `contentOrientation` 기본값은 `upright`
- `item`은 내부 컴포넌트를 담는 기본 요소다.

```js
{
  type: 'item',
  id: 'server-1',
  size: { width: 120, height: 80 },
  padding: { top: 8, x: 12 },
  components: [
    { type: 'background', source: { type: 'rect', fill: '#fff', borderWidth: 1 } },
    { type: 'text', text: 'Server', placement: 'top' },
  ],
}
```

### relations

- 필수: `links`
- `links`는 `{ source: string; target: string }[]`다.
- `style`은 선택이며, 생략하면 `color`는 `black` 기본값을 가진다.
- `update()`에서 `mergeStrategy: 'merge'`일 때는 이미 존재하는 source/target 쌍의 중복 링크를 건너뛴다.

```js
{
  type: 'relations',
  id: 'server-links',
  links: [
    { source: 'server-1', target: 'server-2' },
    { source: 'server-2', target: 'server-3' },
  ],
  style: { width: 2, cap: 'round', join: 'round' },
}
```

### image

- 필수: `source`
- `size`는 선택이다.
- `source`는 URL 또는 asset key 문자열이다.

```js
{
  type: 'image',
  id: 'logo',
  source: 'https://example.com/logo.png',
  size: { width: 160, height: 48 },
}
```

### text

- `text`는 선택이며 기본값은 빈 문자열이다.
- `style`은 `ElementTextStyle`를 사용한다.
- `size`는 선택이다.
- `style`을 생략하면 기본 텍스트 스타일이 채워진다.

```js
{
  type: 'text',
  id: 'title',
  text: 'Hello Patch Map',
  style: { fontSize: 20, fontWeight: 'bold' },
  size: { width: 220, height: 40 },
}
```

### rect

- 필수: `size`
- `fill`과 `stroke`는 선택이다.
- `radius` 기본값은 `0`이다.
- `radius`는 숫자 하나 또는 `EachRadius` 객체를 받을 수 있다.

```js
{
  type: 'rect',
  id: 'panel',
  size: { width: 200, height: 120 },
  fill: '#ffffff',
  stroke: { color: '#999', width: 1 },
  radius: { topLeft: 8, topRight: 8, bottomRight: 0, bottomLeft: 0 },
}
```

## 4) 컴포넌트 타입

컴포넌트는 `item.components` 또는 `grid.item.components` 안에서만 쓴다.  
컴포넌트도 `Base`를 따르므로 `id`, `label`, `show`, `attrs`를 가진다. `locked`는 없다.

### background

- 필수: `source`
- `source`는 문자열 또는 `TextureStyle` 객체다.
- `size`는 입력을 받아도 실제로는 항상 부모를 가득 채우는 `100% x 100%`로 정규화된다.
- `tint`는 선택이며 생략 시 흰색 계열 기본값을 쓴다.

```js
{
  type: 'background',
  source: { type: 'rect', fill: 'white', borderWidth: 2, borderColor: 'primary.dark', radius: 6 },
}
```

### bar

- 필수: `source`, `size`
- `source`는 `TextureStyle` 객체다.
- `size`는 `PxOrPercentSize`다.
- `placement` 기본값은 `bottom`
- `margin` 기본값은 `0`
- `animation` 기본값은 `true`
- `animationDuration` 기본값은 `200`

```js
{
  type: 'bar',
  source: { type: 'rect', fill: 'white', radius: 3 },
  size: '100%',
  placement: 'bottom',
}
```

### icon

- 필수: `source`, `size`
- `source`는 문자열이다.
- `placement` 기본값은 `center`
- `margin` 기본값은 `0`

```js
{
  type: 'icon',
  source: 'loading',
  size: 16,
  placement: 'right-bottom',
}
```

### text

- `text` 기본값은 빈 문자열이다.
- `placement` 기본값은 `center`
- `margin` 기본값은 `0`
- `split` 기본값은 `0`
- `style`은 `LabelTextStyle`다.

```js
{
  type: 'text',
  text: 'CPU',
  split: 0,
  style: { fontSize: 'auto', autoFont: { min: 10, max: 18 }, overflow: 'ellipsis' },
}
```

## 5) primitive 타입과 축약 표기

### size

- `Size`는 숫자 또는 `{ width, height }` 객체다.
- 숫자 하나를 넣으면 `width`와 `height`가 같은 정사각형으로 확장된다.
- 숫자는 음수일 수 없다.

### gap

- `Gap`은 숫자 또는 `{ x, y }` 객체다.
- 숫자 하나를 넣으면 `x`와 `y`가 같은 값으로 확장된다.
- `x`, `y`는 기본값 `0`을 가진다.
- 음수는 허용되지 않는다.

### margin / padding

- `Margin`은 숫자, `{ x, y }`, 또는 `{ top, right, bottom, left }` 객체다.
- 숫자 하나를 넣으면 네 변 모두 같은 값이 된다.
- `{ x, y }`는 `x -> left/right`, `y -> top/bottom`으로 확장된다.
- edge 키가 axis 키보다 우선한다. 예: `{ top: 10, x: 5 }` -> `{ top: 10, right: 5, bottom: 0, left: 5 }`
- `padding`도 같은 정규화 규칙을 쓴다.
- `margin`은 음수도 허용한다.

### placement

- 현재 스키마가 허용하는 값은 `left`, `left-top`, `left-bottom`, `top`, `right`, `right-top`, `right-bottom`, `bottom`, `center`다.
- 현재 구현의 스키마는 `none`을 허용하지 않는다.

### colors

- `Color`는 문자열, 숫자, 숫자 배열, `Float32Array`, `Uint8Array`, `Uint8ClampedArray`, RGB/HSL/HSV 계열 객체, `PixiColor` 인스턴스를 허용한다.
- 문자열 색상은 theme key로도 해석된다. theme에 없으면 원래 문자열을 그대로 사용한다.
- `Color` 스키마 자체의 기본값은 `0xffffff`다.
- `rect.fill`은 선택이며, `rect.stroke.color`와 `relations.style.color`는 각각 다른 기본값을 가진다.

### texture style / text style

- `TextureStyle` 객체는 partial이다. `{ fill: 'red' }`처럼 `type` 없이 써도 되고, `type`을 쓰면 `rect`여야 한다.
- `background.source`는 문자열 또는 `TextureStyle` 객체를 받는다.
- `bar.source`는 `TextureStyle` 객체만 받는다.
- `LabelTextStyle`에서 확실한 기본값은 `fontFamily: 'FiraCode'`, `fontWeight: 400`, `fill: 'black'`, `autoFont: { min: 1, max: 100 }`, `overflow: 'visible'`다.
- `LabelTextStyle.fontSize`는 현재 스키마에서 optional override라서, `TextStyle`의 기본 `16`이 항상 그대로 적용된다고 단정하지 않는 편이 안전하다.
- `ElementTextStyle` 기본값은 `wordWrap: true`, `letterSpacing: 0`이다.

### radius

- `rect.radius`와 `TextureStyle.radius`는 숫자 또는 `EachRadius` 객체다.
- 숫자 하나를 넣으면 모든 모서리에 같은 반경이 적용된다.
- `EachRadius`는 `topLeft`, `topRight`, `bottomRight`, `bottomLeft`를 가진다.
- 각 모서리 값은 기본값 `0`이다.

### px / percent / calc()

- `PxOrPercent`는 숫자, `"%"`
  문자열, 또는 `{ value, unit }` 객체다.
- 숫자는 `{ value, unit: 'px' }`로 확장된다.
- `"75%"` 같은 문자열은 퍼센트로 파싱된다.
- `calc(...)` 문자열도 허용되지만, 연산자는 공백으로 분리되어야 한다. 예: `calc(100% - 20px)`.
- `PxOrPercentSize`는 위 값을 width/height에 각각 적용한다.
- `bar.size`와 `icon.size`가 이 형식을 쓴다.

## 6) 정규화와 레거시 변환

### `normalizeChanges()`

- `update()` 경로에서 기본적으로 적용된다.
- plain object만 정규화한다. 클래스 인스턴스 같은 non-plain payload는 그대로 둔다.
- `size: 80` -> `{ width: 80, height: 80 }`
- `gap: 4` -> `{ x: 4, y: 4 }`
- `padding: 3` -> `{ top: 3, right: 3, bottom: 3, left: 3 }`
- `margin: { top: 10, x: 5 }` 같은 혼합 입력은 edge 값이 우선한다.
- `background.size`는 무조건 `{ width: 100%, height: 100% }`로 바뀐다.
- `bar.size`와 `icon.size`는 숫자/문자열 축약을 `{ width, height }` 객체로 바꾼다.
- `components`, `children`, `item` 내부도 재귀적으로 정규화한다.

### `convertLegacyData()`

- `draw()`는 루트 객체가 legacy 형식이면 자동 변환한다.
- `metadata` 키는 무시한다.
- `grids`는 `grid` 요소 배열로 바뀐다.
- `strings`는 `relations` 요소 배열로 바뀐다.
- 그 외 키는 `item` 요소 배열로 바뀐다.
- 변환 결과에는 현재 구현용 기본 컴포넌트와 `attrs`가 채워진다.

```js
// legacy 예시
{
  grids: [...],
  strings: [...],
  combines: [...],
  metadata: {...},
}
```

## 7) 작성 규칙

- 최상위는 항상 배열로 쓴다.
- `group.children` 안에는 요소만 넣는다.
- `grid.item.components`와 `item.components` 안에는 컴포넌트만 넣는다.
- `rect`는 `size` 없이는 그릴 수 없다.
- `bar`와 `icon`은 `size`가 필수다.
- `background`는 `size`를 따로 제어하는 요소가 아니므로, 채우기 용도로만 생각하는 편이 맞다.
- `relations.links`는 ID 문자열로 연결한다.
- `grid.cells`는 스키마상 `0 | 1 | string`만 넣을 수 있고, 그 안에서는 `0`과 `''`가 비활성, `1`과 비어 있지 않은 문자열이 활성으로 동작한다고 이해하는 편이 안전하다.
- `contentOrientation`의 기본값은 `upright`다. `item`과 `grid.item`의 내부 `text`, `icon`, `bar`에 영향을 준다.
- `relations.links`로 grid 셀을 연결할 때는 런타임이 생성한 셀 ID 규칙(`${grid.id}.${row}.${col}`)을 써야 한다.

## 8) 짧은 권장 예시

```js
const data = [
  {
    type: 'group',
    id: 'service-cluster',
    attrs: { x: 120, y: 80 },
    children: [
      {
        type: 'grid',
        id: 'rack',
        cells: [[1, 0, 1]],
        item: {
          size: 40,
          components: [
            { type: 'background', source: { type: 'rect', fill: '#fff', radius: 6 } },
            { type: 'icon', source: 'server', size: 16 },
          ],
        },
      },
      {
        type: 'relations',
        id: 'links',
        links: [{ source: 'rack.0.0', target: 'rack.0.2' }],
      },
    ],
  },
];
```
