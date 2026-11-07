# 9. 外部ストア（useSyncExternalStore）

この章では、`useSyncExternalStore` が値を読む時期、再 render を予約する方法、止められる render との関係を確かめます。

関係する教材は UC1 の `store` です。フォーカス位置を React の外に置き、各タイルが「自分がフォーカスされているか」だけを購読します。

## 4つの動き

ソースから分かる `useSyncExternalStore` の動きは、次の4つです。

1. render のたびに `getSnapshot` を呼び、前回の値と `Object.is` で比べる
2. ストアの購読は、`useEffect` と同じ passive effect の段階で始める
3. ストアから通知を受けたら、値が変わっていたときだけ `SyncLane` で再 render を予約する
4. 止められる render のあとは、commit の前に値を読み直し、食い違っていれば同期で render し直す

## render のたびに getSnapshot を呼ぶ

[`updateSyncExternalStore`](react:react-reconciler/src/ReactFiberHooks.js#L1739-L1833) は、render のたびに `getSnapshot` を呼びます。

[`ReactFiberHooks.js` 1761〜1779行（抜粋）](react:react-reconciler/src/ReactFiberHooks.js#L1761-L1779)

```js
nextSnapshot = getSnapshot();
// ...
const prevSnapshot = (currentHook || hook).memoizedState;
const snapshotChanged = !is(prevSnapshot, nextSnapshot);
if (snapshotChanged) {
  hook.memoizedState = nextSnapshot;
  markWorkInProgressReceivedUpdate();
}
```

値が変わったときだけ「更新を受け取った」という印が付きます。変わっていなければ、[2章](./hooks-and-state)と同じく、関数を呼んだあとで子の render を省けます。

`getSnapshot` は render のたびに必ず呼ばれるので、重い処理を入れてはいけません。毎回新しいオブジェクトを返すと、中身が同じでも「変わった」と判定されます。開発ビルドでは、2回呼んで結果が違えば警告を出します（[1762〜1772行](react:react-reconciler/src/ReactFiberHooks.js#L1762-L1772)）。

UC1 の `getSnapshot` は `() => store.isFocused(index)` で、真偽値を返すだけです。軽く、毎回同じ値を返せます。

## 購読は passive effect で始める

初回の render では、購読を passive effect として予約します。

[`ReactFiberHooks.js` 1714〜1721行](react:react-reconciler/src/ReactFiberHooks.js#L1714-L1721)

```js
const inst: StoreInstance<T> = {
  value: nextSnapshot,
  getSnapshot,
};
hook.queue = inst;

// Schedule an effect to subscribe to the store.
mountEffect(subscribeToStore.bind(null, fiber, inst, subscribe), [subscribe]);
```

依存配列は `[subscribe]` です。render のたびに新しい `subscribe` 関数を渡すと、そのたびに購読し直します。UC1 の `ConnectedTile` が `subscribe` を `useCallback` で包んでいるのは、このためです。

## 通知を受けたら SyncLane で再 render する

ストアから通知を受けたときの処理は、[`subscribeToStore`](react:react-reconciler/src/ReactFiberHooks.js#L1884-L1918) にあります。

```js
function subscribeToStore<T>(
  fiber: Fiber,
  inst: StoreInstance<T>,
  subscribe: (() => void) => () => void,
): any {
  const handleStoreChange = () => {
    // The store changed. Check if the snapshot changed since the last time we
    // read from the store.
    if (checkIfSnapshotChanged(inst)) {
      // Force a re-render.
      startUpdateTimerByLane(SyncLane, 'updateSyncExternalStore()', fiber);
      forceStoreRerender(fiber);
    }
  };
  // Subscribe to the store and return a clean-up function.
  return subscribe(handleStoreChange);
}

function forceStoreRerender(fiber: Fiber) {
  const root = enqueueConcurrentRenderForLane(fiber, SyncLane);
  if (root !== null) {
    scheduleUpdateOnFiber(root, fiber, SyncLane);
  }
}
```

Lane は、常に `SyncLane` です。ストアを `startTransition` の中で更新しても、このフックによる再 render は止められない同期の render になります。大きな部分木がストアを購読していると、その更新はメインスレッドを最後まで占有します。

通知を受けたコンポーネントにだけ `lanes` が付き、祖先には `childLanes` が付きます。再 render されるのは、値が変わったコンポーネントだけです。

## 止められる render のあとは、値を読み直す

止められる render の途中でブラウザに処理を返すと、その間にストアが変わる可能性があります。同じ render の中で、古い値を読んだコンポーネントと新しい値を読んだコンポーネントが混ざる状態を tearing（画面の食い違い）と呼びます。

これを防ぐため、Transition などの止められる Lane で render したときは、確認用の記録を残します（[`pushStoreConsistencyCheck`](react:react-reconciler/src/ReactFiberHooks.js#L1835-L1859)）。render が終わると、commit の前に [`performWorkOnRoot`](react:react-reconciler/src/ReactFiberWorkLoop.js#L1217-L1243) がもう一度 `getSnapshot` を呼んで確かめます。

```js
const finishedWork: Fiber = root.current.alternate as any;
if (
  renderWasConcurrent &&
  !isRenderConsistentWithExternalStores(finishedWork)
) {
  // ...
  // A store was mutated in an interleaved event. Render again,
  // synchronously, to block further mutations.
  exitStatus = renderRootSync(root, lanes, false);
  // We assume the tree is now consistent because we didn't yield to any
  // concurrent events.
  renderWasConcurrent = false;
  continue;
}
```

食い違いが見つかると、止められる render の結果を捨てて、同期で render し直します。頻繁に変わるストアを Transition の中で読むと、render を2回分行ううえに、2回目はメインスレッドを占有します。プロファイリングビルドでは、これが React のトラックに `Teared Render` として表示されます（[11章](./profiling)）。

## UC1 の store で省けたもの、省けなかったもの

`store` では、`StateGrid` に相当する親の `StoreGrid` が state を持ちません。キー入力で変わるのは外部ストアの値だけで、通知を受けるのは、フォーカスが外れたタイルと当たったタイルの2件です。

| 処理                              | `memo` | `store`  |
| --------------------------------- | ------ | -------- |
| 親の render（3000件の要素を作る） | あり   | なし     |
| 3000件の props の比較             | あり   | なし     |
| render するタイル                 | 2件    | 2件      |
| 兄弟を1件ずつ確認して省く処理     | あり   | **あり** |

最後の行は、[5章](./bailout)で扱う仕組みです。React は root から、更新された2件のタイルまで木をたどります。その途中で、同じ親を持つ兄弟の Fiber を1件ずつ作り、仕事がないことを確かめて省きます。この処理は件数に比例します。

## 計測で確かめる

公開中のプロファイリング版で UC1 を記録し、React の Components トラックを比べました（300件、1回のキー入力）。

| 実装    | Components トラックに出た項目   |
| ------- | ------------------------------- |
| `memo`  | `StateGrid` 1件、`Tile` 3件     |
| `store` | `ConnectedTile` 2件、`Tile` 3件 |

`memo` では親の `StateGrid` の render が出ますが、`store` では出ません。`Tile` の3件は、2件の render と、`focus()` を呼んだ1件の effect と考えられます。React は 0.05ms を超えた effect だけをトラックに出すので（[11章](./profiling)）、何もしない側の effect は出ません。

関数ごとの時間で比べると、30,000件・CPU 4倍では、`memo` の `updateSimpleMemoComponent` が入力1回あたり 12.20ms、`StateGrid` が 4.25ms でした。`store` ではどちらも出ず、代わりに `bailoutOnAlreadyFinishedWork` が 9.40ms かかっていました。外部ストアで消えるのは親の render と比較で、件数に比例する処理がすべて消えるわけではありません。
