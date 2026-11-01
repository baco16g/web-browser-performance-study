import type { ReactNode } from 'react';
import { createVariantHref } from './query.ts';

export type VariantOption<Id extends string = string> = {
  id: Id;
  label: string;
};

type Props = {
  title: string;
  symptom: string;
  variants: readonly VariantOption[];
  activeVariant: string;
  children: ReactNode;
};

export function PageShell({ title, symptom, variants, activeVariant, children }: Props) {
  return (
    <main className="page">
      <header className="page__header">
        <a href="/" className="page__back">
          一覧へ戻る
        </a>
        <h1>{title}</h1>
        <p>{symptom}</p>
        <nav className="variant-switch" aria-label="実装の切り替え">
          {variants.map(({ id, label }) => (
            <a
              key={id}
              href={createVariantHref(id)}
              aria-current={id === activeVariant ? 'page' : undefined}
            >
              {label}
            </a>
          ))}
        </nav>
      </header>
      {children}
    </main>
  );
}
