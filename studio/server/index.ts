import { resolve } from 'node:path';
import { createCmsApp } from './app';

const app = createCmsApp({
  dbPath: process.env.FORMA_DB_PATH ?? resolve('data/forma.sqlite'),
  origin: process.env.FORMA_ORIGIN,
  staticDir: resolve('dist'),
  secureCookies: process.env.FORMA_SECURE_COOKIES === '1' ? true : undefined,
});
const server = Bun.serve({
  hostname: process.env.HOST ?? '127.0.0.1',
  port: Number(process.env.PORT ?? 3001),
  maxRequestBodySize: 2_000_000,
  fetch: (request, server) => app.fetch(request, server.requestIP(request)?.address ?? 'local'),
});
console.log(`Forma CMS: ${server.url}`);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  void server.stop().then(() => {
    app.close();
    process.exit(0);
  });
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
