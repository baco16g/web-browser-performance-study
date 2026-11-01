# ブラウザごとの違いと古い環境

> この文書の解説と考察は、Claude（Anthropic の AI）が実測の結果をもとに書いたものです。

同じコードでも、使える計測手段はブラウザごとに違います。ここでは Chromium と Playwright の WebKit を同じ条件で測った結果と、古い環境を想定した確認の結果をまとめます。Playwright の WebKit は Safari そのものではありません。

## 使える計測手段が違う

次の表は Chromium 156 と Playwright の WebKit 27.2 で確かめた結果です。

| 計測手段                          | Chromium | WebKit                  |
| --------------------------------- | -------- | ----------------------- |
| Chrome DevTools Protocol          | 使える   | 使えない                |
| Event Timing                      | 使える   | 使える                  |
| LCP                               | 使える   | 使える                  |
| Layout Shift（CLS）               | 使える   | 使えない                |
| Long Tasks                        | 使える   | 使えない                |
| Long Animation Frames             | 使える   | 使えない                |
| `scheduler.yield()` と `postTask` | 使える   | 使えない                |
| `performance.memory`              | 使える   | 使えない                |
| 計測値の細かさ                    | 0.1ms    | 1ms（結果の値から確認） |

レイアウト回数、ヒープ、トレースはすべて CDP に頼っています。WebKit で同じことをするには Web Inspector を手で使う必要があります。`--browser webkit` では、ページの中の計測値だけを集めます。対応していない計測値は 0 ではなく値なしとして扱います。0 と記録すると、測れていないのに「Long Task がない」と読めてしまうからです。

## 回数は一致し、時間は傾向だけが揃う

CPU 制限は Chromium にしかないので、公平になるよう両方とも制限なしで測りました。5回の読み込みの中央値です（生データ: [UC1](results/uc01-chromium.json)、[UC2](results/uc02-chromium.json)、[UC3](results/uc03-chromium.json)。WebKit は同じ名前の `-webkit.json` です）。

| シナリオ     | 指標                        | Chromium | WebKit |
| ------------ | --------------------------- | -------- | ------ |
| UC1 `bad`    | Event Timing の応答 (ms)    | 56       | 88     |
| UC1 `good`   | Event Timing の応答 (ms)    | 16       | 16     |
| UC1 `bad`    | 再レンダリングしたタイル    | 3000     | 3000   |
| UC1 `good`   | 再レンダリングしたタイル    | 2        | 2      |
| UC2 `bad`    | 入力から次フレームまで (ms) | 72       | 106    |
| UC2 `good`   | 入力から次フレームまで (ms) | 28       | 38     |
| UC2 `css`    | 入力から次フレームまで (ms) | 24       | 33     |
| UC3 `bad`    | 入力の反映 (ms)             | 71       | 85     |
| UC3 `yield`  | 入力の反映 (ms)             | 11       | 6      |
| UC3 `worker` | 入力の反映 (ms)             | 11       | 16     |

再レンダリングの数のように実装で決まる値は一致します。改善の方向も同じです。時間の絶対値はエンジンで違うので、改善の効果は同じブラウザの中で前後を比べて判断します。

### 自作の計測値が Event Timing より大きく出た

UC1 の `good` は、Event Timing では 16ms でしたが、`uc01:input-to-next-frame` は 31ms でした。Chromium では 10ms で、Event Timing の下限に収まっています。WebKit には `scheduler.postTask` がないので `MessageChannel` に切り替わることが関係していそうですが、原因は確かめていません。WebKit でこの指標を使うときは、値そのものより実装どうしの差を見ます。

## 古い環境では、ビルドの設定だけでは足りない

Vite 8 の既定のビルドは Safari 16.4 以降を対象にします。`npm run build:safari15` は対象を Safari 15 に下げますが、警告なしで成功しても動くとは限りません。変換されるのは構文だけで、存在しない API は補われないからです。

実際に [legacy-environment.spec.ts](../e2e/legacy-environment.spec.ts) で Safari 15.4 より前にない API を消すと、全ページが描かれなくなりました。原因は計測の HUD でした。`Array.prototype.at` と `findLast` を使っていたので、初期化で例外が起きていたのです。計測のコードが画面を壊すのは、最も避けたい失敗です。

次の3点を直しました。

- 自前のコードから `at` と `findLast` を使わないようにした
- `web-vitals` は内部で `at` を使うので、対応環境でだけ読み込むようにした
- 計測の準備に失敗しても、ページの表示は止めないようにした

`scheduler` がない環境では `MessageChannel` に、Event Timing がない環境では `requestAnimationFrame` だけの計測に切り替わります。この切り替えも同じ E2E で確認しています。

## この確認の限界

API を消して再現しているだけで、古いエンジンそのものではありません。実際の Safari 15 では、描画の性能も CSS の対応も違います。Playwright の WebKit は常に新しい版なので、古い WebKit の挙動は実機でしか確かめられません。組み込みブラウザでは、同じ版番号でも機能が無効になっていることがあるので、対象の環境で機能検出の結果を確かめる必要があります。
