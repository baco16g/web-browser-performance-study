import { describe, expect, it } from 'vitest';
import { createRecorder } from './recorder.ts';

const clock = () => 0;

describe('createRecorder', () => {
  it('drain すると記録を返して空にする', () => {
    const recorder = createRecorder(clock);
    recorder.record('a', 1);
    expect(recorder.drain()).toEqual([{ name: 'a', value: 1, unit: 'ms', at: 0 }]);
    expect(recorder.snapshot()).toEqual([]);
  });

  it('上限を超えたら古い値から捨てる', () => {
    const recorder = createRecorder(clock);
    for (let value = 0; value <= 2_000; value += 1) {
      recorder.record('a', value);
    }
    expect(recorder.snapshot()).toHaveLength(2_000);
    expect(recorder.snapshot()[0]?.value).toBe(1);
  });
});
