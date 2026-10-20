import type { CatalogService } from '../src/service.js';
import { InputError, normalizeRecordId } from '../src/input.js';
import { CatalogRecordError } from '../src/model.js';

function integer(value: string | null, fallback: number, maximum: number): number {
  if (value === null) return fallback;
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > maximum) {
    throw new InputError(`Pagination must be an integer from 1 to ${maximum}`);
  }
  return Number(value);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

export function createApiHandler(service: CatalogService): (request: Request) => Promise<Response> {
  return async request => {
    try {
      const url = new URL(request.url);
      if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
      if (url.pathname === '/api/health') return json({ ok: true });
      if (url.pathname === '/api/branches') return json(await service.getBranches());
      if (url.pathname === '/api/search') {
        for (const key of ['q', 'startRecord', 'limit']) {
          if (url.searchParams.getAll(key).length > 1) throw new InputError(`Provide ${key} once`);
        }
        return json(await service.search(url.searchParams.get('q') ?? '', {
          startRecord: integer(url.searchParams.get('startRecord'), 1, 1000000),
          limit: integer(url.searchParams.get('limit'), 20, 100),
        }));
      }
      const match = /^\/api\/availability\/([^/]+)$/.exec(url.pathname);
      if (match) {
        let rawRecordId: string;
        try { rawRecordId = decodeURIComponent(match[1] ?? ''); } catch { throw new InputError('Invalid record ID'); }
        return json(await service.getAvailability(normalizeRecordId(rawRecordId)));
      }
      return json({ error: 'Route not found' }, 404);
    } catch (error) {
      if (error instanceof InputError) return json({ error: error.message }, 400);
      if (error instanceof CatalogRecordError) return json({ error: error.message }, error.reason === 'not-found' ? 404 : 422);
      return json({ error: 'The library catalog could not complete this request. Please try again.' }, 502);
    }
  };
}
