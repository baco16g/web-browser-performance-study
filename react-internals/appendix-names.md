# 付録: Performance パネルに出る名前の対応表

Chrome の Performance パネルで React のアプリを記録したときに、Bottom-up や Call tree に出る主な名前を、処理の順に並べました。名前は React 19.3.1 のものです。圧縮したビルドではソースマップで元の名前に戻ります（React のトラックの名前は戻りません。[11章](./profiling)）。

## ブラウザが付ける名前

| 名前                          | 意味                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------- |
| `Event: keydown` など         | ブラウザがイベントを処理しているところ                                                      |
| `Run microtasks`              | microtask の実行。React の `SyncLane` の render はここに入る（[3章](./scheduling-updates)） |
| `Function call`               | JavaScript の関数の呼び出し                                                                 |
| `Layout`、`Recalculate style` | ブラウザのレイアウトとスタイルの計算。JavaScript の途中で出るなら、強制されたもの           |
| `Minor GC`、`Major GC`        | ガベージコレクション                                                                        |

## イベントから render の開始まで

| 名前                                                 | 意味                                                   | 章                        |
| ---------------------------------------------------- | ------------------------------------------------------ | ------------------------- |
| `dispatchDiscreteEvent`                              | クリックやキー入力の優先度を設定してイベントを処理する | [3](./scheduling-updates) |
| `dispatchEvent`、`dispatchEventForPluginEventSystem` | React のイベントの仕組みでハンドラーを呼ぶ             | [3](./scheduling-updates) |
| `dispatchSetState`                                   | `setState` の実体。更新を積んで予約する                | [2](./hooks-and-state)    |
| `processRootScheduleInMicrotask`                     | microtask の中で、root ごとに次の仕事を決める          | [3](./scheduling-updates) |
| `flushSyncWorkAcrossRoots_impl`                      | `SyncLane` の仕事を同期で処理する                      | [3](./scheduling-updates) |
| `performSyncWorkOnRoot`                              | 同期の render を始める                                 | [3](./scheduling-updates) |
| `performWorkOnRootViaSchedulerTask`                  | Scheduler のタスクから render を始める                 | [4](./scheduler)          |
| `performWorkUntilDeadline`                           | Scheduler が `MessageChannel` のタスクで仕事を進める   | [4](./scheduler)          |

## render

| 名前                                                    | 意味                                            | 章                        |
| ------------------------------------------------------- | ----------------------------------------------- | ------------------------- |
| `performWorkOnRoot`                                     | 止められる render にするかを決める              | [3](./scheduling-updates) |
| `renderRootSync`、`workLoopSync`                        | 止まらない render                               | [1](./overview)           |
| `renderRootConcurrent`、`workLoopConcurrentByScheduler` | 約5ms ごとに区切る render                       | [4](./scheduler)          |
| `prepareFreshStack`                                     | render を最初から始める準備。中断のあとにも出る | [10](./transitions)       |
| `performUnitOfWork`                                     | Fiber 1つ分の処理                               | [1](./overview)           |
| `beginWork`                                             | Fiber に下りる処理。render を省けるか判断する   | [5](./bailout)            |
| `updateFunctionComponent`                               | 関数コンポーネントの処理                        | [2](./hooks-and-state)    |
| `renderWithHooks`                                       | コンポーネントの関数を呼ぶ                      | [2](./hooks-and-state)    |
| `updateSimpleMemoComponent`、`updateMemoComponent`      | `memo` の比較                                   | [7](./memoization)        |
| `shallowEqual`                                          | props の浅い比較                                | [7](./memoization)        |
| `bailoutOnAlreadyFinishedWork`                          | render を省く。子孫に仕事があれば兄弟を作り直す | [5](./bailout)            |
| `reconcileChildFibers`、`reconcileChildrenArray`        | 子の要素と前回の Fiber を突き合わせる           | [6](./reconciliation)     |
| `updateSlot`、`updateElement`                           | 子1件ずつの `key` と型の比較                    | [6](./reconciliation)     |
| `createWorkInProgress`                                  | 対になる Fiber を用意する                       | [1](./overview)           |
| `jsxProd`                                               | JSX の要素を作る                                | [6](./reconciliation)     |
| `completeUnitOfWork`、`completeWork`                    | Fiber から上る処理。DOM 要素を作る              | [1](./overview)           |
| `bubbleProperties`                                      | 子孫の印と時間を親に集める                      | [11](./profiling)         |

## commit と effect

| 名前                                                   | 意味                                                            | 章                        |
| ------------------------------------------------------ | --------------------------------------------------------------- | ------------------------- |
| `completeRoot`、`commitRoot`                           | commit の始まり                                                 | [8](./commit-and-effects) |
| `flushMutationEffects`、`commitMutationEffectsOnFiber` | DOM の書き換え                                                  | [8](./commit-and-effects) |
| `commitHostUpdate`、`commitUpdate`                     | DOM 要素1つの更新                                               | [8](./commit-and-effects) |
| `updateProperties`、`setValueForStyles`                | 属性と `style` の差分を計算して書き込む                         | [8](./commit-and-effects) |
| `flushLayoutEffects`、`commitLayoutEffects`            | `useLayoutEffect` と ref                                        | [8](./commit-and-effects) |
| `flushSpawnedWork`                                     | commit の後処理。`SyncLane` なら `useEffect` もここから実行する | [8](./commit-and-effects) |
| `flushPassiveEffects`、`commitPassiveMountEffects`     | `useEffect` の実行                                              | [8](./commit-and-effects) |
| `isRenderConsistentWithExternalStores`                 | 外部ストアの値の食い違いを確かめる                              | [9](./external-store)     |
