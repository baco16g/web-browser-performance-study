# 7. メモ化: memo、useMemo、useCallback、React Compiler

この章では、`memo` がどこで props を比べ、どんなときに効かないかを確かめます。`useMemo`、`useCallback` と、React Compiler が使う `useMemoCache` も扱います。

関係する教材は UC1 の `memo` です。

## memo は、型を包むオブジェクトを返すだけ

[`memo`](react:react/src/ReactMemo.js#L12-L57) は、`{ $$typeof, type, compare }` というオブジェクトを返すだけです。比べる処理は、すべて reconciler の側にあります。

初めて render するときに、条件を満たせば `SimpleMemoComponent` という速い形に切り替わります（[`ReactFiberBeginWork.js` 486〜508行](react:react-reconciler/src/ReactFiberBeginWork.js#L486-L508)）。

- 包んだ型が関数で、クラスではない
- `defaultProps` を持たない
- 比較の関数（`memo` の第2引数）を渡していない

この形では、`memo` と中の関数を1つの Fiber で扱います。比較の関数を渡したり、`forwardRef` を包んだりすると、`memo` の Fiber と中の Fiber の2つになります。

## SimpleMemoComponent は、props を浅く比べてから更新を確かめる

[`updateSimpleMemoComponent`](react:react-reconciler/src/ReactFiberBeginWork.js#L547-L617) は、次の順で判断します。

```js
if (current !== null) {
  const prevProps = current.memoizedProps;
  if (
    shallowEqual(prevProps, nextProps) &&
    current.ref === workInProgress.ref &&
    // Prevent bailout if the implementation changed due to hot reload.
    (__DEV__ ? workInProgress.type === current.type : true)
  ) {
    didReceiveUpdate = false;
    workInProgress.pendingProps = nextProps = prevProps;

    if (!checkScheduledUpdateOrContext(current, renderLanes)) {
      workInProgress.lanes = current.lanes;
      return bailoutOnAlreadyFinishedWork(current, workInProgress, renderLanes);
    }
    // ...
  }
}
return updateFunctionComponent(
  current,
  workInProgress,
  Component,
  nextProps,
  renderLanes,
);
```

1. props を浅く比べ、`ref` も同じか確かめる
2. 同じなら、自分の更新と Context の変化がないかを確かめる（[5章](./bailout)）
3. どちらもなければ、[5章](./bailout)の `bailoutOnAlreadyFinishedWork` で省く

比較の関数を渡した場合の [`updateMemoComponent`](react:react-reconciler/src/ReactFiberBeginWork.js#L522-L544) は、順番が逆です。先に自分の更新と Context を確かめ、なければ比較の関数を呼びます。比較の関数は、render を省けるかを判断するたびに呼ばれるので、重い処理を書くとその分だけ毎回費用がかかります。

## shallowEqual は、1段目のキーを Object.is で比べる

[`shallowEqual`](react:shared/shallowEqual.js#L18-L52) の中身は次のとおりです。

```js
function shallowEqual(objA: mixed, objB: mixed): boolean {
  if (is(objA, objB)) {
    return true;
  }
  // ...
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);

  if (keysA.length !== keysB.length) {
    return false;
  }

  // Test for A's keys different from B.
  for (let i = 0; i < keysA.length; i++) {
    const currentKey = keysA[i];
    if (
      !hasOwnProperty.call(objB, currentKey) ||
      !is(objA[currentKey], objB[currentKey])
    ) {
      return false;
    }
  }

  return true;
}
```

比べるのは1段目だけで、入れ子の値は参照で比べます。比べるたびに `Object.keys` の配列を2つ作るので、費用は props の数に比例します。

### memo が効かない props

| props                                                                  | 理由                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| render の中で作る関数 `onClick={() => ...}`                            | 毎回別の関数になる                                            |
| render の中で作るオブジェクトや配列 <code v-pre>style={{ ... }}</code> | 毎回別の参照になる                                            |
| JSX の `children`                                                      | 要素は毎回新しいオブジェクトになる（[6章](./reconciliation)） |
| render の中で作るコールバック ref                                      | `ref` も参照で比べる                                          |

どれか1つでも毎回変われば、比較は失敗し、比較の費用だけが増えます。

## useMemo と useCallback は、依存配列を Object.is で比べる

[`updateMemo`](react:react-reconciler/src/ReactFiberHooks.js#L2963-L2988) は、Hook に `[値, 依存配列]` を保存し、依存配列が同じなら前回の値を返します。

```js
function updateMemo<T>(
  nextCreate: () => T,
  deps: Array<mixed> | void | null,
): T {
  const hook = updateWorkInProgressHook();
  const nextDeps = deps === undefined ? null : deps;
  const prevState = hook.memoizedState;
  // Assume these are defined. If they're not, areHookInputsEqual will warn.
  if (nextDeps !== null) {
    const prevDeps: Array<mixed> | null = prevState[1];
    if (areHookInputsEqual(nextDeps, prevDeps)) {
      return prevState[0];
    }
  }
  const nextValue = nextCreate();
  // ...
  hook.memoizedState = [nextValue, nextDeps];
  return nextValue;
}
```

依存配列の比較（[`areHookInputsEqual`](react:react-reconciler/src/ReactFiberHooks.js#L456-L503)）は、要素ごとの `Object.is` です。依存配列を省くと、毎回計算し直します。

`useCallback` は「関数をそのまま保存する `useMemo`」です（[`updateCallback`](react:react-reconciler/src/ReactFiberHooks.js#L2930-L2942)）。render のたびに新しい関数自体は作られますが、依存配列が同じなら前回の関数を返します。関数を作る費用は減らず、**子の `memo` の比較を通すために参照をそろえる**ための道具です。

開発ビルドの StrictMode では、`useMemo` の計算が2回実行されます。本番ビルドでは起きません。

## React Compiler は、useMemoCache で値を保存する

React Compiler は、コンポーネントを書き換えて、自動でメモ化するコードを出力します。出力されたコードは `react/compiler-runtime` の `c` を呼び、これは [`useMemoCache`](react:react/src/ReactHooks.js#L212-L216) です。コンパイラ本体の出力は、この解説では確かめていません。

reconciler の [`useMemoCache`](react:react-reconciler/src/ReactFiberHooks.js#L1181-L1263) は、Hook のリストではなく Fiber の `updateQueue.memoCache` に配列を保存します。

```js
if (currentMemoCache != null) {
  memoCache = {
    data: enableNoCloningMemoCache
      ? currentMemoCache.data
      : // Clone the memo cache before each render (copy-on-write)
        currentMemoCache.data.map(array => array.slice()),
    index: 0 as number,
  };
}
// ...
let data = memoCache.data[memoCache.index];
if (data === undefined || (__DEV__ && ignorePreviousDependencies)) {
  data = memoCache.data[memoCache.index] = new Array(size);
  for (let i = 0; i < size; i++) {
    data[i] = REACT_MEMO_CACHE_SENTINEL;
  }
}
```

まだ計算していない場所には、`REACT_MEMO_CACHE_SENTINEL` という印が入ります。`enableNoCloningMemoCache` は `false` なので、render のたびに保存場所の配列を複製します。

手で書く `useMemo` と比べると、依存配列のオブジェクトを作らずに済む代わりに、保存場所の複製の費用がかかります。React DevTools のフレームグラフでは、React Compiler で変換されたコンポーネントの名前に ✨ が付きます。

## 計測で確かめる

UC1 の `bad` と `memo` の違いは、`Tile` を `memo` で包むかどうかだけです。`Tile` の props は `index`（数値）、`product`（`useMemo` で作った配列の要素）、`focused`（真偽値）で、どれも毎回同じ値か同じ参照になります。そのため、`memo` が最もよく効く条件がそろっています。

| 指標                                            | `bad`   | `memo` |
| ----------------------------------------------- | ------- | ------ |
| 入力から次フレームまで                          | 134.5ms | 20.0ms |
| `Tile` の render 回数                           | 3000    | 2      |
| React の `actualDuration`（プロファイリング版） | 117.7ms | 3.6ms  |

条件は CPU 4倍のヘッドレス Chromium で、5回の読み込み × 5回の入力の中央値です。

ただし、`memo` でも親の `StateGrid` は render し、3000件の props の比較は残ります。30,000件で記録すると、`updateSimpleMemoComponent` の Self time が入力1回あたり 12.20ms ありました（[9章](./external-store)）。`memo` は render を省きますが、比較の費用は件数に比例して残ります。

`memo` が効いているかは、[11章](./profiling)の `actualDuration` と `baseDuration` を比べて確かめます。
