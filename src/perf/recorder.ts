export type Unit = 'ms' | 'count' | 'score' | 'bytes';

export type PerfSample = {
  name: string;
  value: number;
  unit: Unit;
  /** performance.now() の時刻 */
  at: number;
};

const MAX_SAMPLES = 2_000;

export type PerfRecorder = {
  record(name: string, value: number, unit?: Unit): void;
  /** 記録した値を返す。計測の邪魔をしないよう古いものから捨てる */
  snapshot(): readonly PerfSample[];
  /** 記録した値を取り出して空にする */
  drain(): PerfSample[];
};

export function createRecorder(now: () => number = () => performance.now()): PerfRecorder {
  let samples: PerfSample[] = [];

  return {
    record(name, value, unit = 'ms') {
      samples.push({ name, value, unit, at: now() });
      if (samples.length > MAX_SAMPLES) {
        samples.shift();
      }
    },
    snapshot() {
      return samples;
    },
    drain() {
      const drained = samples;
      samples = [];
      return drained;
    },
  };
}

export const recorder = createRecorder();
