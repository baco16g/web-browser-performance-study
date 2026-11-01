import { recorder } from './recorder.ts';

/**
 * 同期処理の時間を User Timing で記録する。
 *
 * 記録は DevTools の Timings トラックにも出る。この値に含まれるのは処理の間だけで、
 * 処理の後に行われるスタイル計算やレイアウト、描画は含まない。
 */
export function measureSync<T>(name: string, task: () => T): T {
  const start = performance.now();
  try {
    return task();
  } finally {
    const { duration } = performance.measure(name, { start, end: performance.now() });
    recorder.record(name, duration);
  }
}

/**
 * 描画が終わった後に task を実行する。
 *
 * 他の処理より優先度を高くしないと、scheduler.yield() の続きの処理に追い越され、
 * 描画の後もしばらく実行されず、計測値が実際より長くなる。
 */
function runAfterRendering(task: () => void): void {
  if ('scheduler' in globalThis) {
    void scheduler.postTask(task, { priority: 'user-blocking' });
    return;
  }
  const { port1, port2 } = new MessageChannel();
  port1.onmessage = () => {
    task();
    port1.close();
  };
  port2.postMessage(null);
}

/** ページの読み込み開始から、次のフレームの描画が終わるまでの時間を記録する */
export function recordTimeAfterNextFrame(name: string): void {
  requestAnimationFrame(() => {
    runAfterRendering(() => recorder.record(name, performance.now()));
  });
}

/**
 * 入力が起きてから、次のフレームのメインスレッドの仕事が終わるまでの時間を記録する。
 *
 * requestAnimationFrame は描画の直前に呼ばれるので、そこからタスクを 1 つ積むと、
 * 描画が終わった後に実行される。ラスタライズ、合成、表示装置の遅延は含まない近似値である。
 *
 * inputEvent には keydown や pointerdown を渡す。input や click の timeStamp は
 * 処理が始まった時刻になるので、メインスレッドが塞がっていた間の待ち時間が抜け落ちる。
 */
export function recordNextFrame(name: string, inputEvent: Event, onRecorded?: () => void): void {
  const start = inputEvent.timeStamp;
  requestAnimationFrame(() => {
    runAfterRendering(() => {
      recorder.record(name, performance.now() - start);
      onRecorded?.();
    });
  });
}
