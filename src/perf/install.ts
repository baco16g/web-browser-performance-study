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

/** `?hud=0` を付けると HUD を出さない。自動計測では HUD の負荷を避ける */
export function installPerf(): void {
  window.__perf = recorder;
  installObservers();

  const params = new URLSearchParams(location.search);
  if (params.get('hud') !== '0') {
    mountHud(recorder);
  }
  if (params.get('rum') === '1') {
    installRum(recorder, params);
  }
}
