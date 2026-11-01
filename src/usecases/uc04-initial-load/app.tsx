import { memo, startTransition, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { recorder } from '../../perf/recorder.ts';
import { recordTimeAfterNextFrame } from '../../perf/timing.ts';
import { PageShell, type VariantOption } from '../../shared/page-shell.tsx';
import type { Product } from '../../shared/products.ts';
import { readPositiveInt, readVariant } from '../../shared/query.ts';
import { type Banner, type Catalog, type Hero, loadBanner, loadCatalog } from './catalog.ts';
import { createStrategy, type LoadStrategy, VARIANT_IDS, type VariantId } from './strategy.ts';
import './styles.css';

const DEFAULT_PRODUCT_COUNT = 2_000;
const DEFAULT_API_DELAY_MS = 100;
const BANNER_DELAY_MS = 600;
const INITIAL_ROW_COUNT = 40;
const HERO_DISPLAY_SIZE = 480;
const OVERSIZED_HERO_SIZE = 2048;
const FITTED_HERO_SIZE = 1024;

const VARIANTS: readonly VariantOption<VariantId>[] = [
  { id: 'bad', label: '対策なし（遅い）' },
  { id: 'parallel', label: 'API を並列に' },
  { id: 'priority', label: '+ 主要画像を優先' },
  { id: 'reserved', label: '+ 領域を確保' },
  { id: 'early', label: '+ HTML で取得開始' },
  { id: 'good', label: '+ 段階的に描画' },
];

type HeroSectionProps = { hero: Hero; strategy: LoadStrategy };

function HeroSection({ hero, strategy }: HeroSectionProps) {
  const size = strategy.prioritizedHero ? FITTED_HERO_SIZE : OVERSIZED_HERO_SIZE;
  return (
    <section className="hero">
      <img
        src={`/generated/product-${hero.imageId}-${size}.jpg`}
        alt={hero.title}
        data-testid="hero-image"
        loading={strategy.prioritizedHero ? 'eager' : 'lazy'}
        fetchPriority={strategy.prioritizedHero ? 'high' : 'auto'}
        onLoad={() => recorder.record('uc04:hero-loaded', performance.now())}
        {...(strategy.reservedSpace ? { width: HERO_DISPLAY_SIZE, height: HERO_DISPLAY_SIZE } : {})}
      />
      <div>
        <h2>{hero.title}</h2>
        <p>毎日の作業を支える定番の品を集めました。</p>
      </div>
    </section>
  );
}

const CatalogRow = memo(function CatalogRow({ product }: { product: Product }) {
  return (
    <li className="catalog-row">
      <strong>{product.title}</strong>
      <span>{product.description}</span>
      <span>¥{product.price.toLocaleString('ja-JP')}</span>
    </li>
  );
});

type CatalogListProps = { products: readonly Product[]; progressive: boolean };

/** 最初の範囲が描けた時点を「操作できる」、全件が描けた時点を「完了」として記録する */
function CatalogList({ products, progressive }: CatalogListProps) {
  const [rowCount, setRowCount] = useState(progressive ? INITIAL_ROW_COUNT : products.length);

  useLayoutEffect(() => {
    recordTimeAfterNextFrame('uc04:usable');
  }, []);

  useEffect(() => {
    if (rowCount < products.length) {
      startTransition(() => setRowCount(products.length));
    } else {
      recordTimeAfterNextFrame('uc04:list-complete');
    }
  }, [rowCount, products.length]);

  return (
    <ul className="catalog-list" data-testid="catalog-list">
      {products.slice(0, rowCount).map((product) => (
        <CatalogRow key={product.id} product={product} />
      ))}
    </ul>
  );
}

export function App() {
  const variant = readVariant(VARIANT_IDS);
  const strategy = useMemo(() => createStrategy(variant), [variant]);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [banner, setBanner] = useState<Banner | null>(null);

  useEffect(() => {
    const delayMs = readPositiveInt('delay', DEFAULT_API_DELAY_MS);
    const count = readPositiveInt('count', DEFAULT_PRODUCT_COUNT);

    void loadCatalog({ count, delayMs, parallel: strategy.parallelFetch }).then((loaded) => {
      recorder.record('uc04:data-ready', performance.now());
      setCatalog(loaded);
    });
    void loadBanner(BANNER_DELAY_MS).then((loaded) => {
      setBanner(loaded);
      recordTimeAfterNextFrame('uc04:banner-shown');
    });
  }, [strategy]);

  return (
    <PageShell
      title="UC4 初期表示と操作可能になるまでが遅い"
      symptom="API はすぐ返るのに、主要な画像が出て操作できるようになるまで時間がかかる。"
      variants={VARIANTS}
      activeVariant={variant}
    >
      <div className="hero-slot" data-reserved={strategy.reservedSpace}>
        {catalog !== null && <HeroSection hero={catalog.hero} strategy={strategy} />}
      </div>
      <div className="banner-slot" data-reserved={strategy.reservedSpace}>
        {banner !== null && <p className="banner">{banner.message}</p>}
      </div>
      {catalog !== null && (
        <CatalogList products={catalog.products} progressive={strategy.progressiveList} />
      )}
    </PageShell>
  );
}
