import { type CSSProperties, type MouseEvent, useLayoutEffect, useMemo, useRef } from 'react';
import { measureSync, recordNextFrame } from '../../perf/timing.ts';
import { PageShell, type VariantOption } from '../../shared/page-shell.tsx';
import { createProducts } from '../../shared/products.ts';
import { readPositiveInt, readVariant } from '../../shared/query.ts';
import { type EqualizeStrategy, equalizeBatched, equalizeInterleaved } from './equalize.ts';
import './styles.css';

const COLUMNS = 5;
const DEFAULT_CARD_COUNT = 300;

const VARIANTS = [
  { id: 'bad', label: '読み書きが交互（遅い）' },
  { id: 'good', label: '読み書きを分離' },
  { id: 'css', label: 'CSS に任せる' },
] as const satisfies readonly VariantOption[];

type VariantId = (typeof VARIANTS)[number]['id'];

/** CSS に任せる実装では、JavaScript は寸法を読まない */
const STRATEGIES: Record<VariantId, EqualizeStrategy | null> = {
  bad: equalizeInterleaved,
  good: equalizeBatched,
  css: null,
};

export function App() {
  const variant = readVariant(['bad', 'good', 'css']);
  const strategy = STRATEGIES[variant];
  const products = useMemo(() => createProducts(readPositiveInt('count', DEFAULT_CARD_COUNT)), []);
  const gridRef = useRef<HTMLDivElement>(null);

  const equalize = (): void => {
    const grid = gridRef.current;
    if (grid !== null && strategy !== null) {
      strategy([...grid.querySelectorAll<HTMLElement>('[data-card]')], COLUMNS);
    }
  };

  useLayoutEffect(equalize);

  const onChangeTextSize = (event: MouseEvent<HTMLButtonElement>): void => {
    measureSync('uc02:change-text-size', () => {
      const grid = gridRef.current;
      if (grid !== null) {
        grid.dataset.textSize = grid.dataset.textSize === 'large' ? 'normal' : 'large';
      }
      equalize();
    });
    recordNextFrame('uc02:input-to-next-frame', event.nativeEvent);
  };

  return (
    <PageShell
      title="UC2 カードの高さ揃えが重い"
      symptom="文字サイズを切り替えると、カードの高さを揃え直す間だけ画面が固まる。"
      variants={VARIANTS}
      activeVariant={variant}
    >
      <div className="toolbar">
        <button
          type="button"
          className="button"
          data-testid="change-text-size"
          onClick={onChangeTextSize}
        >
          文字サイズを切り替える
        </button>
        <span>{products.length} 枚</span>
      </div>
      <div
        ref={gridRef}
        className="card-grid"
        data-testid="card-grid"
        data-text-size="normal"
        data-stretch={strategy === null}
        style={{ '--columns': COLUMNS } as CSSProperties}
      >
        {products.map((product) => (
          <article key={product.id} className="card" data-card>
            <h2>{product.title}</h2>
            <p>{product.description}</p>
            <strong>¥{product.price.toLocaleString('ja-JP')}</strong>
          </article>
        ))}
      </div>
    </PageShell>
  );
}
