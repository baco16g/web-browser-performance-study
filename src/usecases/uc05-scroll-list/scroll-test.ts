import { type FrameStats, sampleFrames } from '../../perf/frames.ts';

const BYTES_PER_PIXEL = 4;

/**
 * 決まった速さでスクロールしながら、フレームの間隔を記録する。
 *
 * JavaScript でスクロールするので、結果はメインスレッドの詰まりを反映する。
 * ブラウザに任せたスクロールはコンポジタだけで進むことがあり、この値には表れない。
 */
export function runScrollTest(
  scroller: HTMLElement,
  durationMs: number,
  pixelsPerFrame: number,
): Promise<FrameStats> {
  scroller.scrollTop = 0;
  let scrolling = true;

  const onFrame = (): void => {
    if (scrolling) {
      scroller.scrollTop += pixelsPerFrame;
      requestAnimationFrame(onFrame);
    }
  };
  requestAnimationFrame(onFrame);

  return sampleFrames(durationMs).finally(() => {
    scrolling = false;
  });
}

/** DOM にある読み込み済みの画像を、すべて展開したときの大きさを求める */
export function estimateDecodedImageBytes(root: HTMLElement): number {
  return [...root.querySelectorAll('img')].reduce(
    (total, { complete, naturalWidth, naturalHeight }) =>
      complete ? total + naturalWidth * naturalHeight * BYTES_PER_PIXEL : total,
    0,
  );
}
