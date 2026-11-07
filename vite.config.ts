import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { mockApi } from './server/mock-api.ts';

const root = import.meta.dirname;
/** GitHub Pages はリポジトリ名のパスの下で配信する */
const PAGES_BASE = '/web-browser-performance-study/';
/** 公開サイトではプロファイリングビルドを別のパスに併設する */
const PAGES_BASES: Readonly<Record<string, string>> = {
  pages: PAGES_BASE,
  'pages-profiling': `${PAGES_BASE}profiling/`,
};
const PROFILING_MODES: ReadonlySet<string> = new Set(['profiling', 'pages-profiling']);
const pageDirectories = readdirSync(resolve(root, 'pages'), { withFileTypes: true }).filter(
  (entry) => entry.isDirectory(),
);

export default defineConfig(({ mode }) => ({
  base: PAGES_BASES[mode] ?? '/',
  plugins: [react(), mockApi()],
  resolve: {
    // React の Profiler は通常の本番ビルドでは動かないので、専用のビルドに差し替える
    alias: PROFILING_MODES.has(mode) ? { 'react-dom/client': 'react-dom/profiling' } : {},
  },
  build: {
    // 既定の対象は Safari 16.4 以降なので、古いエンジンを確かめるときは明示する
    ...(mode === 'safari15' ? { target: 'safari15' } : {}),
    // DevTools で元の関数名を読めるようにする
    sourcemap: true,
    rolldownOptions: {
      input: {
        index: resolve(root, 'index.html'),
        ...Object.fromEntries(
          pageDirectories.map(({ name }) => [name, resolve(root, 'pages', name, 'index.html')]),
        ),
      },
      // React のトラックは実行時の関数名を表示し、ソースマップでは戻らないので名前を残す
      output: { keepNames: PROFILING_MODES.has(mode) },
    },
  },
}));
