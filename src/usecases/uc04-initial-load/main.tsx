import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { installPerf } from '../../perf/install.ts';
import '../../shared/styles.css';
import { App } from './app.tsx';

installPerf();

const container = document.getElementById('root');
if (container === null) {
  throw new Error('#root が見つかりません');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
