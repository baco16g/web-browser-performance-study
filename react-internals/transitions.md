# 10. 中断できる更新: startTransition と useDeferredValue

この章では、`startTransition` と `useDeferredValue` が、更新の Lane をどう変え、何を中断し、何を捨てるのかを確かめます。

関係する教材は UC3 の `deferred` と、UC4 の `good` です。

## startTransition は、Lane を変えるだけ

`react` パッケージの [`startTransition`](react:react/src/ReactStartTransition.js#L45-L118) は、渡された関数を実行する間だけ `ReactSharedInternals.T` に目印のオブジェクトを入れます。

```js
export function startTransition(
  scope: () => void,
  options?: StartTransitionOptions,
): void {
  const prevTransition = ReactSharedInternals.T;
  const currentTransition: Transition = {} as any;
  // ...
  ReactSharedInternals.T = currentTransition;

  try {
    const returnValue = scope();
    // ...
  } finally {
    // ...
    ReactSharedInternals.T = prevTransition;
  }
}
```

関数はその場で同期に実行されます。`startTransition` 自体は何も予約しません。効果はすべて、中で呼んだ `setState` の Lane が変わることから生まれます。[3章](./scheduling-updates)の `requestUpdateLane` は、`T` が入っていれば Transition の Lane を返すからです。

同じクリックの中でも、`startTransition` の内側の更新は Transition、外側の更新は `SyncLane` になります。

### 同じイベントの Transition は、同じ Lane を共有する

Transition の Lane は14本あり、通常の更新に10本、`useDeferredValue` に4本を使います。[`requestTransitionLane`](react:react-reconciler/src/ReactFiberRootScheduler.js#L698-L724) は、1つのイベントの中では同じ Lane を返し、イベントが変わると次の Lane に進みます（[`claimNextTransitionUpdateLane`](react:react-reconciler/src/ReactFiberLane.js#L726-L736)）。

19.3.1 では `enableParallelTransitions` が有効で、別々のイベントで始めた Transition は、別々の render として処理されます（[`getHighestPriorityLanes`](react:react-reconciler/src/ReactFiberLane.js#L202-L215)）。同じ state を更新した Transition どうしは、まとめて render されます。

## Transition の render は、止められて、捨てられる

Transition の Lane は、止められる render の対象です（[3章](./scheduling-updates)の `includesBlockingLane`）。Scheduler の Normal 優先度のタスクとして、約5ms ごとに区切りながら進みます（[4章](./scheduler)）。

区切りでブラウザに処理を返している間に、キー入力などの優先度の高い更新が来ると、[`getNextLanes`](react:react-reconciler/src/ReactFiberLane.js#L334-L360) が今の render を続けるかどうかを決めます。

```js
// If we're already in the middle of a render, switching lanes will interrupt
// it and we'll lose our progress. We should only do this if the new lanes are
// higher priority.
if (
  wipLanes !== NoLanes &&
  wipLanes !== nextLanes &&
  (wipLanes & suspendedLanes) === NoLanes
) {
  const nextLane = getHighestPriorityLane(nextLanes);
  const wipLane = getHighestPriorityLane(wipLanes);
  if (
    nextLane >= wipLane ||
    // Default priority updates should not interrupt transition updates. The
    // only difference between default updates and transition updates is that
    // default updates do not support refresh transitions.
    (nextLane === DefaultLane && (wipLane & TransitionLanes) !== NoLanes)
  ) {
    // Keep working on the existing in-progress tree. Do not interrupt.
    return wipLanes;
  }
}

return nextLanes;
```

| 途中で来た更新                                      | Transition の render は        |
| --------------------------------------------------- | ------------------------------ |
| `SyncLane`（クリック、キー入力）                    | 中断される                     |
| `InputContinuousLane`（`mousemove`、`scroll`）      | 中断される                     |
| `DefaultLane`（`setTimeout` などの中の `setState`） | 中断されず、終わるまで待たせる |
| 別の Transition                                     | 中断されない                   |

中断された render の途中の結果は、再利用されません。新しい更新の render を始めるときに、`renderRootSync` が Lane の違いに気づき、[`prepareFreshStack`](react:react-reconciler/src/ReactFiberWorkLoop.js#L2023) で作りかけの木を捨てるからです。Transition は、優先度の高い更新を commit したあとで、最初から render し直します。

入力が続くと、Transition の render は何度も最初からやり直しになります。1回の render の費用を下げておくこと（[7章](./memoization)）が、ここでも効きます。それでも中断され続けた場合は、[4章](./scheduler)の期限（5000ms）を過ぎた時点で、止められない render で最後まで進みます。

## useTransition の isPending は、同期で表示される

[`useTransition`](react:react-reconciler/src/ReactFiberHooks.js#L3425-L3456) が返す `isPending` は、内部の `useState` です。返された `startTransition` を呼ぶと、次の2つの更新を積みます。

1. `isPending = true` を、`SyncLane` の更新として積む（[`dispatchOptimisticSetState`](react:react-reconciler/src/ReactFiberHooks.js#L3728)）
2. 渡された関数を実行したあと、`isPending = false` を Transition の Lane で積む

1は同期で、すぐに commit されます。重い部分木と同じコンポーネントで `isPending` を読むと、その同期の render も重くなります。

## useDeferredValue は、2回 render する

`useDeferredValue` は、値が変わったときに、まず古い値で render し、新しい値の render を後回しにします。判断は [`updateDeferredValueImpl`](react:react-reconciler/src/ReactFiberHooks.js#L3056-L3107) にあります。

```js
if (is(value, prevValue)) {
  // The incoming value is referentially identical to the currently rendered
  // value, so we can bail out quickly.
  return value;
} else {
  // ...
  const shouldDeferValue =
    !includesOnlyNonUrgentLanes(renderLanes) && !isRenderingDeferredWork();
  if (shouldDeferValue) {
    // This is an urgent update. Since the value has changed, keep using the
    // previous value and spawn a deferred render to update it later.

    // Schedule a deferred render
    const deferredLane = requestDeferredLane();
    currentlyRenderingFiber.lanes = mergeLanes(
      currentlyRenderingFiber.lanes,
      deferredLane,
    );
    markSkippedUpdateLanes(deferredLane);

    // Reuse the previous value. We do not need to mark this as an update,
    // because we did not render a new value.
    return prevValue;
  } else {
    // ...
    markWorkInProgressReceivedUpdate();
    hook.memoizedState = value;
    return value;
  }
}
```

| 今の render                            | 値が変わったとき                           |
| -------------------------------------- | ------------------------------------------ |
| 急ぎ（Sync、InputContinuous、Default） | 古い値を返し、新しい値の render を予約する |
| 急ぎでない（Transition など）          | 新しい値をそのまま返す                     |

予約される render の Lane は、[`requestDeferredLane`](react:react-reconciler/src/ReactFiberWorkLoop.js#L884-L921) が Transition 用の Lane から割り当てます。古い値での render が commit されてから root に登録されるので、入力への反応が先に画面に出ることがコードで保証されています。後回しにした render は Transition と同じく、区切られ、中断されます。

値は `Object.is` で比べます。毎回新しいオブジェクトを渡すと、毎回「変わった」と判定され、そのたびに後回しの render が追加されます。

## 計測で確かめる

- **UC3 の `deferred`:** 1文字目の入力は、古い値での render だけなので、すぐに画面に出ます。ただし連続入力では、2文字目が 52.8ms 待たされ、146.0ms の Long Task が残りました。後回しにした render の中で、5万件の検索を1つのコンポーネントの関数として同期で実行しているためです。[4章](./scheduler)のとおり、関数の中では区切れません。
- **UC4 の `good`:** 残りの行を `startTransition` で描きます。CPU 4倍で記録すると、render が 3〜8ms のタスク約20件に分かれていました（[4章](./scheduler)）。ブラウザのレイアウトの約 400ms は分かれずに残りました。
- **React のトラック:** プロファイリング版で記録すると、Transition の更新は Scheduler グループの `Transition` のトラックに表示されます（[11章](./profiling)）。
