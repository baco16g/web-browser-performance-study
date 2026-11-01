import { describe, expect, it, vi } from 'vitest';
import { createFocusStore } from './focus-store.ts';

describe('createFocusStore', () => {
  it('移動すると外れた項目と当たった項目だけに通知する', () => {
    const store = createFocusStore(0);
    const listeners = [vi.fn(), vi.fn(), vi.fn()];
    listeners.forEach((listener, index) => {
      store.subscribeIndex(index, listener);
    });

    store.setFocusedIndex(1);

    expect(listeners[0]).toHaveBeenCalledTimes(1);
    expect(listeners[1]).toHaveBeenCalledTimes(1);
    expect(listeners[2]).not.toHaveBeenCalled();
    expect(store.isFocused(1)).toBe(true);
  });

  it('同じ位置への移動では通知しない', () => {
    const store = createFocusStore(0);
    const listener = vi.fn();
    store.subscribeIndex(0, listener);

    store.setFocusedIndex(0);

    expect(listener).not.toHaveBeenCalled();
  });

  it('購読を解除すると通知しない', () => {
    const store = createFocusStore(0);
    const listener = vi.fn();
    const unsubscribe = store.subscribeIndex(1, listener);

    unsubscribe();
    store.setFocusedIndex(1);

    expect(listener).not.toHaveBeenCalled();
  });
});
