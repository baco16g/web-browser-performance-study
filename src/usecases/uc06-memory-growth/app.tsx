import { useEffect, useMemo, useRef, useState } from 'react';
import { recorder } from '../../perf/recorder.ts';
import { PageShell, type VariantOption } from '../../shared/page-shell.tsx';
import { createProducts, type Product } from '../../shared/products.ts';
import { readVariant } from '../../shared/query.ts';
import { createDetail, createDetailCache, type DetailCache, type ProductDetail } from './detail.ts';
import { createStrategy, type MemoryStrategy, VARIANT_IDS, type VariantId } from './strategy.ts';
import './styles.css';

const PRODUCT_COUNT = 200;
const ROUND_TRIPS_PER_RUN = 10;
const CACHE_CAPACITY = 20;
const VISIBLE_REVIEWS = 20;
const NARROW_VIEWPORT = 800;

const VARIANTS: readonly VariantOption<VariantId>[] = [
  { id: 'bad', label: '対策なし（増え続ける）' },
  { id: 'listener', label: 'リスナーを外す' },
  { id: 'detached', label: '+ 要素の登録を外す' },
  { id: 'good', label: '+ キャッシュに上限' },
];

/** 開いたことのある詳細画面の要素。外し忘れると、画面を離れても要素が残る */
const visitedSections = new Set<HTMLElement>();

function waitForNextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => setTimeout(resolve));
  });
}

type DetailViewProps = { detail: ProductDetail; strategy: MemoryStrategy };

function DetailView({ detail, strategy }: DetailViewProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const [narrow, setNarrow] = useState(window.innerWidth < NARROW_VIEWPORT);

  useEffect(() => {
    // この関数は detail を参照するので、登録が残ると detail も回収されない
    const onResize = (): void => {
      setNarrow(window.innerWidth < NARROW_VIEWPORT && detail.reviews.length > 0);
    };
    window.addEventListener('resize', onResize);
    if (strategy.removesListeners) {
      return () => window.removeEventListener('resize', onResize);
    }
    return undefined;
  }, [detail, strategy]);

  useEffect(() => {
    const section = sectionRef.current;
    if (section === null) {
      return undefined;
    }
    visitedSections.add(section);
    if (strategy.releasesElements) {
      return () => {
        visitedSections.delete(section);
      };
    }
    return undefined;
  }, [strategy]);

  return (
    <section ref={sectionRef} className="detail" data-testid="detail" data-narrow={narrow}>
      <h2>{detail.product.title}</h2>
      <p>{detail.product.description}</p>
      <ul>
        {detail.reviews.slice(0, VISIBLE_REVIEWS).map((review) => (
          <li key={review.id}>{review.body}</li>
        ))}
      </ul>
    </section>
  );
}

function loadDetail(product: Product, cache: DetailCache): ProductDetail {
  const cached = cache.get(product.id);
  if (cached !== undefined) {
    return cached;
  }
  const detail = createDetail(product);
  cache.set(product.id, detail);
  return detail;
}

export function App() {
  const variant = readVariant(VARIANT_IDS);
  const strategy = useMemo(() => createStrategy(variant), [variant]);
  const products = useMemo(() => createProducts(PRODUCT_COUNT), []);
  const cache = useMemo(
    () => createDetailCache(strategy.boundedCache ? CACHE_CAPACITY : null),
    [strategy],
  );
  const [openDetail, setOpenDetail] = useState<ProductDetail | null>(null);
  const nextProductIndexRef = useRef(0);

  /** 別々の商品の詳細を開いては一覧へ戻る操作を、人の代わりに繰り返す */
  const onRunRoundTrips = async (): Promise<void> => {
    for (let trip = 0; trip < ROUND_TRIPS_PER_RUN; trip += 1) {
      const product = products[nextProductIndexRef.current % products.length];
      nextProductIndexRef.current += 1;
      if (product !== undefined) {
        setOpenDetail(loadDetail(product, cache));
        await waitForNextFrame();
      }
      setOpenDetail(null);
      await waitForNextFrame();
    }
    recorder.record('uc06:round-trips', ROUND_TRIPS_PER_RUN, 'count');
  };

  return (
    <PageShell
      title="UC6 画面を行き来するとメモリが増える"
      symptom="一覧と詳細を往復するたびにメモリが増え、回収されずに残り続ける。"
      variants={VARIANTS}
      activeVariant={variant}
    >
      <div className="toolbar">
        <button
          type="button"
          className="button"
          data-testid="run-round-trips"
          onClick={() => void onRunRoundTrips()}
        >
          {ROUND_TRIPS_PER_RUN} 回往復する
        </button>
      </div>
      {openDetail === null ? (
        <ul className="memory-list" data-testid="product-list">
          {products.slice(0, VISIBLE_REVIEWS).map((product) => (
            <li key={product.id}>
              <button
                type="button"
                className="button"
                onClick={() => setOpenDetail(loadDetail(product, cache))}
              >
                {product.title}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <>
          <button
            type="button"
            className="button"
            data-testid="back-to-list"
            onClick={() => setOpenDetail(null)}
          >
            一覧へ戻る
          </button>
          <DetailView key={openDetail.product.id} detail={openDetail} strategy={strategy} />
        </>
      )}
    </PageShell>
  );
}
