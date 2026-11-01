import { useVirtualizer } from '@tanstack/react-virtual';
import { type CSSProperties, type UIEvent, useMemo, useRef, useState } from 'react';
import { recorder } from '../../perf/recorder.ts';
import { PageShell, type VariantOption } from '../../shared/page-shell.tsx';
import { createProducts, type Product } from '../../shared/products.ts';
import { readPositiveInt, readVariant } from '../../shared/query.ts';
import { estimateDecodedImageBytes, runScrollTest } from './scroll-test.ts';
import { createStrategy, type ScrollStrategy, VARIANT_IDS, type VariantId } from './strategy.ts';
import './styles.css';

const COLUMNS = 5;
const ROW_HEIGHT = 280;
const OVERSCAN_ROWS = 2;
const DEFAULT_PRODUCT_COUNT = 1_000;
const OVERSIZED_IMAGE = 1024;
const FITTED_IMAGE = 256;
const SCROLL_DURATION_MS = 3_000;
const SCROLL_PIXELS_PER_FRAME = 24;

function formatRowLabel(scrollTop: number, rowCount: number): string {
  return `${Math.floor(scrollTop / ROW_HEIGHT) + 1} / ${rowCount} 行目`;
}

const VARIANTS: readonly VariantOption<VariantId>[] = [
  { id: 'bad', label: '対策なし（遅い）' },
  { id: 'isolated', label: '位置の state を分離' },
  { id: 'light', label: '+ 軽い表現' },
  { id: 'sized', label: '+ 画像の寸法を合わせる' },
  { id: 'lazy', label: '+ 遅延読み込み' },
  { id: 'good', label: '+ 仮想化' },
];

type TileProps = { product: Product; index: number; strategy: ScrollStrategy };

function Tile({ product, index, strategy }: TileProps) {
  const size = strategy.sizedImages ? FITTED_IMAGE : OVERSIZED_IMAGE;
  return (
    <article className="list-tile">
      {/* 実際の商品のように画像ごとにデコードされるよう、URL を項目ごとに分ける */}
      <img
        src={`${import.meta.env.BASE_URL}generated/product-${product.imageId}-${size}.jpg?tile=${index}`}
        alt=""
        width={FITTED_IMAGE}
        height={FITTED_IMAGE}
        loading={strategy.lazyImages ? 'lazy' : 'eager'}
        decoding={strategy.lazyImages ? 'async' : 'auto'}
      />
      <h2>{product.title}</h2>
      <strong>¥{product.price.toLocaleString('ja-JP')}</strong>
    </article>
  );
}

type RowProps = {
  products: readonly Product[];
  rowIndex: number;
  strategy: ScrollStrategy;
};

function Row({ products, rowIndex, strategy }: RowProps) {
  const start = rowIndex * COLUMNS;
  return (
    <>
      {products.slice(start, start + COLUMNS).map((product, column) => (
        <Tile key={product.id} product={product} index={start + column} strategy={strategy} />
      ))}
    </>
  );
}

type ListProps = {
  products: readonly Product[];
  strategy: ScrollStrategy;
};

function PlainList({ products, strategy }: ListProps) {
  // 行の先頭の商品で行を識別する
  const rowLeaders = products.filter((_, index) => index % COLUMNS === 0);
  return (
    <div className="list-rows">
      {rowLeaders.map(({ id }, rowIndex) => (
        <div key={id} className="list-row">
          <Row products={products} rowIndex={rowIndex} strategy={strategy} />
        </div>
      ))}
    </div>
  );
}

function VirtualList({ products, strategy, scroller }: ListProps & { scroller: HTMLElement }) {
  const virtualizer = useVirtualizer({
    count: Math.ceil(products.length / COLUMNS),
    getScrollElement: () => scroller,
    estimateSize: () => ROW_HEIGHT,
    overscan: OVERSCAN_ROWS,
  });

  return (
    <div className="list-virtual" style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map(({ key, index, start }) => (
        <div
          key={key}
          className="list-row list-row--virtual"
          style={{ transform: `translateY(${start}px)` }}
        >
          <Row products={products} rowIndex={index} strategy={strategy} />
        </div>
      ))}
    </div>
  );
}

export function App() {
  const variant = readVariant(VARIANT_IDS);
  const strategy = useMemo(() => createStrategy(variant), [variant]);
  const products = useMemo(
    () => createProducts(readPositiveInt('count', DEFAULT_PRODUCT_COUNT)),
    [],
  );
  const rowCount = Math.ceil(products.length / COLUMNS);
  // 仮想化は要素の大きさを初回の描画で読むので、ref ではなく state で子に渡す
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const rowLabelRef = useRef<HTMLSpanElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  // disabled にするとフォーカスが外れて次のキー入力が届かなくなるので、ボタンは有効なままにする
  const runningRef = useRef(false);

  const onRunScrollTest = (): void => {
    if (scroller === null || runningRef.current) {
      return;
    }
    runningRef.current = true;
    void runScrollTest(scroller, SCROLL_DURATION_MS, SCROLL_PIXELS_PER_FRAME).then((stats) => {
      recorder.record('uc05:decoded-image-bytes', estimateDecodedImageBytes(scroller), 'bytes');
      recorder.record('uc05:dropped-frames', stats.droppedFrames, 'count');
      recorder.record('uc05:p95-frame', stats.p95FrameMs);
      runningRef.current = false;
    });
  };

  const onScroll = ({ currentTarget }: UIEvent<HTMLDivElement>): void => {
    if (!strategy.isolatedScrollState) {
      // 親の state を更新するので、スクロールのたびに全タイルが再レンダリングされる
      setScrollTop(currentTarget.scrollTop);
      return;
    }
    const label = rowLabelRef.current;
    const nextLabel = formatRowLabel(currentTarget.scrollTop, rowCount);
    // 同じ文字列でも書き込むとレイアウトとペイントが走るので、変わったときだけ書き換える
    if (label !== null && label.textContent !== nextLabel) {
      label.textContent = nextLabel;
    }
  };

  return (
    <PageShell
      title="UC5 スクロールがカクつく"
      symptom="画像の多い一覧をスクロールすると、ときどき止まって見える。"
      variants={VARIANTS}
      activeVariant={variant}
    >
      <div className="toolbar">
        <button
          type="button"
          className="button"
          data-testid="run-scroll-test"
          onClick={onRunScrollTest}
        >
          自動スクロールを始める
        </button>
        <span ref={rowLabelRef} data-testid="row-label">
          {formatRowLabel(scrollTop, rowCount)}
        </span>
      </div>
      <div
        ref={setScroller}
        className="list-scroller"
        data-testid="list-scroller"
        data-light={strategy.lightEffects}
        onScroll={onScroll}
        style={{ '--columns': COLUMNS, '--row-height': `${ROW_HEIGHT}px` } as CSSProperties}
      >
        {!strategy.virtualized && <PlainList products={products} strategy={strategy} />}
        {strategy.virtualized && scroller !== null && (
          <VirtualList products={products} strategy={strategy} scroller={scroller} />
        )}
      </div>
    </PageShell>
  );
}
