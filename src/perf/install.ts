import { mountHud } from './hud.ts';
import { installObservers } from './observers.ts';
import { type PerfRecorder, recorder } from './recorder.ts';
import { installRum } from './rum.ts';

declare global {
  interface Window {
    /** 自動計測のスクリプトがページ内の計測値を読むための窓口 */
    __perf: PerfRecorder;
  }
}

/** 計測の準備に失敗しても、ページの表示は止めない */
function runSafely(task: () => void): void {
  try {
    task();
  } catch (error) {
    console.warn('計測の準備に失敗しました', error);
  }
}

/** `?hud=0` を付けると HUD を出さない。自動計測では HUD の負荷を避ける */
export function installPerf(): void {
  window.__perf = recorder;
  runSafely(installObservers);

  const params = new URLSearchParams(location.search);
  if (params.get('hud') !== '0') {
    runSafely(() => mountHud(recorder));
  }
  if (params.get('rum') === '1') {
    runSafely(() => installRum(recorder, params));
  }
}
