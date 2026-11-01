import { describe, expect, it } from 'vitest';
import { analyzeFrames } from './frames.ts';

describe('analyzeFrames', () => {
  it('安定した 60Hz では落ちたフレームがない', () => {
    const stats = analyzeFrames(Array.from({ length: 60 }, () => 16.7));
    expect(stats.droppedFrames).toBe(0);
    expect(stats.refreshIntervalMs).toBeCloseTo(16.7);
  });

  it('120Hz でも更新周期を基準に数える', () => {
    const stats = analyzeFrames([8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 8.3, 25]);
    expect(stats.refreshIntervalMs).toBeCloseTo(8.3);
    expect(stats.droppedFrames).toBe(2);
  });

  it('更新周期を指定できる', () => {
    expect(analyzeFrames([33.4, 33.4], 16.7).droppedFrames).toBe(2);
  });
});
