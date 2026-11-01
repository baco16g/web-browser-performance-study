import {
  type ChangeEvent,
  type KeyboardEvent,
  memo,
  useDeferredValue,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { recordNextFrame } from '../../perf/timing.ts';
import { PageShell, type VariantOption } from '../../shared/page-shell.tsx';
import { createProducts, type Product } from '../../shared/products.ts';
import { readPositiveInt, readVariant } from '../../shared/query.ts';
import { searchProducts } from './search.ts';
import {
  createMicrotaskRunner,
  createSyncRunner,
  createWorkerRunner,
  createYieldingRunner,
  type SearchRunner,
} from './search-runners.ts';
import './styles.css';

const DEFAULT_PRODUCT_COUNT = 50_000;

const VARIANTS = [
  { id: 'bad', label: '同期処理（遅い）' },
  { id: 'microtask', label: 'Promise で分割' },
  { id: 'deferred', label: 'useDeferredValue' },
  { id: 'yield', label: 'メインスレッドを明け渡す' },
  { id: 'worker', label: 'Web Worker' },
] as const satisfies readonly VariantOption[];

type RunnerVariant = Exclude<(typeof VARIANTS)[number]['id'], 'deferred'>;

function createRunner(variant: RunnerVariant, products: readonly Product[]): SearchRunner {
  switch (variant) {
    case 'bad':
      return createSyncRunner(products);
    case 'microtask':
      return createMicrotaskRunner(products);
    case 'yield':
      return createYieldingRunner(products);
    case 'worker':
      return createWorkerRunner(products.length);
  }
}

type SearchResult = { query: string; indices: readonly number[] };

const ResultRow = memo(function ResultRow({ product }: { product: Product }) {
  return (
    <li className="result">
      <span className="result__id">{product.id}</span>
      <span>{product.title}</span>
      <strong>¥{product.price.toLocaleString('ja-JP')}</strong>
    </li>
  );
});

type ResultListProps = {
  products: readonly Product[];
  result: SearchResult;
  inputEventRef: { current: Event | null };
};

/** 結果が画面に出たことを記録し、自動計測のために検索語を属性へ書き出す */
function ResultList({ products, result, inputEventRef }: ResultListProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useLayoutEffect(() => {
    const inputEvent = inputEventRef.current;
    if (inputEvent === null) {
      return;
    }
    recordNextFrame('uc03:results-ready', inputEvent, () => {
      if (listRef.current !== null) {
        listRef.current.dataset.paintedQuery = result.query;
      }
    });
  }, [result, inputEventRef]);

  return (
    <>
      <p className="result-count" data-testid="result-count">
        {result.query === '' ? '検索語を入力してください' : `${result.indices.length} 件`}
      </p>
      <ul ref={listRef} className="results" data-testid="results">
        {result.indices.flatMap((index) => {
          const product = products[index];
          return product === undefined ? [] : [<ResultRow key={product.id} product={product} />];
        })}
      </ul>
    </>
  );
}

type SearchFieldProps = {
  value: string;
  onKeyDown(event: KeyboardEvent): void;
  onChange(event: ChangeEvent<HTMLInputElement>): void;
};

function SearchField({ value, onKeyDown, onChange }: SearchFieldProps) {
  return (
    <label className="search-field">
      <span>商品を探す</span>
      <input
        type="search"
        data-testid="search-input"
        value={value}
        onKeyDown={onKeyDown}
        onChange={onChange}
      />
    </label>
  );
}

/**
 * 計測の始点にする入力イベントを持つ。
 *
 * change の時刻は処理が始まった時刻なので、キーを押した時刻が分かる keydown を優先する。
 * 貼り付けのようにキーを伴わない入力では change を使う。
 */
function useInputEvent() {
  const keydownEventRef = useRef<Event | null>(null);
  const inputEventRef = useRef<Event | null>(null);

  return {
    inputEventRef,
    onKeyDown(event: KeyboardEvent): void {
      keydownEventRef.current = event.nativeEvent;
    },
    captureInputEvent(event: ChangeEvent): void {
      inputEventRef.current = keydownEventRef.current ?? event.nativeEvent;
      keydownEventRef.current = null;
      recordNextFrame('uc03:input-to-next-frame', inputEventRef.current);
    },
  };
}

type SearchProps = { products: readonly Product[] };

/** 入力の反映と検索の実行を分けない画面。検索の進め方だけを runner で切り替える */
function RunnerSearch({ products, runner }: SearchProps & { runner: SearchRunner }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<SearchResult>({ query: '', indices: [] });
  const { inputEventRef, onKeyDown, captureInputEvent } = useInputEvent();

  const onChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const next = event.currentTarget.value;
    captureInputEvent(event);
    setQuery(next);
    runner(next, (indices) => setResult({ query: next, indices }));
  };

  return (
    <>
      <SearchField value={query} onKeyDown={onKeyDown} onChange={onChange} />
      <ResultList products={products} result={result} inputEventRef={inputEventRef} />
    </>
  );
}

/** 入力の反映を先に済ませ、検索は React の後回しのレンダリングの中で行う画面 */
function DeferredSearch({ products }: SearchProps) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const { inputEventRef, onKeyDown, captureInputEvent } = useInputEvent();
  const result = useMemo(
    () => ({ query: deferredQuery, indices: searchProducts(products, deferredQuery) }),
    [products, deferredQuery],
  );

  const onChange = (event: ChangeEvent<HTMLInputElement>): void => {
    captureInputEvent(event);
    setQuery(event.currentTarget.value);
  };

  return (
    <>
      <SearchField value={query} onKeyDown={onKeyDown} onChange={onChange} />
      <ResultList products={products} result={result} inputEventRef={inputEventRef} />
    </>
  );
}

export function App() {
  const variant = readVariant(['bad', 'microtask', 'deferred', 'yield', 'worker']);
  const products = useMemo(
    () => createProducts(readPositiveInt('count', DEFAULT_PRODUCT_COUNT)),
    [],
  );
  const runner = useMemo(
    () => (variant === 'deferred' ? null : createRunner(variant, products)),
    [variant, products],
  );

  return (
    <PageShell
      title="UC3 絞り込み中に入力が固まる"
      symptom="5万件の商品を絞り込むと、打った文字が画面に出るまでに待たされる。"
      variants={VARIANTS}
      activeVariant={variant}
    >
      {runner === null ? (
        <DeferredSearch products={products} />
      ) : (
        <RunnerSearch products={products} runner={runner} />
      )}
    </PageShell>
  );
}
