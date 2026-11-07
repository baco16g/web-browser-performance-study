# はじめに

::: info この解説について
解説の対象は React v19.3.1 です。コードの引用には、GitHub の該当行へのリンクを付けています。
:::

Chrome の Performance パネルで React のアプリを記録すると、`performUnitOfWork` や `beginWork`、`processRootScheduleInMicrotask` といった名前が並びます。これらの名前の意味と、React がいつ、どれだけの仕事をするのかを、ソースコードから確かめるのがこの解説の目的です。

React の機能をすべて扱うわけではありません。[計測の教材](https://github.com/baco16g/web-browser-performance-study)で実際に出会った現象を説明するのに必要な部分を選びました。

## 何が分かるようになるか

- 1回のキー入力で、React がどの順番で何をするか
- 親が render すると、なぜ子も全部 render されるのか。どうすれば省けるのか
- `memo` や外部ストアが、ソースのどこで効いているのか
- `useEffect` が描画の前に動く場合と、後に動く場合があるのはなぜか
- `startTransition` や `useDeferredValue` で、何が中断でき、何が中断できないのか
- React の Profiler や Performance パネルの React のトラックの値が、どう作られているのか

## 対象と前提

| 項目         | 内容                                                              |
| ------------ | ----------------------------------------------------------------- |
| React の版   | 19.3.1（`react-dom/client` の本番ビルドとプロファイリングビルド） |
| ソースの引用 | `facebook/react` の `v19.3.1` のタグ。引用の行番号はこの版のもの  |
| 前提知識     | JavaScript と React の基本的な書き方                              |

React のソースは、型注釈付きの JavaScript（Flow）で書かれています。引用では、説明に関係のない部分を `// ...` で省いています。開発ビルドだけで動く処理（`__DEV__` の分岐）は、断りがない限り省きました。

## React 18 の頃の解説から変わった点

ソースを読むと、19.3.1 では次の点が React 18 の頃の解説と違っていました。古い解説を読むときの手がかりにしてください。

| 項目            | 19.3.1 での形                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------- |
| 古い API        | `ReactDOM.render` のレガシーモードと古い Context API は無効（`disableLegacyMode`、`disableLegacyContext` が `true`） |
| DOM の差分      | render の完了処理では計算せず、commit で計算する（`prepareUpdate` はない。[1章](./overview)）                        |
| 更新の予約      | root ごとの判断を、microtask の中でまとめて行う（[3章](./scheduling-updates)）                                       |
| Context         | 値の変化は、必要になったときにだけ調べる（[5章](./bailout)）                                                         |
| 計測            | Performance パネルに React のトラックを書き込む（[11章](./profiling)）                                               |
| メモ化          | React Compiler のための `useMemoCache` がある（[7章](./memoization)）                                                |
| commit の関数名 | `commitRootImpl` はなく、`completeRoot` と `commitRoot` に分かれている（[8章](./commit-and-effects)）                |

## 章の順番

1〜4章は、更新が始まってから画面に反映されるまでの流れです。5〜7章は、render を省く仕組みです。8〜11章は、個別の機能と計測の仕組みを扱います。

| 章                                          | 内容                                  | 関係する教材 |
| ------------------------------------------- | ------------------------------------- | ------------ |
| [1. 全体像](./overview)                     | render と commit、Fiber、作業の進め方 | UC1          |
| [2. Hooks と state](./hooks-and-state)      | Hook の保存場所、`setState` の処理    | UC1          |
| [3. 更新の予約](./scheduling-updates)       | イベントの優先度、Lane、microtask     | UC1、UC3     |
| [4. Scheduler と時間分割](./scheduler)      | タスクの順番と、作業を区切る間隔      | UC3、UC4     |
| [5. render を省く仕組み](./bailout)         | bailout と Context                    | UC1          |
| [6. 子の調整と key](./reconciliation)       | 子の比較と並べ替え                    | UC1          |
| [7. メモ化](./memoization)                  | `memo`、`useMemo`、React Compiler     | UC1          |
| [8. commit と effect](./commit-and-effects) | DOM への反映と effect の実行時期      | UC1          |
| [9. 外部ストア](./external-store)           | `useSyncExternalStore`                | UC1          |
| [10. 中断できる更新](./transitions)         | `startTransition`、`useDeferredValue` | UC3、UC4     |
| [11. 計測の仕組み](./profiling)             | Profiler、React のトラック            | UC1          |
| [付録: 名前の対応表](./appendix-names)      | Performance パネルに出る関数名の一覧  | すべて       |

各章には「計測で確かめる」という節があり、Performance パネルや教材のページで、その章の内容を確かめる方法を書いています。
