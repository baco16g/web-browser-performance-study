# Browser Performance Study

A personal study project for learning browser performance measurement. Each use case pairs a deliberately slow implementation with an improved one, then measures both under the same conditions with the DevTools, in-page APIs, and automated Chrome DevTools Protocol runs. Documentation is written in Japanese.

ブラウザの性能計測を学ぶための、個人の学習用リポジトリです。架空のストアを題材に、遅い実装と改善した実装を同じ条件で測り、原因の探し方と効果の確かめ方を身につけます。遅い実装は学習のために意図して作ったものです。

## 実測の例: 強制同期レイアウトを避けると待ち時間が約78%減った

300枚のカードの文字サイズを切り替え、行ごとに高さを揃え直す操作を測りました。読み書きを分離すると、入力から次フレームまでの時間は 214.6ms から 46.9ms に短くなりました。

| 指標                        | 読み書きが交互 | 読み書きを分離 | CSS に任せる |
| --------------------------- | -------------- | -------------- | ------------ |
| 入力から次フレームまで (ms) | 214.6 ±4.6     | 46.9 ±0.5      | 38.4 ±0.6    |
| レイアウト回数              | 301            | 2              | 1            |
| レイアウト時間 (ms)         | 184.0 ±3.8     | 27.1 ±1.1      | 25.8 ±0.3    |
| JavaScript の実行時間 (ms)  | 4.1 ±1.0       | 1.7 ±0.2       | 0.5 ±0.1     |
| ハンドラの処理時間 (ms)     | 202.6 ±3.7     | 35.7 ±0.9      | 0.0 ±0.0     |

値は中央値で、± の後は四分位範囲です。Apple M1、Chromium 156 のヘッドレス実行、CPU 4倍制限で、5回の読み込みそれぞれの中央値を集計しました。環境が変われば値も変わります。[生データ](docs/results/uc02.json)と[測定の詳細](docs/usecases/uc02-forced-layout.md)を残しています。

この表から読み取れることが2つあります。遅い実装でも JavaScript 自体の実行は 4.1ms しかなく、時間の大半は JavaScript に強制されたレイアウトでした。また、CSS に任せる実装はハンドラの処理時間だけを見ると 0.0ms ですが、利用者の待ち時間は 38.4ms 残ります。処理の区間を測るだけでは、その後の描画の仕事を見落とします。

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

## ユースケース

| #                                          | 症状                               | 学ぶこと                                   | 状態     |
| ------------------------------------------ | ---------------------------------- | ------------------------------------------ | -------- |
| [UC2](docs/usecases/uc02-forced-layout.md) | カードの高さ揃えが重い             | 強制同期レイアウト、レイアウト回数の読み方 | 実装済み |
| UC1                                        | 十字キーでのフォーカス移動が遅い   | Event Timing、React の再レンダリングの範囲 | 準備中   |
| UC3                                        | 絞り込み中に入力が固まる           | Long Tasks、LoAF、INP                      | 準備中   |
| UC4                                        | 初期表示と操作可能になるまでが遅い | LCP、CLS、Resource Timing                  | 準備中   |
| UC5                                        | スクロールがカクつく               | フレーム間隔、レイヤー、画像のデコード     | 準備中   |
| UC6                                        | 画面を行き来するとメモリが増える   | ヒープの比較、リークの見つけ方             | 準備中   |
| UC7                                        | 再表示や詳細表示が遅い             | HTTP キャッシュ、先読みの効果測定          | 準備中   |

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
