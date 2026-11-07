import { defineConfig } from 'vitepress';

/** 解説の行番号はこの版のソースに合わせてある。版を上げるときは本文も読み直す */
const REACT_SOURCE_VERSION = '19.3.1';
const REACT_SOURCE_URL = `https://github.com/facebook/react/blob/v${REACT_SOURCE_VERSION}/packages/`;
/** 本文では `react:<packages からのパス>` と書き、ここで GitHub の URL に変える */
const REACT_SOURCE_SCHEME = 'react:';
const REPOSITORY_URL = 'https://github.com/baco16g/web-browser-performance-study';
/** GitHub Pages ではリポジトリ名の下の react-internals/ に置く */
const BASE = '/web-browser-performance-study/react-internals/';

export default defineConfig({
  lang: 'ja-JP',
  title: 'React 19 の内部を読む',
  description: 'React 19 のソースコードを、パフォーマンス計測に関わる部分から読み解く',
  base: BASE,
  outDir: '../dist/react-internals',
  cleanUrls: true,
  markdown: {
    config(md) {
      const renderLink =
        md.renderer.rules.link_open ??
        ((tokens, index, options, _env, self) => self.renderToken(tokens, index, options));
      md.renderer.rules.link_open = (tokens, index, options, env, self) => {
        const token = tokens[index];
        const href = token?.attrGet('href');
        if (token && href?.startsWith(REACT_SOURCE_SCHEME)) {
          token.attrSet('href', `${REACT_SOURCE_URL}${href.slice(REACT_SOURCE_SCHEME.length)}`);
        }
        return renderLink(tokens, index, options, env, self);
      };
    },
  },
  themeConfig: {
    nav: [
      { text: '解説', link: '/overview' },
      { text: '計測の教材', link: REPOSITORY_URL },
    ],
    sidebar: [
      {
        text: '全体像',
        items: [
          { text: 'はじめに', link: '/' },
          { text: '1. 全体像', link: '/overview' },
        ],
      },
      {
        text: '更新が画面に届くまで',
        items: [
          { text: '2. Hooks と state', link: '/hooks-and-state' },
          { text: '3. 更新の予約', link: '/scheduling-updates' },
          { text: '4. Scheduler と時間分割', link: '/scheduler' },
        ],
      },
      {
        text: 'render を省く',
        items: [
          { text: '5. render を省く仕組み', link: '/bailout' },
          { text: '6. 子の調整と key', link: '/reconciliation' },
          { text: '7. メモ化', link: '/memoization' },
        ],
      },
      {
        text: '機能と計測',
        items: [
          { text: '8. commit と effect', link: '/commit-and-effects' },
          { text: '9. 外部ストア', link: '/external-store' },
          { text: '10. 中断できる更新', link: '/transitions' },
          { text: '11. 計測の仕組み', link: '/profiling' },
        ],
      },
      {
        text: '付録',
        items: [{ text: '名前の対応表', link: '/appendix-names' }],
      },
    ],
    outline: { level: [2, 3], label: 'このページの内容' },
    docFooter: { prev: '前のページ', next: '次のページ' },
    sidebarMenuLabel: 'メニュー',
    returnToTopLabel: '先頭に戻る',
    search: {
      provider: 'local',
      options: {
        translations: {
          button: { buttonText: '検索', buttonAriaLabel: '検索' },
          modal: {
            displayDetails: '詳細を表示',
            resetButtonTitle: '検索語を消す',
            backButtonTitle: '閉じる',
            noResultsText: '見つかりませんでした',
            footer: { selectText: '選ぶ', navigateText: '移動', closeText: '閉じる' },
          },
        },
      },
    },
    socialLinks: [{ icon: 'github', link: REPOSITORY_URL }],
  },
});
