import { mountHud } from './hud.ts';
import { installObservers } from './observers.ts';
import { type PerfRecorder, recorder } from './recorder.ts';

declare global {
  interface Window {
    /** 自動計測のスクリプトがページ内の計測値を読むための窓口 */
    __perf: PerfRecorder;
  }
}

/** `?hud=0` を付けると HUD を出さない。自動計測では HUD の負荷を避ける */
export function installPerf(): void {
  window.__perf = recorder;
  installObservers();

  if (new URLSearchParams(location.search).get('hud') !== '0') {
    mountHud(recorder);
  }
}
