import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Connect, Plugin } from 'vite';
import { createProducts, findProduct } from '../src/shared/products.ts';

const DEFAULT_PRODUCT_COUNT = 60;
const MAX_PRODUCT_COUNT = 5_000;
const MAX_DELAY_MS = 10_000;

/** クエリの数値を読み、範囲外の値は上限に丸める */
function readBoundedInt(url: URL, name: string, fallback: number, max: number): number {
  const value = Number(url.searchParams.get(name) ?? fallback);
  return Number.isFinite(value) ? Math.min(Math.max(0, Math.floor(value)), max) : fallback;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendJson(res: ServerResponse, status: number, body: object): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/** 遅延を `?delay=` で指定できる固定データの API。通信の揺れを計測から取り除く */
async function handleApi(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (!url.pathname.startsWith('/api/')) {
    next();
    return;
  }

  await wait(readBoundedInt(url, 'delay', 0, MAX_DELAY_MS));

  if (url.pathname === '/api/products') {
    const count = readBoundedInt(url, 'count', DEFAULT_PRODUCT_COUNT, MAX_PRODUCT_COUNT);
    sendJson(res, 200, { products: createProducts(count) });
    return;
  }

  if (url.pathname === '/api/hero') {
    sendJson(res, 200, { title: '今週のおすすめ', imageId: 0 });
    return;
  }

  if (url.pathname === '/api/banner') {
    sendJson(res, 200, { message: '期間限定で送料が無料になります' });
    return;
  }

  const id = url.pathname.match(/^\/api\/products\/([^/]+)$/)?.[1];
  const product = id === undefined ? undefined : findProduct(id);
  if (product !== undefined) {
    sendJson(res, 200, product);
    return;
  }

  sendJson(res, 404, { code: 'NOT_FOUND' });
}

function installMiddleware(middlewares: Connect.Server): void {
  middlewares.use((req, res, next) => {
    void handleApi(req, res, next);
  });
}

export function mockApi(): Plugin {
  return {
    name: 'mock-api',
    configureServer(server) {
      installMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      installMiddleware(server.middlewares);
    },
  };
}
