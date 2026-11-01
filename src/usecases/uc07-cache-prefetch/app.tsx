import { type KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { supportsEntryType } from '../../perf/observers.ts';
import { recorder } from '../../perf/recorder.ts';
import { recordNextFrame } from '../../perf/timing.ts';
import { PageShell, type VariantOption } from '../../shared/page-shell.tsx';
import { createProducts } from '../../shared/products.ts';
import { readPositiveInt, readVariant } from '../../shared/query.ts';
import { type CatalogDetail, createDetailLoader } from './detail-loader.ts';
import { createStrategy, VARIANT_IDS, type VariantId } from './strategy.ts';
import './styles.css';

const PRODUCT_COUNT = 24;
const DEFAULT_SERVER_DELAY_MS = 200;
/** 通り過ぎただけの項目を先読みしないよう、フォーカスがとどまるのを待つ */
const PREFETCH_DWELL_MS = 150;

const VARIANTS: readonly VariantOption<VariantId>[] = [
  { id: 'bad', label: 'キャッシュなし（遅い）' },
  { id: 'revalidate', label: 'ETag で再検証' },
  { id: 'fresh', label: 'max-age' },
  { id: 'memory', label: '+ メモリに保持' },
  { id: 'good', label: '+ フォーカスで先読み' },
];

function focusElement(element: HTMLElement | null): void {
  element?.focus();
}

/** カタログ API の通信量と回数を Resource Timing から記録する */
function useCatalogTransferRecording(): void {
  useEffect(() => {
    if (!supportsEntryType('resource')) {
      return undefined;
    }
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntriesByType('resource')) {
        if (entry.name.includes('/api/catalog/')) {
          const { transferSize } = entry as PerformanceResourceTiming;
          recorder.record('uc07:transfer', transferSize, 'bytes');
        }
      }
    });
    observer.observe({ type: 'resource' });
    return () => observer.disconnect();
  }, []);
}

type DetailViewProps = {
  detail: CatalogDetail | null;
  onBack(): void;
};

function DetailView({ detail, onBack }: DetailViewProps) {
  const backRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    backRef.current?.focus();
  }, []);

  return (
    <section className="catalog-detail" data-testid="catalog-detail">
      <button ref={backRef} type="button" className="button" onClick={onBack}>
        一覧へ戻る
      </button>
      {detail === null ? (
        <p data-testid="detail-loading">読み込み中</p>
      ) : (
        <>
          <h2>{detail.product.title}</h2>
          <p>{detail.product.description}</p>
          <p data-testid="detail-revision">第 {detail.revision} 版</p>
        </>
      )}
    </section>
  );
}

export function App() {
  const variant = readVariant(VARIANT_IDS);
  const strategy = useMemo(() => createStrategy(variant), [variant]);
  const products = useMemo(() => createProducts(PRODUCT_COUNT), []);
  const loader = useMemo(
    () => createDetailLoader(strategy, readPositiveInt('delay', DEFAULT_SERVER_DELAY_MS)),
    [strategy],
  );
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CatalogDetail | null>(null);
  const keydownEventRef = useRef<Event | null>(null);
  const openEventRef = useRef<Event | null>(null);
  const visitedIdsRef = useRef(new Set<string>());
  // 一覧は描き直されて要素が作り変わるので、戻り先は要素ではなく商品の ID で覚える
  const returnFocusIdRef = useRef<string | null>(null);
  const dwellTimerRef = useRef(0);

  useCatalogTransferRecording();

  const onOpen = (id: string, clickEvent: Event): void => {
    clearTimeout(dwellTimerRef.current);
    openEventRef.current = keydownEventRef.current ?? clickEvent;
    returnFocusIdRef.current = id;
    setOpenId(id);
    setDetail(loader.peek(id) ?? null);
    void loader.load(id).then((loaded) => {
      setDetail((current) => (current?.product.id === id ? current : loaded));
    });
  };

  const onBack = (): void => {
    setOpenId(null);
    setDetail(null);
  };

  const onFocusTile = (id: string): void => {
    if (strategy.prefetchOnFocus) {
      dwellTimerRef.current = window.setTimeout(() => void loader.load(id), PREFETCH_DWELL_MS);
    }
  };

  // 内容が表示されたら、初回の表示か再表示かを分けて時間を記録する
  useLayoutEffect(() => {
    const openEvent = openEventRef.current;
    if (detail === null || openEvent === null) {
      return;
    }
    openEventRef.current = null;
    const { id } = detail.product;
    const sample = visitedIdsRef.current.has(id) ? 'uc07:revisit' : 'uc07:first-visit';
    visitedIdsRef.current.add(id);
    recordNextFrame(sample, openEvent);
  }, [detail]);

  const onKeyDown = (event: KeyboardEvent): void => {
    keydownEventRef.current = event.nativeEvent;
    if (event.key === 'Escape' && openId !== null) {
      onBack();
    }
  };

  return (
    <PageShell
      title="UC7 再表示や詳細表示が遅い"
      symptom="同じ商品をもう一度開いても、毎回読み込みを待たされる。"
      variants={VARIANTS}
      activeVariant={variant}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: キー入力の時刻を計測の始点として記録するための集約点 */}
      <div onKeyDown={onKeyDown}>
        {openId === null ? (
          <ul className="catalog-tiles" data-testid="catalog-tiles">
            {products.map(({ id, title }, index) => (
              <li key={id}>
                <button
                  ref={id === returnFocusIdRef.current ? focusElement : undefined}
                  type="button"
                  className="button"
                  data-testid={`catalog-tile-${index}`}
                  onFocus={() => onFocusTile(id)}
                  onBlur={() => clearTimeout(dwellTimerRef.current)}
                  onClick={(event) => onOpen(id, event.nativeEvent)}
                >
                  {title}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <DetailView detail={detail} onBack={onBack} />
        )}
      </div>
    </PageShell>
  );
}
