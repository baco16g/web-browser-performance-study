# Browser Performance Study

A personal study project for learning browser performance measurement. Each use case pairs a deliberately slow implementation with an improved one, then measures both under the same conditions with the DevTools, in-page APIs, and automated Chrome DevTools Protocol runs. Documentation is written in Japanese.

ブラウザの性能計測を学ぶための、個人の学習用リポジトリです。架空のストアを題材に、遅い実装と改善した実装を同じ条件で測り、原因の探し方と効果の確かめ方を身につけます。遅い実装は学習のために意図して作ったものです。

## 実測の例: 強制同期レイアウトを避けると待ち時間が約77%減った

300枚のカードの文字サイズを切り替え、行ごとに高さを揃え直す操作を測りました。読み書きを分離すると、入力から次フレームまでの時間は 204.2ms から 46.3ms に短くなりました。

| 指標                        | 読み書きが交互 | 読み書きを分離 | CSS に任せる |
| --------------------------- | -------------- | -------------- | ------------ |
| 入力から次フレームまで (ms) | 204.2 ±1.1     | 46.3 ±0.6      | 38.3 ±0.2    |
| レイアウト回数              | 301            | 2              | 1            |
| レイアウト時間 (ms)         | 176.1 ±0.4     | 26.9 ±0.2      | 25.9 ±0.4    |
| JavaScript の実行時間 (ms)  | 3.6 ±1.0       | 1.5 ±0.4       | 0.5 ±0.4     |
| ハンドラの処理時間 (ms)     | 194.1 ±0.8     | 35.6 ±0.2      | 0.0 ±0.0     |

値は中央値で、± の後は四分位範囲です。Apple M1、Chromium 156 のヘッドレス実行、CPU 4倍制限で、5回の読み込みそれぞれの中央値を集計しました。環境が変われば値も変わります。[生データ](docs/results/uc02.json)と[測定の詳細](docs/usecases/uc02-forced-layout.md)を残しています。

遅い実装でも JavaScript 自体の実行は 3.6ms しかなく、時間の大半は JavaScript に強制されたレイアウトでした。また、CSS に任せる実装はハンドラの処理時間だけを見ると 0.0ms ですが、利用者の待ち時間は 38.3ms 残ります。処理の区間を測るだけでは、その後の描画の仕事を見落とします。

## 測って初めて分かったこと

予想と違った結果は、原因を調べて記録しています。

- **`transform` に変えてもレイアウトは消えなかった。** フォーカスしたタイルの拡大を `transform` に変えても、レイアウトは1回残りました。CSS を1項目ずつ変えて切り分けると、スタッキングコンテキストの有無の変化が関係していると推定できました（[UC1](docs/usecases/uc01-focus-grid.md)）。
- **計測器のほうが間違っていた。** 自作の計測値が `scheduler.yield()` の続きの処理に追い越され、入力の応答を 126.9ms と誤って示しました。Event Timing の値と比べて気づき、修正後は 14.5ms になりました（[UC3](docs/usecases/uc03-search-input.md)）。
- **CPU 制限は Worker に効かなかった。** Worker の検索時間は CPU 1倍でも8倍でも 18〜21ms でした。制限下の比較では Worker が速く見えますが、制限なしで比べると結果が出るまでの時間は同期処理とほぼ同じです（[UC3](docs/usecases/uc03-search-input.md)）。
- **画像の取得を 860ms 早めても LCP は 116ms しか縮まなかった。** LCP を内訳に分けると、次の律速点は一覧の描画でした。取得を早めた分は描画の待ちに移っただけで、FCP は帯域の取り合いで 68ms 悪化しました（[UC4](docs/usecases/uc04-initial-load.md)）。
- **フレーム間隔の指標はラスタライズの費用を映さなかった。** p95 が 16.7ms のままでも、トレースではラスタライズの時間が約5倍違いました（[UC5](docs/usecases/uc05-scroll-list.md)）。
- **リスナーを外してもヒープの増加は止まらなかった。** 詳細データを保持する経路が2本あり、両方を切る必要がありました。予想した3本目の経路は実測で否定されました（[UC6](docs/usecases/uc06-memory-growth.md)）。
- **ETag の再検証で縮んだのは 24ms だけだった。** 問い合わせは毎回行い、省けるのは本文の転送だけでした（[UC7](docs/usecases/uc07-cache-prefetch.md)）。
- **`useDeferredValue` は最初の1文字しか救わなかった。** 検索中に打った2文字目は 52.8ms 待たされ、Long Task も残りました。1文字だけの計測では見逃す問題です（[UC3](docs/usecases/uc03-search-input.md)）。

## 動かし方

Node.js 24 以上が必要です。

```sh
npm install
npx playwright install chromium webkit
npm run dev
```

自動計測は本番ビルドに対して行います。結果は `bench/results/` に保存され、`--trace` を付けると Performance パネルに読み込めるトレースも残ります。

```sh
npm run bench -- --scenario uc02 --trace
```

React の Profiler の値は通常の本番ビルドでは取れないので、専用のビルドで測ります。

```sh
npm run bench:profiling -- --scenario uc01
```

CDP の指標に出ないラスタライズや画像のデコードは、保存したトレースから集計できます。

```sh
npm run bench:trace-summary -- --scenario uc05
```

## ユースケース

| #                                           | 症状                               | 学ぶこと                                              | 状態     |
| ------------------------------------------- | ---------------------------------- | ----------------------------------------------------- | -------- |
| [UC1](docs/usecases/uc01-focus-grid.md)     | 十字キーでのフォーカス移動が遅い   | React の再レンダリングの範囲、Event Timing、Profiler  | 実装済み |
| [UC2](docs/usecases/uc02-forced-layout.md)  | カードの高さ揃えが重い             | 強制同期レイアウト、レイアウト回数の読み方            | 実装済み |
| [UC3](docs/usecases/uc03-search-input.md)   | 絞り込み中に入力が固まる           | Long Tasks、メインスレッドの明け渡し、Web Worker      | 実装済み |
| [UC4](docs/usecases/uc04-initial-load.md)   | 初期表示と操作可能になるまでが遅い | LCP の内訳、CLS、Resource Timing                      | 実装済み |
| [UC5](docs/usecases/uc05-scroll-list.md)    | スクロールがカクつく               | フレーム間隔、トレースの集計、画像のデコード          | 実装済み |
| [UC6](docs/usecases/uc06-memory-growth.md)  | 画面を行き来するとメモリが増える   | GC の後に残る量、参照の経路、リークとキャッシュの違い | 実装済み |
| [UC7](docs/usecases/uc07-cache-prefetch.md) | 再表示や詳細表示が遅い             | HTTP キャッシュ、先読み、速さと新しさの交換           | 実装済み |

## 計測の4つの層

同じ現象でも、層によって分かることが違います。考え方は[計測ガイド](docs/measurement-guide.md)にまとめました。

| 層           | 道具                                         | 向いていること               |
| ------------ | -------------------------------------------- | ---------------------------- |
| 手動         | DevTools の Performance、Network、Memory     | 原因の特定                   |
| ページ内     | User Timing、PerformanceObserver、web-vitals | 操作に合わせた指標の定義     |
| 自動         | Playwright と Chrome DevTools Protocol       | 同じ条件での反復と回帰の検知 |
| 実利用の模擬 | `sendBeacon` とローカル集計（準備中）        | 分布の見方の練習             |

## 構成

```text
pages/      ユースケースごとの HTML
src/perf/   ページ内の計測ライブラリと HUD
src/usecases/  ユースケースの実装
server/     遅延を指定できるモック API
bench/      自動計測、集計、回帰判定
e2e/        Playwright の動作確認
docs/       計測ガイド、ユースケースの解説、設計判断、実測結果
```

設計判断は [docs/adr/](docs/adr/) に、選ばなかった案とともに記録しています。

## 開発

```sh
npm run check   # 型検査、Lint、単体テスト
npm run e2e     # Chromium と WebKit の動作確認
```

## このリポジトリで測れないこと

CPU 制限は JavaScript やレイアウトの遅さを再現しますが、GPU やメモリ帯域の違いは再現しません。入力から次フレームまでの値はメインスレッドの仕事が終わるまでの近似で、ラスタライズや表示装置の遅延は含みません。Playwright の WebKit は Safari そのものではなく、古い WebKit の挙動も確かめられません。

## 参考資料

- [Web Vitals](https://web.dev/articles/vitals) と [Interaction to Next Paint](https://web.dev/articles/inp)（web.dev）
- [Performance パネルの概要](https://developer.chrome.com/docs/devtools/performance/overview)と [RenderingNG のアーキテクチャ](https://developer.chrome.com/docs/chromium/renderingng-architecture)（Chrome for Developers）
- [Chrome DevTools Protocol: Performance ドメイン](https://chromedevtools.github.io/devtools-protocol/tot/Performance/)
- [HTML Standard: イベントループ](https://html.spec.whatwg.org/multipage/webappapis.html#event-loops)
