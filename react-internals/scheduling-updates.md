# 3. 更新の予約: イベントの優先度、Lane、microtask

UC1 の `bad` を記録すると、`Tile` の render は `Event: keydown` の下の `Run microtasks` の中にあります。キー入力のハンドラーの中ではなく、そのあとの microtask で render している理由を、この章で確かめます。

関係する教材は UC1 と UC3 です。

## React はイベントのリスナーを root にまとめて登録する

`createRoot` を呼ぶと、[`listenToAllSupportedEvents`](react:react-dom-bindings/src/events/DOMPluginEventSystem.js#L432-L459) が、対応するすべてのイベントのリスナーを root のコンテナ要素に登録します。`onKeyDown` を書いた要素そのものには、リスナーを付けません。

登録するときに、イベントの種類から優先度を決め、優先度ごとに違う関数を使います（[`createEventListenerWrapperWithPriority`](react:react-dom-bindings/src/events/ReactDOMEventListener.js#L94-L119)）。

```js
const eventPriority = getEventPriority(domEventName);
let listenerWrapper;
switch (eventPriority) {
  case DiscreteEventPriority:
    listenerWrapper = dispatchDiscreteEvent;
    break;
  case ContinuousEventPriority:
    listenerWrapper = dispatchContinuousEvent;
    break;
  case DefaultEventPriority:
  default:
    listenerWrapper = dispatchEvent;
    break;
}
```

`touchstart`、`touchmove`、`wheel` は passive のリスナーとして登録されます（[`DOMPluginEventSystem.js` 484〜489行](react:react-dom-bindings/src/events/DOMPluginEventSystem.js#L484-L489)）。React の `onWheel` の中で `preventDefault()` が効かないのは、このためです。

## イベントの種類で優先度が決まる

[`getEventPriority`](react:react-dom-bindings/src/events/ReactDOMEventListener.js#L312-L416) は、イベントを3つに分けます。

| 優先度     | 主なイベント                                                       | 性質                   |
| ---------- | ------------------------------------------------------------------ | ---------------------- |
| Discrete   | `click`、`keydown`、`input`、`pointerdown`、`submit`、`focus`      | 1回ずつ独立した操作    |
| Continuous | `mousemove`、`pointermove`、`scroll`、`wheel`、`touchmove`、`drag` | 続けて大量に起きる操作 |
| Default    | それ以外                                                           |                        |

`message` イベントだけは特別で、その時点の Scheduler の優先度から決めます。Scheduler 自身が `MessageChannel` の `message` イベントを使ってタスクを動かしているためです（[4章](./scheduler)）。

Discrete のイベントでは、[`dispatchDiscreteEvent`](react:react-dom-bindings/src/events/ReactDOMEventListener.js#L121-L137) が、ハンドラーを呼んでいる間だけ「今の更新の優先度」を Discrete にします。

```js
function dispatchDiscreteEvent(
  domEventName: DOMEventName,
  eventSystemFlags: EventSystemFlags,
  container: EventTarget,
  nativeEvent: AnyNativeEvent,
) {
  const prevTransition = ReactSharedInternals.T;
  ReactSharedInternals.T = null;
  const previousPriority = getCurrentUpdatePriority();
  try {
    setCurrentUpdatePriority(DiscreteEventPriority);
    dispatchEvent(domEventName, eventSystemFlags, container, nativeEvent);
  } finally {
    setCurrentUpdatePriority(previousPriority);
    ReactSharedInternals.T = prevTransition;
  }
}
```

`finally` では優先度を元に戻すだけです。ここで render はしません。

## Lane は、優先度を表すビット

React は更新の優先度を Lane という31ビットの整数で表します。ビットの位置が低いほど優先度が高くなります（[`ReactFiberLane.js` 41〜118行](react:react-reconciler/src/ReactFiberLane.js#L41-L118)）。

```js
export const SyncLane: Lane = /*            */ 0b0000000000000000000000000000010;
export const InputContinuousLane: Lane = /* */ 0b0000000000000000000000000001000;
export const DefaultLane: Lane = /*         */ 0b0000000000000000000000000100000;
const TransitionLanes: Lanes = /*           */ 0b0000000001111111111111100000000;
export const IdleLane: Lane = /*            */ 0b0010000000000000000000000000000;
```

ビットで表すので、複数の更新の優先度を OR でまとめたり、一番優先度の高いものを `lanes & -lanes` で1回の計算で取り出したりできます（[`getHighestPriorityLane`](react:react-reconciler/src/ReactFiberLane.js#L756-L758)）。

イベントの優先度は、Lane そのものです（[`ReactEventPriorities.js` 24〜28行](react:react-reconciler/src/ReactEventPriorities.js#L24-L28)）。

| イベントの優先度 | Lane                  |
| ---------------- | --------------------- |
| Discrete         | `SyncLane`            |
| Continuous       | `InputContinuousLane` |
| Default          | `DefaultLane`         |
| Idle             | `IdleLane`            |

## setState の Lane は、呼んだ場所で決まる

[`requestUpdateLane`](react:react-reconciler/src/ReactFiberWorkLoop.js#L812-L868) は、次の順で Lane を決めます。

1. render の途中で呼ばれたなら、今 render している Lane
2. `startTransition` の中なら、Transition の Lane（[10章](./transitions)）
3. それ以外なら、[`resolveUpdatePriority`](react:react-dom-bindings/src/client/ReactDOMUpdatePriority.js#L35-L45) が返す優先度

```js
export function resolveUpdatePriority(): EventPriority {
  const updatePriority = ReactDOMSharedInternals.p; /* currentUpdatePriority */
  if (updatePriority !== NoEventPriority) {
    return updatePriority;
  }
  const currentEvent = window.event;
  if (currentEvent === undefined) {
    return DefaultEventPriority;
  }
  return getEventPriority(currentEvent.type);
}
```

React のイベントハンドラーの中では、`dispatchDiscreteEvent` が設定した優先度が使われます。`setTimeout` や `fetch` の続きのようにイベントの外で呼ぶと、`window.event` がないので Default になります。

UC1 の `onKeyDown` で呼ぶ `setFocusedIndex` は、`SyncLane` の更新です。

## 更新は microtask でまとめて処理される

[2章](./hooks-and-state)で見たとおり、`setState` は最後に [`ensureRootIsScheduled`](react:react-reconciler/src/ReactFiberRootScheduler.js#L116-L169) を呼びます。この関数は root を予約の一覧に入れ、microtask を1回だけ予約します。

[`scheduleImmediateRootScheduleTask`](react:react-reconciler/src/ReactFiberRootScheduler.js#L650-L696) が予約する microtask は、DOM では `queueMicrotask` です（[`ReactFiberConfigDOM.js` 871行](react:react-dom-bindings/src/client/ReactFiberConfigDOM.js#L871-L876)）。

microtask の中では、[`processRootScheduleInMicrotask`](react:react-reconciler/src/ReactFiberRootScheduler.js#L259-L348) が root ごとに次の仕事を決めます。決め方は [`scheduleTaskForRootDuringMicrotask`](react:react-reconciler/src/ReactFiberRootScheduler.js#L384-L510) にあります。

```js
if (
  includesSyncLane(nextLanes) &&
  !checkIfRootIsPrerendering(root, nextLanes)
) {
  // Synchronous work is always flushed at the end of the microtask, so we
  // don't need to schedule an additional task.
  if (existingCallbackNode !== null) {
    cancelCallback(existingCallbackNode);
  }
  root.callbackPriority = SyncLane;
  root.callbackNode = null;
  return SyncLane;
} else {
  // ...
  const newCallbackNode = scheduleCallback(
    schedulerPriorityLevel,
    performWorkOnRootViaSchedulerTask.bind(null, root),
  );
```

| 一番優先度の高い Lane     | 処理する場所                                |
| ------------------------- | ------------------------------------------- |
| `SyncLane`                | この microtask の最後に、同期で render する |
| `InputContinuousLane`     | Scheduler のタスク（UserBlocking）          |
| `DefaultLane`、Transition | Scheduler のタスク（Normal）                |
| `IdleLane`                | Scheduler のタスク（Idle）                  |

`SyncLane` の更新は、microtask の最後の [`flushSyncWorkAcrossRoots_impl`](react:react-reconciler/src/ReactFiberRootScheduler.js#L185-L247) で render されます。UC1 の記録で `Run microtasks` の下に render が並ぶのは、この流れです。

### 何度 setState しても render は1回

ハンドラーの中で `setState` を何回呼んでも、予約される microtask は1つです。render はその中で1回だけ行われます。React 17 までは、React のイベントの外で呼んだ `setState` がまとまりませんでしたが、19 ではどこで呼んでも microtask でまとまります。

例外は、制御された `<input>` の `onChange` です。DOM の値を元に戻す必要があるときだけ、イベントの処理が終わる時点で同期の更新を先に処理します（[`ReactDOMUpdateBatching.js` 27〜44行](react:react-dom-bindings/src/events/ReactDOMUpdateBatching.js#L27-L44)）。

## Sync と Default の更新は、途中で止まらない

render を始めるときに、[`performWorkOnRoot`](react:react-reconciler/src/ReactFiberWorkLoop.js#L1168-L1181) が、止められる render にするかどうかを決めます。

```js
const shouldTimeSlice =
  (!forceSync &&
    !includesBlockingLane(lanes) &&
    !includesExpiredLane(root, lanes)) ||
  // If we're prerendering, then we should use the concurrent work loop
  // even if the lanes are synchronous, so that prerendering never blocks
  // the main thread.
  checkIfRootIsPrerendering(root, lanes);

let exitStatus: RootExitStatus = shouldTimeSlice
  ? renderRootConcurrent(root, lanes)
  : renderRootSync(root, lanes, true);
```

[`includesBlockingLane`](react:react-reconciler/src/ReactFiberLane.js#L684-L694) が真になるのは、Sync、InputContinuous、Default のどれかを含むときです。つまり、**普通の `setState` は、Scheduler のタスクから始まった場合でも、最後まで止まらずに render されます**。止められるのは、`startTransition` や `useDeferredValue` による更新だけです。

## 計測で確かめる

- **UC1 の `bad`:** Bottom-up で `Tile` の呼び出し元をたどると、`processRootScheduleInMicrotask` → `flushSyncWorkAcrossRoots_impl` → `performSyncWorkOnRoot` の順に並びます。キー入力の `SyncLane` の更新を、microtask の中で同期に render している形です。
- **Event Timing の値:** この microtask は `keydown` のハンドラーが戻った直後に実行されるので、render の時間は Event Timing の「処理」（Processing duration）に入ります。UC1 の `bad` では、処理が 126.9ms でした。
- **UC3 の `bad`:** 検索を `input` イベントの中で同期に行うので、検索の時間がそのまま入力の処理時間になります。`useDeferredValue` で優先度を下げた `deferred` の動きは、[10章](./transitions)で扱います。
