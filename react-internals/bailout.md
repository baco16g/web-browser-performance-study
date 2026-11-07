# 5. render を省く仕組み（bailout）

この章では、親が render すると子も render される理由と、React が render を省く条件を確かめます。React のソースでは、render を省くことを bailout と呼びます。

関係する教材は UC1 です。`bad` では1回のキー入力で `Tile` が3000回 render され、外部ストアを使う `store` でも、件数に比例する処理が残りました。

## beginWork は、props を参照で比べる

[`beginWork`](react:react-reconciler/src/ReactFiberBeginWork.js#L4250-L4295) は、最初に「この Fiber に更新があるか」を判断します。

```js
if (current !== null) {
  const oldProps = current.memoizedProps;
  const newProps = workInProgress.pendingProps;

  if (
    oldProps !== newProps ||
    hasLegacyContextChanged() ||
    // Force a re-render if the implementation changed due to hot reload:
    (__DEV__ ? workInProgress.type !== current.type : false)
  ) {
    didReceiveUpdate = true;
  } else {
    const hasScheduledUpdateOrContext = checkScheduledUpdateOrContext(
      current,
      renderLanes,
    );
    if (
      !hasScheduledUpdateOrContext &&
      (workInProgress.flags & DidCapture) === NoFlags
    ) {
      // No pending updates or context. Bail out now.
      didReceiveUpdate = false;
      return attemptEarlyBailoutIfNoScheduledUpdate(
        current,
        workInProgress,
        renderLanes,
      );
    }
    // ...
```

props は `!==` で比べるだけで、中身は見ません。`hasLegacyContextChanged()` は、19 では古い Context API が無効なので常に `false` です。

**親が render すると、子の props は必ず新しいオブジェクトになります。** JSX は render のたびに新しい props のオブジェクトを作るからです（[6章](./reconciliation)）。そのため子では `oldProps !== newProps` が成り立ち、子も render されます。UC1 の `bad` で、`StateGrid` の render が3000件の `Tile` に広がったのはこのためです。

逆に、親が前回と同じ要素オブジェクトを渡せば、子の props は同じ参照のままです。親から `children` として受け取った要素をそのまま描くと、親が render しても子は render されないのは、この比較で説明できます。

## 更新のない Fiber は、関数を呼ばずに省く

props が同じなら、[`checkScheduledUpdateOrContext`](react:react-reconciler/src/ReactFiberBeginWork.js#L3939-L3956) で、その Fiber 自身に更新があるかを確かめます。

```js
function checkScheduledUpdateOrContext(
  current: Fiber,
  renderLanes: Lanes,
): boolean {
  const updateLanes = current.lanes;
  if (includesSomeLane(updateLanes, renderLanes)) {
    return true;
  }
  // No pending update, but because context is propagated lazily, we need
  // to check for a context change before we bail out.
  const dependencies = current.dependencies;
  if (dependencies !== null && checkIfContextChanged(dependencies)) {
    return true;
  }
  return false;
}
```

自分の `lanes` に今回の Lane がなく、読んでいる Context の値も変わっていなければ、コンポーネントの関数を呼ばずに省きます。

## 子孫にも仕事がなければ、部分木ごと飛ばす

省くときは、[`bailoutOnAlreadyFinishedWork`](react:react-reconciler/src/ReactFiberBeginWork.js#L3826-L3865) が子孫を見ます。

```js
// Check if the children have any pending work.
if (!includesSomeLane(renderLanes, workInProgress.childLanes)) {
  if (current !== null) {
    // Before bailing out, check if there are any context changes in
    // the children.
    lazilyPropagateParentContextChanges(current, workInProgress, renderLanes);
    if (!includesSomeLane(renderLanes, workInProgress.childLanes)) {
      return null;
    }
  } else {
    return null;
  }
}

// This fiber doesn't have work, but its subtree does. Clone the child
// fibers and continue.
cloneChildFibers(current, workInProgress);
return workInProgress.child;
```

`childLanes` は、[2章](./hooks-and-state)で見た「この下に仕事がある」という印です。今回の Lane が含まれていなければ `null` を返し、部分木全体を一度も訪れずに飛ばします。

## 子孫に仕事があれば、兄弟を1件ずつ確かめる

子孫に仕事がある場合は、[`cloneChildFibers`](react:react-reconciler/src/ReactChildFiber.js#L2120-L2146) で子の Fiber を作り直します。

```js
let currentChild = workInProgress.child;
let newChild = createWorkInProgress(currentChild, currentChild.pendingProps);
workInProgress.child = newChild;

newChild.return = workInProgress;
while (currentChild.sibling !== null) {
  currentChild = currentChild.sibling;
  newChild = newChild.sibling = createWorkInProgress(currentChild, currentChild.pendingProps);
  newChild.return = workInProgress;
}
newChild.sibling = null;
```

仕事があるのが1件だけでも、`sibling` をたどって**すべての兄弟**の Fiber を用意します。作り直した兄弟は、そのあとワークループで1件ずつ `beginWork` に入り、props が同じで仕事もないことを確かめてから省かれます。

React 自身も、この動きをコメントに書いています（[`ReactFiberNewContext.js` 497〜502行](react:react-reconciler/src/ReactFiberNewContext.js#L497-L502)）。

```js
// NOTE: This optimization is only necessary because we sometimes enter the
// begin phase of nodes that don't have any work scheduled on them —
// specifically, the siblings of a node that _does_ have scheduled work. The
// siblings will bail out and call this function again, even though we already
// propagated content changes to it and its subtree. So we use this flag to
// mark that the parent providers already propagated.
```

1件ずつの費用は小さいものの、**更新の費用は、更新されたコンポーネントの数だけでは決まりません**。root から更新された Fiber までの道のりで、各階層の兄弟の数だけ確認の処理が加わります。

## 関数を呼んだあとで省く場合もある

props は同じでも、その Fiber に `setState` の更新があれば、関数を呼びます。新しい state が前の値と同じなら、子の render を省きます（[2章](./hooks-and-state)の2段階目）。この場合、関数の実行の費用はかかり、省けるのは子の処理だけです。

## Context は memo を通り抜ける

19.3.1 の Context は、値が変わったことを、必要になったときにだけ調べます（lazy propagation）。Provider の Fiber は新しい値を設定して子に進むだけで、値を比べたり、読んでいるコンポーネントを探したりはしません（[`updateContextProvider`](react:react-reconciler/src/ReactFiberBeginWork.js#L3719-L3744)）。

比べるのは、子孫が render を省こうとしたときです。

- **自分で読んでいる場合:** `checkScheduledUpdateOrContext` が、前回読んだ値と今の値を `Object.is` で比べます（[`checkIfContextChanged`](react:react-reconciler/src/ReactFiberNewContext.js#L515-L537)）。変わっていれば render します
- **子孫が読んでいる場合:** `bailoutOnAlreadyFinishedWork` の中の `lazilyPropagateParentContextChanges` が、祖先の Provider の値の変化を見つけ、読んでいる子孫に印を付けます。印が付くと、部分木を飛ばさずに下りていきます

`memo` は props の比較を省くだけで、Context の変化は止めません。Provider の `value` に毎回新しいオブジェクトを渡すと、その Context を読むコンポーネントはすべて render されます。

## 省けるかどうかの早見表

| 状況                                               | その Fiber の関数 | 子孫                            |
| -------------------------------------------------- | ----------------- | ------------------------------- |
| props が新しいオブジェクト                         | 呼ぶ              | 処理する                        |
| props が同じ。自分にも子孫にも仕事がない           | 呼ばない          | 飛ばす                          |
| props が同じ。子孫にだけ仕事がある                 | 呼ばない          | 兄弟を1件ずつ確かめながら下りる |
| props が同じ。自分に更新があり、state が変わらない | 呼ぶ              | 処理しない                      |
| 読んでいる Context の値が変わった                  | 呼ぶ              | 処理する                        |

## 計測で確かめる

UC1 の3つの実装を、この章の言葉で説明すると次のようになります。

| 実装    | 起きていること                                                                               |
| ------- | -------------------------------------------------------------------------------------------- |
| `bad`   | 親の `StateGrid` が render し、3000件の `Tile` が新しい props を受け取って全部 render される |
| `memo`  | 親は render するが、`memo` が props を比べて2998件を省く（[7章](./memoization)）             |
| `store` | 親は render しない。ただし更新された2件にたどり着くまでに、3000件の兄弟を1件ずつ確かめて省く |

圧縮なしの本番ビルドを CPU 4倍で記録すると、30,000件の `store` では `bailoutOnAlreadyFinishedWork` の Self time が入力1回あたり 9.40ms ありました。兄弟を確かめる処理が、件数に比例して残ることが分かります。
