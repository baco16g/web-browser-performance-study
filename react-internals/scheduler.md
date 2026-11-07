# 4. Scheduler と時間分割

この章では、`SyncLane` 以外の更新を処理する Scheduler と、render を約5ms ごとに区切る仕組みを確かめます。区切れるのはどこで、区切れないのはどこかが、この章の中心です。

関係する教材は UC3 と UC4 です。Scheduler は `scheduler` という別のパッケージで、React 19.3.1 には 0.28.0 が付いています。

## Scheduler はタスクを期限の順に並べる

[3章](./scheduling-updates)で見たとおり、`SyncLane` 以外の更新は Scheduler のタスクとして予約されます。Scheduler は、タスクを期限の早い順に並べたキューを持っています（[`Scheduler.js` 78〜80行](react:scheduler/src/forks/Scheduler.js#L78-L80)）。

期限は「登録した時刻 + 優先度ごとの猶予」です（[355〜380行](react:scheduler/src/forks/Scheduler.js#L355-L380)）。

| Scheduler の優先度 | 猶予    | React での主な使い道                               |
| ------------------ | ------- | -------------------------------------------------- |
| UserBlocking       | 250ms   | `InputContinuousLane` の render                    |
| Normal             | 5000ms  | `DefaultLane` と Transition の render、`useEffect` |
| Low                | 10000ms |                                                    |
| Idle               | なし    | `IdleLane` の render                               |

`ImmediatePriority` もありますが、`SyncLane` の render は microtask で行うようになったので、通常の render には使われていません（[`ReactFiberRootScheduler.js` 482〜484行](react:react-reconciler/src/ReactFiberRootScheduler.js#L482-L484)）。

## タスクは MessageChannel で1つずつ実行する

Scheduler は、ブラウザでは `MessageChannel` を使って自分を呼び出します（[530〜561行](react:scheduler/src/forks/Scheduler.js#L530-L561)）。

```js
} else if (typeof MessageChannel !== 'undefined') {
  // DOM and Worker environments.
  // We prefer MessageChannel because of the 4ms setTimeout clamping.
  const channel = new MessageChannel();
  const port = channel.port2;
  channel.port1.onmessage = performWorkUntilDeadline;
  schedulePerformWorkUntilDeadline = () => {
    port.postMessage(null);
  };
```

`setTimeout(0)` を使わないのは、ブラウザが入れる最低 4ms の待ちを避けるためです。`requestAnimationFrame` や `requestIdleCallback` も使っていません。

`postMessage` でメッセージを送ると、ブラウザは `message` イベントを1つのタスクとして実行します。Scheduler は、このタスクの中でキューのタスクを順に実行し、仕事が残っていれば次のメッセージを送ってタスクを終えます（[`performWorkUntilDeadline`](react:scheduler/src/forks/Scheduler.js#L498-L528)）。タスクとタスクの間に、ブラウザは入力の処理や描画ができます。

## 5ms たったら、ブラウザに処理を返す

処理を返すかどうかは [`shouldYieldToHost`](react:scheduler/src/forks/Scheduler.js#L452-L472) が決めます。

```js
// Scheduler periodically yields in case there is other work on the main
// thread, like user events. By default, it yields multiple times per frame.
// It does not attempt to align with frame boundaries, since most tasks don't
// need to be frame aligned; for those that do, use requestAnimationFrame.
let frameInterval: number = frameYieldMs;
let startTime = -1;

function shouldYieldToHost(): boolean {
  if (!enableAlwaysYieldScheduler && enableRequestPaint && needsPaint) {
    // Yield now.
    return true;
  }
  const timeElapsed = getCurrentTime() - startTime;
  if (timeElapsed < frameInterval) {
    // The main thread has only been blocked for a really short amount of time;
    // smaller than a single frame. Don't yield yet.
    return false;
  }
  // Yield now.
  return true;
}
```

`frameYieldMs` は 5 です（[`SchedulerFeatureFlags.js` 11行](react:scheduler/src/SchedulerFeatureFlags.js#L11)）。タスクを始めてから 5ms たったか、commit のあとで描画の機会を求められていれば（[8章](./commit-and-effects)の `requestPaint`）、処理を返します。コメントにあるとおり、フレームの区切りには合わせていません。

## render は Fiber 1つごとに区切りを確かめる

Transition などの止められる render は、[`workLoopConcurrentByScheduler`](react:react-reconciler/src/ReactFiberWorkLoop.js#L3072-L3079) で進みます。

```js
/** @noinline */
function workLoopConcurrentByScheduler() {
  // Perform work until Scheduler asks us to yield
  while (workInProgress !== null && !shouldYield()) {
    performUnitOfWork(workInProgress);
  }
}
```

Fiber を1つ処理するたびに `shouldYield()` を確かめ、5ms を過ぎていればループを抜けます。続きは、Scheduler の次のタスクで、止めた Fiber から再開します（[`renderRootConcurrent`](react:react-reconciler/src/ReactFiberWorkLoop.js#L2785-L2814)）。

近くには、25ms ごとに区切る `workLoopConcurrent` もあります（[3055〜3070行](react:react-reconciler/src/ReactFiberWorkLoop.js#L3055-L3070)）。ただし、これを使うフラグ `enableThrottledScheduling` は `false` なので、19.3.1 の react-dom では使われません。

### 区切れるのは Fiber と Fiber の間だけ

`shouldYield()` を確かめるのは、`while` の条件だけです。1つの Fiber の `beginWork`、つまりコンポーネントの関数1回分の中では止まりません。

UC3 の `deferred` は、`useDeferredValue` で検索結果の render を後回しにします。それでも、連続入力で2文字目が 52.8ms 待たされ、146.0ms の Long Task が残りました。5万件の検索を1つのコンポーネントの中で同期で行っているので、その関数が終わるまで区切りの判定まで進めないからです。

区切れない処理は、ほかにもあります。

| 処理                                                       | 区切れるか                                |
| ---------------------------------------------------------- | ----------------------------------------- |
| 止められる Lane の render（Fiber と Fiber の間）           | 区切れる                                  |
| 1つのコンポーネントの関数の中                              | 区切れない                                |
| `SyncLane`、`InputContinuousLane`、`DefaultLane` の render | 区切れない（[3章](./scheduling-updates)） |
| commit（DOM の書き換えと `useLayoutEffect`）               | 区切れない（[8章](./commit-and-effects)） |
| ブラウザのスタイル計算とレイアウト                         | React の外なので区切れない                |

## 長く待たされた更新は、同期で終わらせる

止められる render は、優先度の高い更新が続くと後回しにされ続けるおそれがあります。これを防ぐため、Lane ごとに期限があります（[`computeExpirationTime`](react:react-reconciler/src/ReactFiberLane.js#L477-L539)）。

| Lane                  | 期限   |
| --------------------- | ------ |
| Sync、InputContinuous | 250ms  |
| Default、Transition   | 5000ms |
| Retry、Idle           | なし   |

期限を過ぎた Lane を含む render は、[`performWorkOnRoot`](react:react-reconciler/src/ReactFiberWorkLoop.js#L1168-L1181) で止められない render に切り替わります。Transition でも、約5秒待たされると、最後まで一気に render されます。

## 計測で確かめる

UC4 の `good` は、最初の数件を描いたあと、残りの行を `startTransition` で描きます。1つ前の `early` は、全件を一度に描きます。CPU 4倍のヘッドレス Chromium で、メインスレッドのタスクを比べました。

| 実装    | React の render                   | 長いタスク                                                                 |
| ------- | --------------------------------- | -------------------------------------------------------------------------- |
| `early` | 137.8ms の1つのタスク             | レイアウト 392.4ms を含む 439.6ms のタスク                                 |
| `good`  | 3〜8ms のタスクが約20件に分かれた | レイアウト 395.0ms を含む 438.9ms のタスクと、React の処理 50.6ms のタスク |

`good` では、render が約5ms ごとに区切られ、間に入力などを処理できる状態になっていました。一方で、ブラウザのレイアウトは、どちらの実装でも約 400ms のまま分割されずに残っています。React の処理 50.6ms のタスクは、区切れない commit を含むと考えられますが、中身までは確かめていません。

時間分割で短くなるのは React の render だけです。何件を描くか、DOM がどれだけ大きいかは変わらないので、その後のレイアウトの費用は残ります。
