const REPOSITORY_URL = 'https://github.com/baco16g/web-browser-performance-study';

type Props = { title: string };

/** 静的な配信ではモック API が動かないページの代わりに表示する */
export function ServerRequiredNotice({ title }: Props) {
  return (
    <main className="page">
      <header className="page__header">
        <a href={import.meta.env.BASE_URL} className="page__back">
          一覧へ戻る
        </a>
        <h1>{title}</h1>
        <p>
          この教材はモック API を使うので、公開サイトでは動きません。
          <a href={REPOSITORY_URL}>リポジトリ</a>
          を手元に取得して、<code>npm run dev</code> で開いてください。
        </p>
      </header>
    </main>
  );
}
