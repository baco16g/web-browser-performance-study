# 1. 全体像: render と commit、Fiber

この章では、React が画面を更新するときの大きな流れと、その中心にある Fiber というデータ構造を説明します。2章以降は、この章の流れのどこかを詳しく見ていきます。

## 画面の更新は render と commit の2段階

React の更新は、次の2段階に分かれています。

| 段階   | すること                                             | DOM        | 途中で止められるか                                   |
| ------ | ---------------------------------------------------- | ---------- | ---------------------------------------------------- |
| render | コンポーネントの関数を呼び、次の画面の内容を計算する | 触らない   | 優先度の低い更新なら止められる（[4章](./scheduler)） |
| commit | 計算した結果を DOM に反映し、effect を実行する       | 書き換える | 止められない                                         |

render が DOM に触らないのは、途中で捨てたりやり直したりできるようにするためです。commit は一度始まると最後まで同期で進みます。

Performance パネルの React のトラックで `Render` と `Commit` が分かれて表示されるのは、この2段階に対応しています。

## Fiber は、コンポーネント1つ分の作業単位

React は、コンポーネントや DOM 要素の1つ1つを Fiber というオブジェクトで表します。[`FiberNode`](react:react-reconciler/src/ReactFiber.js#L134-L207) のフィールドのうち、性能に関係するものは次のとおりです。

| フィールド                      | 中身                                                                   |
| ------------------------------- | ---------------------------------------------------------------------- |
| `tag`                           | 種類。関数コンポーネント、DOM 要素、`memo` など                        |
| `type`、`key`                   | コンポーネントの関数や DOM の要素名と、`key`                           |
| `stateNode`                     | DOM 要素など、実体への参照                                             |
| `return`、`child`、`sibling`    | 親、最初の子、次の兄弟                                                 |
| `pendingProps`、`memoizedProps` | 今回の props と、前回確定した props                                    |
| `memoizedState`                 | 関数コンポーネントなら Hook のリスト（[2章](./hooks-and-state)）       |
| `flags`、`subtreeFlags`         | 自分と子孫に、commit でする仕事があるか                                |
| `lanes`、`childLanes`           | 自分と子孫に、render でする仕事があるか（[3章](./scheduling-updates)） |
| `alternate`                     | 対になるもう1つの Fiber                                                |

木は `child` と `sibling` でつながっています。子の一覧は配列ではなく、最初の子から `sibling` をたどる片方向のリストです。この形は、[5章](./bailout)で扱う「兄弟を1件ずつ確認する費用」に関係します。

`flags` と `childLanes` は、子孫の分を親に集めてあります。render と commit は、この集約を見て「この下には仕事がない」と分かった部分木を丸ごと飛ばします。

## Fiber は2組を交互に使う

React は、画面に出ている木（current）と、次の画面を計算している木（work in progress）の2組を持っています。対になる Fiber は `alternate` で結ばれています。

[`createWorkInProgress`](react:react-reconciler/src/ReactFiber.js#L323-L437) は、すでに `alternate` があれば新しく作らずに使い回します。

```js
export function createWorkInProgress(current: Fiber, pendingProps: any): Fiber {
  let workInProgress = current.alternate;
  if (workInProgress === null) {
    // We use a double buffering pooling technique ...
    workInProgress = createFiber(
      current.tag,
      pendingProps,
      current.key,
      current.mode,
    );
    // ...
    workInProgress.alternate = current;
    current.alternate = workInProgress;
  } else {
    workInProgress.pendingProps = pendingProps;
    // ...
  }
```

一度でも更新された Fiber は、2つのオブジェクトを交互に使うので、更新のたびに作り直されません。逆に、初めて更新されるときは `alternate` を新しく作ります。UC1 で1回目のキー入力が少し遅かったのは、3000件分の `alternate` をこのとき作るためと考えられます。

commit の途中で、計算し終えた木が画面の木になります。

[`ReactFiberWorkLoop.js` 4047〜4052行](react:react-reconciler/src/ReactFiberWorkLoop.js#L4047-L4052)

```js
// The work-in-progress tree is now the current tree. This must come after
// the mutation phase, so that the previous tree is still current during
// componentWillUnmount, but before the layout phase, so that the finished
// work is current during componentDidMount/Update.
root.current = finishedWork;
```

木を入れ替える処理は、ポインタを1つ代入するだけです。

## render は「下りて、上る」をループで繰り返す

render は、Fiber を1つずつ処理するループです。同期で進める [`workLoopSync`](react:react-reconciler/src/ReactFiberWorkLoop.js#L2770-L2777) は、途中で止まりません。

```js
// The work loop is an extremely hot path. Tell Closure not to inline it.
/** @noinline */
function workLoopSync() {
  // Perform work without checking if we need to yield between fiber.
  while (workInProgress !== null) {
    performUnitOfWork(workInProgress);
  }
}
```

1つの Fiber の処理（[`performUnitOfWork`](react:react-reconciler/src/ReactFiberWorkLoop.js#L3081-L3123)）は、次の2つでできています。

1. **`beginWork` で下りる:** コンポーネントの関数を呼び、子の Fiber を作る。子があれば子へ進む
2. **`completeWork` で上る:** 子がなくなったら完了の処理をし、兄弟があれば兄弟へ、なければ親へ戻る（[`completeUnitOfWork`](react:react-reconciler/src/ReactFiberWorkLoop.js#L3368-L3431)）

```js
const siblingFiber = completedWork.sibling;
if (siblingFiber !== null) {
  // If there is more work to do in this returnFiber, do that next.
  workInProgress = siblingFiber;
  return;
}
// Otherwise, return to the parent
completedWork = returnFiber;
```

再帰を使わずにループで木をたどるので、深い木でもコールスタックが伸びません。また、Fiber と Fiber の間で処理を止められます。止める判定をするのは、優先度の低い更新で使う [`workLoopConcurrentByScheduler`](react:react-reconciler/src/ReactFiberWorkLoop.js#L3072-L3079) だけです（[4章](./scheduler)）。

### React 19 では、DOM の差分は commit で計算する

`completeWork` は、DOM 要素の Fiber について次のことをします。

- **初めて作るとき:** DOM 要素を作り、子孫の DOM 要素をつなげる。この時点ではまだ document に入れない
- **更新のとき:** props のオブジェクトが前回と同じかどうかだけを比べ、違えば「更新あり」の印を付ける

[`ReactFiberCompleteWork.js` 463〜482行](react:react-reconciler/src/ReactFiberCompleteWork.js#L463-L482)

```js
const oldProps = current.memoizedProps;
if (oldProps === newProps) {
  // In mutation mode, this is sufficient for a bailout because
  // we won't touch this node even if children changed.
  return;
}
markUpdate(workInProgress);
```

属性1つ1つの差分は、commit で [`updateProperties`](react:react-dom-bindings/src/client/ReactDOMComponent.js#L1518) が計算します。React 18 では render の中で差分を計算していましたが、19 では commit に移りました。

## commit は決まった順番で進む

commit は、[`commitRoot`](react:react-reconciler/src/ReactFiberWorkLoop.js#L3725) から次の順に進みます。

1. **before mutation:** DOM を書き換える前の準備
2. **mutation:** DOM を書き換える。属性の差分の計算もここ
3. **木の入れ替え:** `root.current = finishedWork`
4. **layout:** `useLayoutEffect` と ref の設定
5. **passive:** `useEffect`。キー入力などではこの場で、それ以外では描画のあとに実行する

1〜4は同じタスクの中で続けて実行されます（[3914〜3921行](react:react-reconciler/src/ReactFiberWorkLoop.js#L3914-L3921)）。5がいつ実行されるかは、性能に大きく関わります。詳しくは[8章](./commit-and-effects)で扱います。

## 計測で確かめる

UC1 の `bad` で1回キーを押し、Performance パネルの Bottom-up で `Tile` の呼び出し元をたどると、次の順に並びます。

```text
Event: keydown
└ Run microtasks
  └ processRootScheduleInMicrotask     … 3章: microtask で更新を処理する
    └ flushSyncWorkAcrossRoots_impl
      └ performSyncWorkOnRoot
        └ performWorkOnRoot            … 4章: 同期か、止められるかを決める
          └ renderRootSync
            └ workLoopSync             … この章: 止まらないループ
              └ performUnitOfWork
                └ beginWork            … 5章: render を省けるかを判断する
                  └ updateFunctionComponent
                    └ renderWithHooks  … 2章: コンポーネントの関数を呼ぶ
                      └ Tile
```

関数名と章の対応は、[付録の対応表](./appendix-names)にまとめています。
