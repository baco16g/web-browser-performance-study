# 2. Hooks と state の更新

この章では、Hook の値がどこに保存されるか、`setState` を呼ぶと何が起きるか、同じ値を入れたときに render が省かれる条件を、ソースから確かめます。

関係する教材は UC1 です。`bad` は親の `StateGrid` が `useState` でフォーカス位置を持ち、キー入力のたびに `setFocusedIndex` を呼びます。

## コンポーネントの render は、関数を1回呼ぶこと

関数コンポーネントの render は、[`renderWithHooks`](react:react-reconciler/src/ReactFiberHooks.js#L505) の中でコンポーネントの関数を呼ぶことです。呼ぶ前に、初回（mount）用と更新（update）用のどちらの Hook の実装を使うかを切り替えます。

[`ReactFiberHooks.js` 549〜567行（本番ビルドの分岐を抜粋）](react:react-reconciler/src/ReactFiberHooks.js#L549-L567)

```js
ReactSharedInternals.H =
  current === null || current.memoizedState === null
    ? HooksDispatcherOnMount
    : HooksDispatcherOnUpdate;
```

[`ReactFiberHooks.js` 595〜602行](react:react-reconciler/src/ReactFiberHooks.js#L595-L602)

```js
const shouldDoubleRenderDEV = __DEV__ && (workInProgress.mode & StrictLegacyMode) !== NoMode;

shouldDoubleInvokeUserFnsInHooksDEV = shouldDoubleRenderDEV;
let children = __DEV__
  ? callComponentInDEV(Component, props, secondArg)
  : Component(props, secondArg);
shouldDoubleInvokeUserFnsInHooksDEV = false;
```

`useState` は、`ReactSharedInternals.H` に入っている実装を呼びます。初回なら `mountState`、更新なら `updateState` が動きます。この切り替えは、render の最初に1回だけ行われます。

性能の面で大事なのは、**関数の本体が毎回すべて実行される**ことです。UC1 の `Tile` で重かった `toLocaleString` も、render のたびにこの呼び出しの中で実行されていました。

### StrictMode の2回呼び出しは開発ビルドだけ

`shouldDoubleRenderDEV` は `__DEV__` が真のときだけ真になります。開発ビルドでは StrictMode の中のコンポーネントがもう一度呼ばれ（[605〜629行](react:react-reconciler/src/ReactFiberHooks.js#L605-L629)）、本番ビルドとプロファイリングビルドでは呼ばれません。

UC1 を開発ビルドで動かすと、`uc01:tile-renders` は本番ビルドの 3000 に対して 6000 でした。開発ビルドの回数や時間は、本番の値として扱えません。

## Hook の値は Fiber に連結リストで保存される

Hook 1つは、次の形のオブジェクトです。

[`ReactFiberHooks.js` 197〜203行](react:react-reconciler/src/ReactFiberHooks.js#L197-L203)

```js
export type Hook = {
  memoizedState: any;
  baseState: any;
  baseQueue: Update<any, any> | null;
  queue: any;
  next: Hook | null;
};
```

| フィールド               | 中身（`useState` の場合）                                    |
| ------------------------ | ------------------------------------------------------------ |
| `memoizedState`          | 今の state                                                   |
| `baseState`、`baseQueue` | 優先度が足りずに後回しにした更新を、あとで積み直すための起点 |
| `queue`                  | 更新のキューと `setState` の関数                             |
| `next`                   | 次の Hook                                                    |

コンポーネントの中で呼んだ Hook は `next` でつながり、先頭が Fiber の `memoizedState` に入ります。初回は [`mountWorkInProgressHook`](react:react-reconciler/src/ReactFiberHooks.js#L983-L1002) が Hook を作って末尾に足します。更新時は [`updateWorkInProgressHook`](react:react-reconciler/src/ReactFiberHooks.js#L1004) が、前回のリストを先頭から1つずつ進めて複製します。

[`ReactFiberHooks.js` 1046〜1062行](react:react-reconciler/src/ReactFiberHooks.js#L1046-L1062)

```js
      } else {
        // This is an update. We should always have a current hook.
        throw new Error('Rendered more hooks than during the previous render.');
      }
    }

    currentHook = nextCurrentHook;

    const newHook: Hook = {
      memoizedState: currentHook.memoizedState,
      baseState: currentHook.baseState,
      baseQueue: currentHook.baseQueue,
      queue: currentHook.queue,
      next: null,
    };
```

Hook は名前ではなく、**呼ばれた順番**で前回の値と対応づけられます。条件分岐の中で Hook を呼んではいけないのはこのためです。名前で探さない分、1つあたりの費用は小さく済みます。

## setState は、render をすぐには始めない

`setState` の実体は [`dispatchSetState`](react:react-reconciler/src/ReactFiberHooks.js#L3626-L3654) です。

```js
const lane = requestUpdateLane(fiber);
const didScheduleUpdate = dispatchSetStateInternal(fiber, queue, action, lane);
```

最初に、この更新の優先度（Lane）を決めます。Lane は[3章](./scheduling-updates)で扱います。続く `dispatchSetStateInternal` は、更新をキューに積み、Fiber に印を付け、root に予約を入れるところまでしか行いません。render は、あとで microtask の中で始まります。同じイベントの中で何度 `setState` を呼んでも render が1回にまとまるのは、このためです。

### 祖先に「この下に仕事がある」という印を付ける

更新を積むと、[`markUpdateLaneFromFiberToRoot`](react:react-reconciler/src/ReactFiberConcurrentUpdates.js#L189-L250) が、更新された Fiber から root までの祖先をたどって印を付けます。

[`ReactFiberConcurrentUpdates.js` 194〜209行](react:react-reconciler/src/ReactFiberConcurrentUpdates.js#L194-L209)

```js
// Update the source fiber's lanes
sourceFiber.lanes = mergeLanes(sourceFiber.lanes, lane);
let alternate = sourceFiber.alternate;
if (alternate !== null) {
  alternate.lanes = mergeLanes(alternate.lanes, lane);
}
// Walk the parent path to the root and update the child lanes.
let isHidden = false;
let parent = sourceFiber.return;
let node = sourceFiber;
while (parent !== null) {
  parent.childLanes = mergeLanes(parent.childLanes, lane);
  alternate = parent.alternate;
  if (alternate !== null) {
    alternate.childLanes = mergeLanes(alternate.childLanes, lane);
  }
```

更新された Fiber 自身には `lanes`、祖先には `childLanes` が付きます。render のとき、React は `childLanes` を見て「この下には今回の仕事がない」と判断し、部分木を丸ごと飛ばします。この仕組みは[5章](./bailout)の中心になります。

## 同じ値を入れたときは、2段階で省かれる

### 1段階目: `setState` の時点で予約しない

[`dispatchSetStateInternal`](react:react-reconciler/src/ReactFiberHooks.js#L3656-L3726) は、条件がそろえば、その場で新しい state を計算して前の値と比べます。

[`ReactFiberHooks.js` 3676〜3705行（抜粋）](react:react-reconciler/src/ReactFiberHooks.js#L3676-L3705)

```js
if (
  fiber.lanes === NoLanes &&
  (alternate === null || alternate.lanes === NoLanes)
) {
  // The queue is currently empty, which means we can eagerly compute the
  // next state before entering the render phase. If the new state is the
  // same as the current state, we may be able to bail out entirely.
  const lastRenderedReducer = queue.lastRenderedReducer;
  if (lastRenderedReducer !== null) {
    // ...
      const currentState: S = queue.lastRenderedState as any;
      const eagerState = lastRenderedReducer(currentState, action);
      update.hasEagerState = true;
      update.eagerState = eagerState;
      if (is(eagerState, currentState)) {
        // Fast path. We can bail out without scheduling React to re-render.
        enqueueConcurrentHookUpdateAndEagerlyBailout(fiber, queue, update);
        return false;
      }
```

その Fiber にまだ処理していない更新がなく、計算した値が今の値と `Object.is` で等しければ、render を予約せずに終わります。

この近道があるのは `useState` だけです。`useReducer` の `dispatch`（[`dispatchReducerAction`](react:react-reconciler/src/ReactFiberHooks.js#L3583)）には、この比較がありません。

### 2段階目: render したあとで子に進まない

1段階目の条件がそろわないときは、render が予約されます。render の中で新しい state を計算し、前の値と比べます。

[`ReactFiberHooks.js` 1553〜1556行](react:react-reconciler/src/ReactFiberHooks.js#L1553-L1556)

```js
// different from the current state.
if (!is(newState, hook.memoizedState)) {
  markWorkInProgressReceivedUpdate();
```

値が変わっていなければ「更新を受け取った」という印（`didReceiveUpdate`）が付きません。すると、関数を呼んだあとで子の処理を飛ばします。

[`ReactFiberBeginWork.js` 1549〜1552行](react:react-reconciler/src/ReactFiberBeginWork.js#L1549-L1552)

```js
if (current !== null && !didReceiveUpdate) {
  bailoutHooks(current, workInProgress, renderLanes);
  return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
}
```

関数の本体は実行されますが、子の render は起きません。

どちらの段階も `Object.is` で比べます。毎回新しいオブジェクトや配列を作って `setState` に渡すと、中身が同じでも別の値と判定され、どちらの省略も効きません。

## 優先度の低い更新は、あとに回される

[`updateReducerImpl`](react:react-reconciler/src/ReactFiberHooks.js#L1316) は、キューの更新を順に適用するときに、今回の render の Lane に含まれない更新を飛ばします（[1384〜1446行](react:react-reconciler/src/ReactFiberHooks.js#L1384-L1446)）。飛ばした更新はキューに残り、その Lane が Fiber に戻されて、あとの render で適用されます。

急ぎの更新を先に画面に出し、`startTransition` の更新をあとに回せるのは、この仕組みがあるからです。その代わり、飛ばした更新より後ろの更新は、あとで積み直すときにもう一度計算されます。詳しくは[10章](./transitions)で扱います。

## 計測で確かめる

UC1 の `bad` で1回キーを押したときの流れを、この章の内容で追うと次のようになります。

1. `onKeyDown` の中で `setFocusedIndex` を呼ぶ。値は前回と違うので、1段階目の近道は通らない
2. `StateGrid` の Fiber に `lanes`、祖先に `childLanes` が付き、root に予約が入る
3. ハンドラーを抜けたあとの microtask で render が始まる（[3章](./scheduling-updates)）
4. `StateGrid` の関数が呼ばれ、3000件の `Tile` の要素が作られる

Performance パネルでは、`setFocusedIndex` 自体はほとんど時間を使いません。時間は、そのあとの `Run microtasks` の下にまとまって現れます。
