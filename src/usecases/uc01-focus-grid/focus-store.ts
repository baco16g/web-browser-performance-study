type Listener = () => void;

export type FocusStore = {
  getFocusedIndex(): number;
  isFocused(index: number): boolean;
  setFocusedIndex(index: number): void;
  subscribeIndex(index: number, listener: Listener): () => void;
};

/**
 * React の外でフォーカス位置を持つ。
 *
 * 購読を項目ごとに分けているので、移動しても通知先は外れた項目と当たった項目の 2 つで済む。
 */
export function createFocusStore(initialIndex: number): FocusStore {
  let focusedIndex = initialIndex;
  const listenersByIndex = new Map<number, Set<Listener>>();

  const notify = (index: number): void => {
    for (const listener of listenersByIndex.get(index) ?? []) {
      listener();
    }
  };

  return {
    getFocusedIndex: () => focusedIndex,
    isFocused: (index) => focusedIndex === index,
    setFocusedIndex(index) {
      if (index === focusedIndex) {
        return;
      }
      const previous = focusedIndex;
      focusedIndex = index;
      notify(previous);
      notify(index);
    },
    subscribeIndex(index, listener) {
      const listeners = listenersByIndex.get(index) ?? new Set<Listener>();
      listeners.add(listener);
      listenersByIndex.set(index, listeners);
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          listenersByIndex.delete(index);
        }
      };
    },
  };
}
