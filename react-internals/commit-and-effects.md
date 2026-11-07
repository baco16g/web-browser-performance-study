# 8. commit と effect の実行時期

この章では、render の結果が DOM に反映される順番と、`useLayoutEffect` と `useEffect` がいつ実行されるかを確かめます。

関係する教材は UC1 です。`Tile` は `useEffect` の中で `focus()` を呼んでいて、その時間がキー入力の処理時間に入っていました。

## commit は4つの段階を同じタスクで続けて行う

[`commitRoot`](react:react-reconciler/src/ReactFiberWorkLoop.js#L3725) は、次の順で進みます。

| 順番 | 段階            | すること                                           |
| ---- | --------------- | -------------------------------------------------- |
| 1    | before mutation | DOM を書き換える前の準備                           |
| 2    | mutation        | DOM の追加、削除、属性の書き換え                   |
| 3    | 木の入れ替え    | `root.current = finishedWork`（[1章](./overview)） |
| 4    | layout          | `useLayoutEffect` の実行と ref の設定              |
| 5    | passive         | `useEffect` の実行（実行する時期は場合による）     |

1〜4は、同じタスクの中で続けて実行されます。

[`ReactFiberWorkLoop.js` 3915〜3921行](react:react-reconciler/src/ReactFiberWorkLoop.js#L3915-L3921)

```js
} else {
  // Flush synchronously.
  flushMutationEffects();
  flushLayoutEffects();
  // Skip flushAfterMutationEffects
  flushSpawnedWork();
}
```

`useLayoutEffect` が重いと、そのまま画面の更新が遅れます。ブラウザは、このタスクが終わるまで描画できないからです。

## DOM には、変わった属性だけを書き込む

mutation の段階では、「更新あり」の印が付いた DOM 要素について [`commitUpdate`](react:react-dom-bindings/src/client/ReactFiberConfigDOM.js#L999-L1012) を呼びます。

```js
export function commitUpdate(
  domElement: Instance,
  type: string,
  oldProps: Props,
  newProps: Props,
  internalInstanceHandle: Object,
): void {
  // Diff and update the properties.
  updateProperties(domElement, type, oldProps, newProps);
```

[`updateProperties`](react:react-dom-bindings/src/client/ReactDOMComponent.js#L1518-L2022) は、前回と今回の props を1つずつ比べ、違うものだけを DOM に書き込みます（[2002〜2022行](react:react-dom-bindings/src/client/ReactDOMComponent.js#L2002-L2022)）。

```js
for (const propKey in nextProps) {
  const nextProp = nextProps[propKey];
  const lastProp = lastProps[propKey];
  if (
    nextProps.hasOwnProperty(propKey) &&
    nextProp !== lastProp &&
    (nextProp != null || lastProp != null)
  ) {
    setProp(domElement, tag, propKey, nextProp, nextProps, lastProp);
  }
}
```

`style` も、キーごとに比べて変わったものだけを書き込みます（[`setValueForStyles`](react:react-dom-bindings/src/client/CSSPropertyOperations.js#L111-L162)）。render のたびに <code v-pre>style={{ ... }}</code> で新しいオブジェクトを作っても、値が同じなら DOM への書き込みは起きません。

ただし、比べる処理そのものは、props のオブジェクトが前回と違う要素すべてで行われます。UC1 の `bad` では、3000件の `Tile` の `button` と `span` がすべて新しい props を受け取るので、すべてで比べ、書き込むのはフォーカスが変わった2件だけになります。Bottom-up の `updateProperties` や `setValueForStyles` は、この比較の時間です。

## useEffect は、Sync の更新なら描画の前に実行される

`useEffect` は「描画のあとに実行される」と説明されることが多いですが、ソースを読むと、そうならない場合があります。

まず、`useEffect` があると、commit の始めに Scheduler の Normal 優先度のタスクを予約します（[3790〜3827行](react:react-reconciler/src/ReactFiberWorkLoop.js#L3790-L3827)）。通常は、このタスクが描画のあとで `useEffect` を実行します。

ところが、layout の段階のあとに動く [`flushSpawnedWork`](react:react-reconciler/src/ReactFiberWorkLoop.js#L4154) に、次の条件があります。

[`ReactFiberWorkLoop.js` 4316〜4329行](react:react-reconciler/src/ReactFiberWorkLoop.js#L4316-L4329)

```js
// If the passive effects are the result of a discrete render, flush them
// synchronously at the end of the current task so that the result is
// immediately observable. Otherwise, we assume that they are not
// order-dependent and do not need to be observed by external systems, so we
// can wait until after paint.
if (includesSyncLane(pendingEffectsLanes) && (disableLegacyMode || root.tag !== LegacyRoot)) {
  flushPendingEffects();
}
```

commit した更新に `SyncLane` が含まれていれば、`useEffect` をこの場で、描画の前に実行します。[3章](./scheduling-updates)で見たとおり、`click` や `keydown` の中の `setState` は `SyncLane` です。

| 更新の起点                             | Lane                  | `useEffect` を実行する時期     |
| -------------------------------------- | --------------------- | ------------------------------ |
| `click`、`keydown` などのハンドラー    | `SyncLane`            | 同じタスクの中（描画の前）     |
| `mousemove`、`scroll` などのハンドラー | `InputContinuousLane` | 別のタスク（通常は描画のあと） |
| `setTimeout`、`fetch` の続き           | `DefaultLane`         | 別のタスク（通常は描画のあと） |
| `startTransition`                      | Transition            | 別のタスク（通常は描画のあと） |

キー入力やクリックでは、**`useEffect` に重い処理を書くと、そのフレームの描画まで遅れます**。

### 描画の機会を作る requestPaint

`flushSpawnedWork` は、最初に [`requestPaint()`](react:react-reconciler/src/ReactFiberWorkLoop.js#L4187-L4189) を呼びます。

```js
// Tell Scheduler to yield at the end of the frame, so the browser has an
// opportunity to paint.
requestPaint();
```

Scheduler に「次の区切りで、ブラウザに処理を返してほしい」と伝える処理です。描画のあとに回した `useEffect` は、このあとの Scheduler のタスクで実行されます（[4章](./scheduler)）。

### effect の中の setState は、続けて render される

`flushSpawnedWork` の最後と、`useEffect` を実行したあとには、`flushSyncWorkOnAllRoots()` が呼ばれます（[4401行](react:react-reconciler/src/ReactFiberWorkLoop.js#L4401)）。effect の中で `SyncLane` の `setState` をすると、その更新もこの場で続けて render と commit をします。Performance パネルの React のトラックでは、これが `Cascading Update` として表示されます（[11章](./profiling)）。

## 計測で確かめる

UC1 の `Tile` は、フォーカスの移動を `useEffect` で行っています。

```tsx
useEffect(() => {
  if (focused) {
    buttonRef.current?.focus();
  }
}, [focused]);
```

キー入力による `SyncLane` の更新なので、この `useEffect` は描画の前に、`keydown` と同じタスクの中で実行されます。教材の記録では、次のことが確かめられました。

- **React のトラック:** プロファイリング版で記録すると、Scheduler トラックの `Remaining Effects`（`useEffect` の段階）が、`keydown` のタスクの中にあります。
- **Bottom-up:** `focus()` の行で `Layout` が 9.6ms（6.4%）発生していました。`focus()` が最新のレイアウトを必要として、その場で確定させたと考えられます。ブラウザの実装までは確かめていません。
- **Event Timing:** この時間は「処理」（Processing duration）に入ります。`useEffect` を使っていても、描画のあとには回っていません。
