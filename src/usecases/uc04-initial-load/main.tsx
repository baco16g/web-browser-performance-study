import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installPerf } from '../../perf/install.ts';
import { ServerRequiredNotice } from '../../shared/server-required-notice.tsx';
import '../../shared/styles.css';
import { App } from './app.tsx';

installPerf();

const container = document.getElementById('root');
if (container === null) {
  throw new Error('#root が見つかりません');
}

createRoot(container).render(
  <StrictMode>
    {import.meta.env.MODE.startsWith('pages') ? (
      <ServerRequiredNotice title="UC4 初期表示と操作可能になるまでが遅い" />
    ) : (
      <App />
    )}
  </StrictMode>,
);
