import { describe, expect, it } from 'vitest';
import { judge } from './judge.ts';

const LIMITS = { relative: 0.1, absolute: 5 };

describe('judge', () => {
  it('相対と絶対の両方を超えた悪化は fail にする', () => {
    const result = judge([14, 15, 15, 15, 16], [21, 21, 21, 21, 22], LIMITS);
    expect(result.verdict).toBe('fail');
    expect(result.delta).toBe(6);
  });

  it('しきい値の半分を超えた悪化は warn にする', () => {
    expect(judge([14, 15, 15, 15, 16], [18, 18, 18, 18, 18], LIMITS).verdict).toBe('warn');
  });

  it('相対だけ超えても小さな差なら pass にする', () => {
    expect(judge([2, 2, 2], [2.5, 2.5, 2.5], LIMITS).verdict).toBe('pass');
  });

  it('絶対だけ超えても割合が小さければ pass にする', () => {
    expect(judge([1000, 1000, 1000], [1010, 1010, 1010], LIMITS).verdict).toBe('pass');
  });

  it('差が四分位範囲に収まるなら pass にする', () => {
    const result = judge([100, 120, 140, 160, 180], [120, 140, 160, 180, 200], LIMITS);
    expect(result.noise).toBe(40);
    expect(result.verdict).toBe('pass');
  });

  it('改善は pass にする', () => {
    expect(judge([20, 20, 20], [10, 10, 10], LIMITS).verdict).toBe('pass');
  });

  it('基準が 0 でも悪化を検出する', () => {
    const result = judge([0, 0, 0], [12, 12, 12], LIMITS);
    expect(result.relativeDelta).toBe(Number.POSITIVE_INFINITY);
    expect(result.verdict).toBe('fail');
  });
});
