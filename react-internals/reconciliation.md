# 6. 子の調整と key

この章では、コンポーネントが返した要素を前回の Fiber と突き合わせる処理（reconciliation）と、`key` の役割を確かめます。親が render したときに子1件ごとにかかる費用は、ここで決まります。

関係する教材は UC1 です。

## JSX は render のたびに新しいオブジェクトを作る

本番ビルドの JSX は [`jsxProd`](react:react/src/jsx/ReactJSXElement.js#L291-L348) を呼びます。

```js
let props;
if (!('key' in config)) {
  // If key was not spread in, we can reuse the original props object. ...
  props = config;
} else {
  // ... We don't use `delete`
  // because in V8 it will deopt the object to dictionary mode.
  props = {};
  for (const propName in config) {
    if (propName !== 'key') {
      props[propName] = config[propName];
    }
  }
}
return ReactElement(type, key, props, getOwner(), undefined, undefined);
```

本番の要素は `$$typeof`、`type`、`key`、`ref`、`props` の5つを持つオブジェクトです（[`ReactJSXElement.js` 225〜238行](react:react/src/jsx/ReactJSXElement.js#L225-L238)）。親が render するたびに、子1件につき props と要素の少なくとも2つのオブジェクトが作られます。

この props は毎回新しい参照になります。[5章](./bailout)で見たとおり、`beginWork` は props を `!==` で比べるので、memo していない子はすべて render されます。

## 子の種類ごとに処理を分ける

子の調整は [`reconcileChildFibersImpl`](react:react-reconciler/src/ReactChildFiber.js#L1854-L2032) から始まり、子の種類で分かれます。

| 子の種類             | 処理                                 |
| -------------------- | ------------------------------------ |
| 要素1つ              | `reconcileSingleElement`             |
| 配列                 | `reconcileChildrenArray`             |
| 文字列、数値         | テキストの Fiber を1つ作るか更新する |
| `null`、`false` など | 既存の子をすべて削除する             |

`key` のないトップレベルの `<>...</>` は、外して中身を直接扱います。

## 型が同じなら Fiber を使い回し、違えば作り直す

要素1件ごとの判断は [`updateElement`](react:react-reconciler/src/ReactChildFiber.js#L580-L635) にあります。

```js
if (current !== null) {
  if (
    current.elementType === elementType ||
    // ...
  ) {
    // Move based on index
    const existing = useFiber(current, element.props);
    coerceRef(existing, element);
    existing.return = returnFiber;
    return existing;
  }
}
// Insert
const created = createFiberFromElement(element, returnFiber.mode, lanes);
```

型が `===` で同じなら、[1章](./overview)の `createWorkInProgress` で Fiber を使い回します。state も DOM 要素もそのまま残ります。型が違えば新しい Fiber を作り、古い部分木は削除されます。

性能の面で注意が必要なのは、**コンポーネントを render の中で定義する書き方**です。関数が毎回別のものになるので型が一致せず、部分木が毎回削除されて作り直されます。state も DOM も失われます。

## 配列は、先頭から key で突き合わせる

子が配列のときは [`reconcileChildrenArray`](react:react-reconciler/src/ReactChildFiber.js#L1177-L1369) が、次の順で突き合わせます。

1. **先頭から順に:** 前回の Fiber と新しい要素を位置の順に比べる。`key` が一致する間は使い回し、一致しなくなったら抜ける
2. **新しい要素を使い切ったら:** 残った前回の Fiber を削除して終わる
3. **前回の Fiber を使い切ったら:** 残った新しい要素を新しく作って終わる
4. **どちらも残ったら:** 残った前回の Fiber を `Map` に入れ（[`mapRemainingChildren`](react:react-reconciler/src/ReactChildFiber.js#L467-L500)）、新しい要素ごとに `key` で探す。最後に `Map` に残ったものを削除する

`Map` の `key` は、`key` があれば `key`、なければ位置です。末尾への追加や削除は1と2か3で終わりますが、先頭や途中への挿入、並べ替えでは4に進み、`Map` を作る費用が加わります。

### 移動したかどうかは、前回の位置で判断する

使い回した Fiber が移動したかどうかは、[`placeChild`](react:react-reconciler/src/ReactChildFiber.js#L511-L541) が判断します。

```js
const current = newFiber.alternate;
if (current !== null) {
  const oldIndex = current.index;
  if (oldIndex < lastPlacedIndex) {
    // This is a move.
    newFiber.flags |= Placement;
    return lastPlacedIndex;
  } else {
    // This item can stay in place.
    return oldIndex;
  }
} else {
  // This is an insertion.
  newFiber.flags |= Placement | PlacementDEV;
  return lastPlacedIndex;
}
```

前回の位置が、ここまでに置いた位置より前なら「移動」と判断します。この方法では、`[A, B, C, D]` を `[D, A, B, C]` にすると、D ではなく A、B、C の3件が移動したと判断されます。末尾の要素を先頭に移す並べ替えは、DOM の移動が最も多くなる形です。

### key がないと、位置で対応づける

`key` がない子は、位置で前回の Fiber と対応づけられます。先頭に1件挿入すると、すべての位置がずれ、各 Fiber に隣の要素の props が入ります。state を持つコンポーネントでは、state が別の要素に付いたままになります。

## DOM 要素の Fiber は、render では差分を計算しない

DOM 要素の Fiber の `beginWork`（[`updateHostComponent`](react:react-reconciler/src/ReactFiberBeginWork.js#L1966-L2033)）は、props を比べずに子の調整だけをします。子が文字列や数値だけの要素では、テキストの Fiber を作りません。`<span>{title}</span>` のような要素は、Fiber が1つ少なく済みます。

完了の処理でも、props のオブジェクトが前回と違えば「更新あり」の印を付けるだけです（[1章](./overview)）。属性ごとの差分は、commit で計算します（[8章](./commit-and-effects)）。

## 計測で確かめる

UC1 の `bad` で1回キーを押すと、`StateGrid` が3000件の `Tile` の要素を作り、3000件の Fiber と突き合わせます。Bottom-up には、この章の関数が並びます。

| 関数                          | この章での役割                                 |
| ----------------------------- | ---------------------------------------------- |
| `jsxProd`                     | 要素と props のオブジェクトを作る              |
| `reconcileChildrenArray`      | 子の配列を突き合わせる                         |
| `updateSlot`、`updateElement` | 1件ずつ `key` と型を比べ、Fiber を使い回す     |
| `createWorkInProgress`        | 使い回す Fiber を用意する（[1章](./overview)） |

3000件では、どれも1件あたりの費用が小さく、上位には出にくい処理です。圧縮なしの本番ビルドで 30,000件の `memo` を CPU 4倍で記録すると、入力1回あたり `updateSlot` が 1.46ms、`updateElement` が 1.06ms ありました。件数を増やすと、子の数に比例して増えることが分かります。
