import { quantile, summarize } from './stats.ts';

export type FrameStats = {
  frames: number;
  refreshIntervalMs: number;
  p95FrameMs: number;
  droppedFrames: number;
};

/**
 * フレーム間隔を集計する。
 *
 * 表示の更新間隔は 60Hz とは限らないので、下位 25% の間隔を更新周期の推定値に使う。
 * 全体が遅いページでは推定値も伸びるため、分かっているときは引数で指定する。
 */
export function analyzeFrames(
  intervals: readonly number[],
  refreshIntervalMs: number = quantile(intervals, 0.25),
): FrameStats {
  return {
    frames: intervals.length,
    refreshIntervalMs,
    p95FrameMs: summarize(intervals).p95,
    droppedFrames: intervals.reduce(
      (dropped, interval) => dropped + Math.max(0, Math.round(interval / refreshIntervalMs) - 1),
      0,
    ),
  };
}

/** 指定時間のあいだ requestAnimationFrame の間隔を記録する */
export function sampleFrames(durationMs: number): Promise<FrameStats> {
  return new Promise((resolve) => {
    const intervals: number[] = [];

    requestAnimationFrame((firstFrame) => {
      let previous = firstFrame;

      const onFrame = (now: number): void => {
        intervals.push(now - previous);
        previous = now;
        if (now - firstFrame < durationMs) {
          requestAnimationFrame(onFrame);
          return;
        }
        resolve(analyzeFrames(intervals));
      };

      requestAnimationFrame(onFrame);
    });
  });
}
