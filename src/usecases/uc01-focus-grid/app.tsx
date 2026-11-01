import {
  type CSSProperties,
  type KeyboardEvent,
  Profiler,
  type ProfilerOnRenderCallback,
  useMemo,
} from 'react';
import { recorder } from '../../perf/recorder.ts';
import { recordNextFrame } from '../../perf/timing.ts';
import { PageShell, type VariantOption } from '../../shared/page-shell.tsx';
import { createProducts } from '../../shared/products.ts';
import { readPositiveInt, readVariant } from '../../shared/query.ts';
import { StateGrid } from './state-grid.tsx';
import { StoreGrid } from './store-grid.tsx';
import { PRICE_LOCALE, tileRenderCounter } from './tile.tsx';
import './styles.css';

const COLUMNS = 5;
const DEFAULT_TILE_COUNT = 3_000;

const VARIANTS = [
  { id: 'bad', label: '親の state（遅い）' },
  { id: 'formatter', label: '親の state + 整形の使い回し' },
  { id: 'memo', label: '親の state + memo' },
  { id: 'store', label: '外部ストア' },
  { id: 'transform', label: '外部ストア + transform' },
  { id: 'good', label: '外部ストア + transform + 重なりの固定' },
] as const satisfies readonly VariantOption[];

type VariantId = (typeof VARIANTS)[number]['id'];

/** フォーカスしたタイルを目立たせる方法 */
const EMPHASIS: Record<VariantId, 'resize' | 'transform' | 'stable-transform'> = {
  bad: 'resize',
  formatter: 'resize',
  memo: 'resize',
  store: 'resize',
  transform: 'transform',
  good: 'stable-transform',
};

/** レンダリングの時間は profiling ビルドでだけ記録される */
const onRender: ProfilerOnRenderCallback = (_id, phase, actualDuration, baseDuration) => {
  if (phase === 'update') {
    recorder.record('uc01:react-actual', actualDuration);
    recorder.record('uc01:react-base', baseDuration);
  }
};

function trackMove(event: KeyboardEvent): void {
  tileRenderCounter.count = 0;
  recordNextFrame('uc01:input-to-next-frame', event.nativeEvent, () => {
    recorder.record('uc01:tile-renders', tileRenderCounter.count, 'count');
  });
}

export function App() {
  const variant = readVariant(['bad', 'formatter', 'memo', 'store', 'transform', 'good']);
  const products = useMemo(() => createProducts(readPositiveInt('count', DEFAULT_TILE_COUNT)), []);
  const usesParentState = variant === 'bad' || variant === 'formatter' || variant === 'memo';
  const priceFormat = useMemo(
    () => (variant === 'formatter' ? new Intl.NumberFormat(PRICE_LOCALE) : undefined),
    [variant],
  );

  return (
    <PageShell
      title="UC1 十字キーのフォーカス移動が遅い"
      symptom="3,000件のグリッドで矢印キーを押すと、フォーカス枠が動くまでに引っかかる。"
      variants={VARIANTS}
      activeVariant={variant}
    >
      <div
        className="focus-grid"
        data-testid="focus-grid"
        data-emphasis={EMPHASIS[variant]}
        style={{ '--columns': COLUMNS } as CSSProperties}
      >
        <Profiler id="focus-grid" onRender={onRender}>
          {usesParentState ? (
            <StateGrid
              products={products}
              columns={COLUMNS}
              memoized={variant === 'memo'}
              priceFormat={priceFormat}
              onMove={trackMove}
            />
          ) : (
            <StoreGrid products={products} columns={COLUMNS} onMove={trackMove} />
          )}
        </Profiler>
      </div>
    </PageShell>
  );
}
