# 11. 計測の仕組み: Profiler と React のトラック

この章では、React の `<Profiler>` が報告する時間と、Performance パネルの React のトラックがどう作られているかを確かめます。値の作られ方を知ると、どの値を信じてよいか、何と比べてはいけないかが分かります。

関係する教材は UC1 です。

## 計測のコードがあるのは、開発ビルドとプロファイリングビルドだけ

計測の処理は、`enableProfilerTimer` というフラグで切り替わります（[`ReactFeatureFlags.js` 242行](react:shared/ReactFeatureFlags.js#L242)）。

```js
export const enableProfilerTimer = __PROFILE__;
```

`__PROFILE__` はビルドの種類で決まる値です。ビルドの設定はこの解説の範囲外ですが、UC1 で測った結果は次のとおりでした。

| ビルド           | `onRender` が呼ばれたか | React のトラック |
| ---------------- | ----------------------- | ---------------- |
| 本番             | 呼ばれない              | 出ない           |
| プロファイリング | 呼ばれる                | 出る             |
| 開発             | 呼ばれる                | 出る             |

本番ビルドでは、計測のための処理そのものが動きません。

### どの Fiber を計時するか

計時するのは、`ProfileMode` の印が付いた Fiber だけです（[`ReactFiber.js` 543〜547行](react:react-reconciler/src/ReactFiber.js#L543-L547)）。

```js
if (__DEV__ || (enableProfilerTimer && isDevToolsPresent)) {
  // dev: Enable profiling instrumentation by default.
  // profile: enabled if DevTools is present or subtree is wrapped in <Profiler>.
  // production: disabled.
  mode |= ProfileMode;
}
```

| ビルド           | 計時する範囲                                                          |
| ---------------- | --------------------------------------------------------------------- |
| 開発             | すべての Fiber                                                        |
| プロファイリング | React DevTools が入っていればすべて。なければ `<Profiler>` の内側だけ |

React DevTools が入っているかは、React が読み込まれた時点の `__REACT_DEVTOOLS_GLOBAL_HOOK__` の有無で決まります（[`ReactFiberDevToolsHook.js` 47〜48行](react:react-reconciler/src/ReactFiberDevToolsHook.js#L47-L48)）。拡張機能の有無で計時する範囲が変わり、そのぶん計測の負荷も変わります。

## 時間は beginWork の前後で測る

[`performUnitOfWork`](react:react-reconciler/src/ReactFiberWorkLoop.js#L3088-L3101) は、`ProfileMode` の Fiber について、`beginWork` の前後で時刻を取ります。

```js
if (enableProfilerTimer && (unitOfWork.mode & ProfileMode) !== NoMode) {
  startProfilerTimer(unitOfWork);
  // ...
  next = beginWork(current, unitOfWork, entangledRenderLanes);
  stopProfilerTimerIfRunningAndRecordDuration(unitOfWork);
}
```

[`ReactProfilerTimer.js` 605〜617行](react:react-reconciler/src/ReactProfilerTimer.js#L605-L617)

```js
export function stopProfilerTimerIfRunningAndRecordDuration(
  fiber: Fiber,
): void {
  if (!enableProfilerTimer) {
    return;
  }

  if (profilerStartTime >= 0) {
    const elapsedTime = now() - profilerStartTime;
    fiber.actualDuration += elapsedTime;
    fiber.selfBaseDuration = elapsedTime;
    profilerStartTime = -1;
  }
}
```

| 値                 | 意味                                                      |
| ------------------ | --------------------------------------------------------- |
| `actualDuration`   | 今回の render で実際にかかった時間。足し上げる            |
| `selfBaseDuration` | その Fiber の、直近の `beginWork` 1回分の時間。上書きする |

時計は Scheduler の `unstable_now` で、ブラウザでは `performance.now()` です（[`ReactProfilerTimer.js` 41〜43行](react:react-reconciler/src/ReactProfilerTimer.js#L41-L43)）。Performance パネルと同じ時間軸に乗ります。

### render を省いた Fiber は、前回の値を持ち続ける

render を省いたとき（[5章](./bailout)）は、`bailoutOnAlreadyFinishedWork` が計時を止めるだけで、時間を記録しません（[`stopProfilerTimerIfRunning`](react:react-reconciler/src/ReactProfilerTimer.js#L598-L603)）。`selfBaseDuration` は、[1章](./overview)の `createWorkInProgress` で前回の値がコピーされたまま残ります。

UC1 で、React が内部に持つ値を更新ごとに読み出して確かめました（プロファイリングビルド、CPU 4倍）。

| 観察                                             | `bad`            | `memo`         |
| ------------------------------------------------ | ---------------- | -------------- |
| 更新のたびに `selfBaseDuration` が変わったタイル | 約700件          | 1〜2件         |
| 最初の render で遅かったタイル（1.2〜2.8ms）     | 次の更新で消えた | 更新後も残った |
| 先頭のタイルの最初の render                      | 24.8ms           | 25.5ms         |

`memo` で省かれたタイルは、ページを開いたときの値を持ち続けていました。

### 子の時間を親に集める

完了の処理で、[`bubbleProperties`](react:react-reconciler/src/ReactFiberCompleteWork.js#L793-L899) が子の時間を親に足し上げます。

```js
let actualDuration = completedWork.actualDuration;
let treeBaseDuration = completedWork.selfBaseDuration as any as number;

let child = completedWork.child;
while (child !== null) {
  // ...
  actualDuration += child.actualDuration;
  treeBaseDuration += child.treeBaseDuration;
  child = child.sibling;
}
```

`treeBaseDuration` は「子孫の `selfBaseDuration` の合計」で、`<Profiler>` の `onRender` では `baseDuration` として渡されます。render を省いた子孫の古い値も合計に入るので、**`baseDuration` は今回測った時間ではなく、最後に render したときの時間を集めた見積もり**です。UC1 の `memo` の `baseDuration`（129.0ms）が、`bad` の実際の時間（117.7ms）より大きく出たのはこのためです。

## onRender は commit の layout の段階で呼ばれる

`<Profiler>` の `onRender` は、commit の layout の段階で、同期で呼ばれます（[`commitProfiler`](react:react-reconciler/src/ReactFiberCommitEffects.js#L936-L970)）。

```js
let phase: ProfilerPhase = current === null ? 'mount' : 'update';
if (enableProfilerNestedUpdatePhase) {
  if (isCurrentUpdateNested()) {
    phase = 'nested-update';
  }
}

if (typeof onRender === 'function') {
  onRender(
    id,
    phase,
    finishedWork.actualDuration,
    finishedWork.treeBaseDuration,
    finishedWork.actualStartTime,
    commitStartTime,
  );
}
```

`onRender` の中で重い処理をすると、commit の時間が延びます。`phase` が `'nested-update'` になるのは、layout effect などの中で予約された更新、つまり commit の途中で起きた連鎖の更新です。

## Performance パネルの React のトラック

React 19.2 から、プロファイリングビルドと開発ビルドでは、Performance パネルに React のトラックが出ます。書き込みには `console.timeStamp` を使います（[`ReactFiberPerformanceTrack.js` 42〜55行](react:react-reconciler/src/ReactFiberPerformanceTrack.js#L42-L55)）。

```js
const supportsUserTiming =
  enableProfilerTimer &&
  typeof console !== 'undefined' &&
  typeof console.timeStamp === 'function' &&
  // ...

const COMPONENTS_TRACK = 'Components ⚛';
const LANES_TRACK_GROUP = 'Scheduler ⚛';
```

### Scheduler のトラック: 更新の段階

`Scheduler ⚛` のグループには、Lane の種類ごとのトラック（`Blocking`、`Transition`、`Suspense`、`Idle`）があり、更新の段階が並びます。

| 表示                  | 意味                                                                                                                                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `Event: keydown` など | 更新のきっかけになったイベント                                                                                                         |
| `Update`              | `setState` から render が始まるまで                                                                                                    |
| `Update Blocked`      | `setState` から render が始まるまでに 5ms を超えた（[740〜753行](react:react-reconciler/src/ReactFiberPerformanceTrack.js#L740-L753)） |
| `Cascading Update`    | commit の途中や effect の中で起きた連鎖の更新                                                                                          |
| `Render`              | render の段階                                                                                                                          |
| `Commit`              | commit の段階                                                                                                                          |
| `Remaining Effects`   | `useEffect` の段階                                                                                                                     |
| `Teared Render`       | 外部ストアの食い違いで render し直した（[9章](./external-store)）                                                                      |

段階のトラックは、`<Profiler>` や React DevTools がなくても、プロファイリングビルドなら出ます。

### Components のトラック: コンポーネントごとの render

`Components ⚛` には、コンポーネントごとの render の時間が出ます。記録するのは commit のあとの passive の段階で、`ProfileMode` が付き、実際に render した Fiber だけです（[`ReactFiberCommitWork.js` 3881〜3899行](react:react-reconciler/src/ReactFiberCommitWork.js#L3881-L3899)）。

```js
if (
  enableProfilerTimer &&
  enableComponentPerformanceTrack &&
  (finishedWork.mode & ProfileMode) !== NoMode &&
  (finishedWork.actualStartTime as any as number) > 0 &&
  (finishedWork.flags & PerformedWork) !== NoFlags
) {
  logComponentRender(
```

- **色:** 自身の時間で決まります。0.5ms 未満は薄く、10ms 未満は標準、100ms 未満は濃く、それ以上は警告の色です（[242〜254行](react:react-reconciler/src/ReactFiberPerformanceTrack.js#L242-L254)）。
- **effect:** そのコンポーネントの effect の合計が 0.05ms を超えたか、effect の中で更新を起こしたときだけ出ます（[`ReactFiberCommitWork.js` 900行](react:react-reconciler/src/ReactFiberCommitWork.js#L900)）。
- **名前:** `displayName`、なければ関数の `name` を使います（[`getComponentNameFromFiber`](react:react-reconciler/src/getComponentNameFromFiber.js#L151-L161)）。圧縮したビルドでは、圧縮後の1文字の名前がそのまま出ます。ソースマップでは戻りません。この教材では、プロファイリングビルドだけ関数名を残す設定（Rolldown の `keepNames`）にして、`Tile` などの名前で表示されるようにしました。

## 計測するときの注意

教材で実際に測って分かった注意点です。

| 注意点                                                                 | 実測                                                                          |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 開発ビルドは StrictMode で関数を2回呼ぶ                                | UC1 の `bad` で render 回数が 6000、次フレームまで 620.6ms（本番は 138.0ms）  |
| プロファイリングビルドは、CDP の `Performance.enable` で大きく遅くなる | 157.4ms が 330.7ms に（本番ビルドは 141.1ms が 151.0ms）。理由は未確認        |
| `selfBaseDuration` の1件ずつの値は粗い                                 | 3000件のうち約86%が 0 だった。合計はおおむね使えるが、1件ずつの値は信用しない |
| `baseDuration` は、render を省いた部分の古い値を含む                   | `memo` で 129.0ms と、`bad` の実測より大きく出た                              |

時間を比べるときは本番ビルドを使い、プロファイリングビルドと開発ビルドでは、render の回数と理由、段階の順番を見ます。
