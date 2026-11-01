import { summarize } from './stats.ts';

export type Verdict = 'pass' | 'warn' | 'fail';

export type JudgeLimits = {
  /** 基準値に対する悪化の割合。0.1 なら 10% */
  relative: number;
  /** 指標の単位での悪化量 */
  absolute: number;
};

export type Judgement = {
  verdict: Verdict;
  baselineMedian: number;
  candidateMedian: number;
  delta: number;
  relativeDelta: number;
  noise: number;
};

function toRelativeDelta(delta: number, baseline: number): number {
  if (baseline !== 0) {
    return delta / baseline;
  }
  return delta === 0 ? 0 : Number.POSITIVE_INFINITY;
}

/**
 * 値が大きいほど悪い指標について、候補が基準より悪化したかを判定する。
 *
 * 揺れの範囲に収まる差は無視する。相対と絶対の両方を超えたときだけ悪化とみなすのは、
 * 2ms が 2.3ms になる程度の差と、大きな値の割合としての悪化を両方正しく扱うため。
 */
export function judge(
  baseline: readonly number[],
  candidate: readonly number[],
  limits: JudgeLimits,
): Judgement {
  const base = summarize(baseline);
  const next = summarize(candidate);
  const delta = next.median - base.median;
  const relativeDelta = toRelativeDelta(delta, base.median);
  const noise = Math.max(base.iqr, next.iqr);
  const exceeds = (scale: number): boolean =>
    delta > noise && delta > limits.absolute * scale && relativeDelta > limits.relative * scale;

  const verdict: Verdict = exceeds(1) ? 'fail' : exceeds(0.5) ? 'warn' : 'pass';
  return {
    verdict,
    baselineMedian: base.median,
    candidateMedian: next.median,
    delta,
    relativeDelta,
    noise,
  };
}
