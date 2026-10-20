import { createServer } from 'node:http';
import { createEbrplClient } from '../src/client.js';
import { createCatalogService } from '../src/service.js';
import { createApiHandler } from './handler.js';

const port = Number(process.env.PORT ?? 5174);
if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535');
const handler = createApiHandler(createCatalogService(createEbrplClient()));

const server = createServer(async (request, response) => {
  try {
    const result = await handler(new Request(new URL(request.url ?? '/', `http://127.0.0.1:${port}`), { method: request.method ?? 'GET' }));
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(await result.text());
  } catch {
    response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'Request could not be processed' }));
  }
});
server.requestTimeout = 10000;
server.headersTimeout = 10000;
server.listen(port, '127.0.0.1', () => console.log(`Library API listening on http://127.0.0.1:${port}`));
