import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CatalogError, createEbrplClient } from '../src/index.js';

const landingUrl = 'https://catalog.ebrpl.com/iguana/www.main.cls?surl=search&p=*';
const requestUrl = 'https://catalog.ebrpl.com/iguana/Proxy.SearchRequest.cls';
const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const searchXml = fixture('search-isbn.xml');
const recordXml = fixture('record.xml');
const hobbitXml = fixture('record-hobbit.xml');
const emptySearchXml = fixture('search-empty.xml');
const selectedBranches = ['EBRPL/BBR', 'EBRPL/JCR', 'EBRPL/SOU', 'EBRPL/EBR'];

type Post = { form: URLSearchParams; headers: Headers; sessionId: string; number: number };
type Reply = (post: Post) => Response | Promise<Response>;

function mockCatalog(reply: Reply) {
  let landings = 0;
  let posts = 0;
  const sessions = new Set<string>();
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    assert.ok(headers.get('user-agent'), 'requests identify the client');
    assert.ok(init?.signal, 'requests have a timeout signal');
    if (url === landingUrl) {
      assert.equal(init?.method, 'GET');
      assert.equal(headers.get('cookie'), null, 'fresh sessions do not reuse prior cookies');
      const sessionId = `anonymous-${++landings}`;
      sessions.add(sessionId);
      const responseHeaders = new Headers();
      responseHeaders.append('set-cookie', `CSPSESSIONID-SP-443-UP-iguana-=${sessionId}; Path=/; Secure; HttpOnly`);
      responseHeaders.append('set-cookie', 'CSPWSERVERID=server-1; Path=/');
      responseHeaders.append('set-cookie', `__cf_bm=bm-${sessionId}; Path=/; Expires=Wed, 21 Oct 2026 07:28:00 GMT`);
      return new Response(`<html><script>Vfocus.Settings.sessionID = "${sessionId}";</script></html>`, { headers: responseHeaders });
    }
    assert.equal(url, requestUrl, 'only the catalog endpoint is requested');
    assert.equal(init?.method, 'POST');
    assert.equal(headers.get('referer'), landingUrl);
    assert.match(headers.get('content-type') ?? '', /^application\/x-www-form-urlencoded(?:;|$)/);
    assert.equal(typeof init?.body, 'string');
    const form = new URLSearchParams(String(init?.body));
    const sessionId = form.get('CspSessionId') ?? '';
    assert.ok(sessions.has(sessionId), 'session was issued by the landing page');
    assert.equal(form.get('SIDTKN'), sessionId);
    assert.equal(form.get('SessionCMS'), '');
    const cookies = new Map((headers.get('cookie') ?? '').split(/;\s*/).map(pair => {
      const separator = pair.indexOf('=');
      return [pair.slice(0, separator), pair.slice(separator + 1)];
    }));
    assert.equal(cookies.get('CSPSESSIONID-SP-443-UP-iguana-'), sessionId);
    assert.equal(cookies.get('CSPWSERVERID'), 'server-1');
    assert.equal(cookies.get('__cf_bm'), `bm-${sessionId}`);
    assert.equal(form.get('fu'), 'BibSearch');
    assert.equal(form.get('Application'), 'Bib');
    assert.equal(form.get('Database'), '1');
    assert.equal(form.get('Language'), 'eng');
    assert.equal(form.get('Profile'), 'Iguana');
    return reply({ form, headers, sessionId, number: ++posts });
  };
  return { fetch, counts: () => ({ landings, posts }) };
}

function recordReply(xml: string, branches = selectedBranches): Reply {
  return ({ form }) => {
    assert.equal(form.get('RequestType'), 'RecordNumber');
    assert.equal(form.get('Request'), '1906252');
    assert.equal(form.get('TemplateId'), 'Iguana_Full');
    assert.equal(form.get('ExportByTemplate'), 'Full');
    assert.equal(form.get('SummaryHoldings'), branches.join(','));
    return new Response(xml);
  };
}

function withRows(rows: string[]): string {
  return recordXml.replace(/<HoldingsSummary>[\s\S]*?<\/HoldingsSummary>/, `<HoldingsSummary>${rows.join('')}</HoldingsSummary>`);
}

function row(branchCode: string, available: string): string {
  return `<ShelfmarkData><Scope>${branchCode}</Scope><LocationWording>Example branch</LocationWording><StatusSummary>Observed status</StatusSummary><Available>${available}</Available></ShelfmarkData>`;
}

test('search establishes a fresh session and sends the encoded query and pagination', async () => {
  const server = mockCatalog(({ form, headers }) => {
    assert.equal(form.get('RequestType'), 'ResultSet_DisplayList');
    assert.equal(form.get('Index'), '1*Keywordsbib');
    assert.equal(form.get('SearchMode'), 'simple');
    assert.equal(form.get('Request'), 'Tolkien & dragons + hobbits');
    assert.equal(form.get('StartValue'), '11');
    assert.equal(form.get('NumberToRetrieve'), '5');
    assert.equal(form.get('TemplateId'), 'Iguana_Brief');
    assert.equal(form.get('ExportByTemplate'), 'Brief');
    assert.equal(form.get('SearchTechnique'), 'Find');
    assert.equal(headers.get('user-agent'), 'CatalogRegression/1.0');
    return new Response(emptySearchXml);
  });
  const client = createEbrplClient({ fetch: server.fetch, userAgent: 'CatalogRegression/1.0' });
  await client.searchBooks('Tolkien & dragons + hobbits', { startRecord: 11, limit: 5 });
  assert.deepEqual(server.counts(), { landings: 1, posts: 1 });
});

test('ISBN search preserves both results and distinguishes digital Ebook=0 from physical books', async () => {
  const server = mockCatalog(({ form }) => {
    assert.equal(form.get('Request'), '9798892426367');
    return new Response(searchXml);
  });
  const result = await createEbrplClient({ fetch: server.fetch }).searchBooks('9798892426367');
  assert.equal(result.total, 2);
  assert.deepEqual(result.books.map(book => [book.recordId, book.isPhysicalBook, book.materialType]), [
    ['1.1910108', false, 'DIGR'], ['1.1906252', true, 'FICA'],
  ]);
  assert.deepEqual(result.books[0]?.isbns, ['9798892426381']);
  assert.deepEqual(result.books[1]?.isbns, ['9798892426367']);
  assert.match(result.books[1]?.title ?? '', /Fruit fly\s*:\s*a novel/);
  assert.deepEqual(result.books[1]?.authors, ['Silver, Josh,']);
});

test('title searches return readable titles and authors without query highlighting', async () => {
  const highlighted = searchXml
    .replaceAll('Fruit fly', '&lt;q&gt;Fruit&lt;/q&gt; &lt;q&gt;fly&lt;/q&gt;')
    .replaceAll('Silver, Josh,', '&lt;q&gt;Silver&lt;/q&gt;, Josh,');
  const server = mockCatalog(() => new Response(highlighted));
  const result = await createEbrplClient({ fetch: server.fetch }).searchBooks('fruit fly');
  assert.match(result.books[1]?.title ?? '', /Fruit fly/);
  assert.deepEqual(result.books[1]?.authors, ['Silver, Josh,']);
  assert.doesNotMatch(JSON.stringify(result.books), /<\/?q>/i);
});

test('cookies remain paired with the session when fetch exposes only combined Set-Cookie headers', async () => {
  const server = mockCatalog(() => new Response(searchXml));
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const response = await server.fetch(input, init);
    Object.defineProperty(response.headers, 'getSetCookie', { value: undefined });
    return response;
  };
  const result = await createEbrplClient({ fetch }).searchBooks('fruit fly');
  assert.equal(result.total, 2);
  assert.deepEqual(server.counts(), { landings: 1, posts: 1 });
});

test('full records expose grouped ISBNs and readable bibliographic fields', async () => {
  const server = mockCatalog(recordReply(recordXml));
  const { book } = await createEbrplClient({ fetch: server.fetch }).getAvailability('1.1906252', selectedBranches);
  assert.deepEqual(book.isbns, ['9798892426367', '9798892426374']);
  assert.match(book.title, /Fruit fly\s*:\s*a novel/);
  assert.deepEqual(book.authors, ['Silver, Josh, 1989-']);
  assert.equal(book.isPhysicalBook, true);
  assert.match(book.catalogUrl, /recordId=1\.1906252/);
});

test('selected branch flags map to individual unavailable observations', async () => {
  const server = mockCatalog(recordReply(recordXml));
  const result = await createEbrplClient({ fetch: server.fetch }).getAvailability('1.1906252', selectedBranches);
  assert.deepEqual(result.branches.map(branch => [branch.branchCode, branch.status]), selectedBranches.map(code => [code, 'unavailable']));
  assert.equal(result.branches[0]?.branchName, 'BLUEBONNET REGIONAL');
  assert.deepEqual(result.branches[0]?.rawAvailableFlags, ['0']);
  assert.ok(result.branches[0]?.rawStatuses[0]?.includes('No items currently available'));
  assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
});

test('Main-only NONFICA holdings are available and absent selected branches remain unknown', async () => {
  const server = mockCatalog(({ form }) => {
    assert.equal(form.get('Request'), '611172');
    assert.equal(form.get('SummaryHoldings'), 'EBRPL/EBR,EBRPL/BBR');
    return new Response(hobbitXml);
  });
  const result = await createEbrplClient({ fetch: server.fetch }).getAvailability('1.611172', ['EBRPL/EBR', 'EBRPL/BBR']);
  assert.equal(result.book.isPhysicalBook, true);
  assert.deepEqual(result.branches.map(branch => [branch.branchCode, branch.status]), [
    ['EBRPL/EBR', 'available'], ['EBRPL/BBR', 'unknown'],
  ]);
  assert.deepEqual(result.branches[1]?.rawAvailableFlags, []);
});

test('non-fiction material codes agree between search and full-record availability lookups', async () => {
  for (const materialType of ['NONFICJ', 'NONFICT']) {
    const xml = hobbitXml.replace('<DisplayMaterialType>NONFICA</DisplayMaterialType>', `<DisplayMaterialType>${materialType}</DisplayMaterialType>`);
    const server = mockCatalog(() => new Response(xml));
    const result = await createEbrplClient({ fetch: server.fetch }).getAvailability('1.611172', ['EBRPL/EBR']);
    assert.equal(result.book.isPhysicalBook, true);
    assert.equal(result.branches[0]?.status, 'available');
  }
});

test('full linked authors are all preserved and Iguana markup is removed from titles', async () => {
  const server = mockCatalog(() => new Response(hobbitXml));
  const { book } = await createEbrplClient({ fetch: server.fetch }).getAvailability('1.611172', ['EBRPL/EBR']);
  assert.equal(book.authors.length, 4);
  for (const name of ['Falconer, Daniel', 'Hennah, Dan', 'Taylor, Richard', 'Tolkien, J. R. R.']) {
    assert.ok(book.authors.some(author => author.includes(name)), name);
  }
  assert.doesNotMatch([book.title, ...book.authors].join(' '), /#!#|\$\^|\*Authorbib|\*Titlebib|\*Fulltitle|<br/);
  assert.match(book.title, /The hobbit.*art & design/);
});

test('unknown flags and missing holdings never become unavailable', async () => {
  const variants = [withRows([row('EBRPL/BBR', 'pending')]), withRows([]), recordXml.replace(/<HoldingsSummary>[\s\S]*?<\/HoldingsSummary>/, '')];
  for (const xml of variants) {
    const server = mockCatalog(recordReply(xml, ['EBRPL/BBR']));
    const result = await createEbrplClient({ fetch: server.fetch }).getAvailability('1.1906252', ['EBRPL/BBR']);
    assert.equal(result.branches[0]?.status, 'unknown');
  }
});

test('any available row wins when a branch has repeated summary rows', async () => {
  for (const flags of [['0', '1'], ['1', '0'], ['pending', '1']]) {
    const server = mockCatalog(recordReply(withRows(flags.map(flag => row('EBRPL/BBR', flag))), ['EBRPL/BBR']));
    const result = await createEbrplClient({ fetch: server.fetch }).getAvailability('1.1906252', ['EBRPL/BBR']);
    assert.equal(result.branches[0]?.status, 'available');
    assert.deepEqual(result.branches[0]?.rawAvailableFlags, flags);
  }
});

test('mixed unknown and unavailable rows cannot prove a branch unavailable', async () => {
  const server = mockCatalog(recordReply(withRows([row('EBRPL/BBR', '0'), row('EBRPL/BBR', 'pending')]), ['EBRPL/BBR']));
  const result = await createEbrplClient({ fetch: server.fetch }).getAvailability('1.1906252', ['EBRPL/BBR']);
  assert.equal(result.branches[0]?.status, 'unknown');
  assert.deepEqual(result.branches[0]?.rawAvailableFlags, ['0', 'pending']);
});

test('invalid XML, HTML, empty 200, and inconsistent record counts fail instead of reporting no results', async () => {
  for (const xml of ['<searchRetrieveResponse>', '<html><body>Service unavailable</body></html>', '', '<searchRetrieveResponse><numberOfRecords>1</numberOfRecords><records/></searchRetrieveResponse>']) {
    const server = mockCatalog(() => new Response(xml));
    await assert.rejects(createEbrplClient({ fetch: server.fetch }).searchBooks('fruit fly'), CatalogError);
    const attempts = xml === '' ? 2 : 1;
    assert.deepEqual(server.counts(), { landings: attempts, posts: attempts });
  }
});

test('availability rejects a mismatched record and digital records', async () => {
  const digitalRecord = recordXml.replace('<DisplayMaterialType>FICA</DisplayMaterialType>', '<DisplayMaterialType>DIGR</DisplayMaterialType>');
  for (const [recordId, xml] of [['1.611172', recordXml], ['1.1906252', digitalRecord]] as const) {
    const server = mockCatalog(() => new Response(xml));
    await assert.rejects(createEbrplClient({ fetch: server.fetch }).getAvailability(recordId, ['EBRPL/EBR']), CatalogError);
    assert.deepEqual(server.counts(), { landings: 1, posts: 1 });
  }
});

test('a valid zero-result search is distinct from a failed lookup', async () => {
  const server = mockCatalog(() => new Response(emptySearchXml));
  const result = await createEbrplClient({ fetch: server.fetch }).searchBooks('no matching title');
  assert.deepEqual(result, { total: 0, books: [] });
  assert.deepEqual(server.counts(), { landings: 1, posts: 1 });
});

test('session expiry renews both session ID and cookies before one retry', async () => {
  for (const expired of [() => new Response('', { status: 401 }), () => new Response(''), () => new Response('<html><body>Session expired. Sign in</body></html>')]) {
    const sessionIds: string[] = [];
    const server = mockCatalog(({ sessionId, number }) => {
      sessionIds.push(sessionId);
      return number === 1 ? expired() : new Response(searchXml);
    });
    const result = await createEbrplClient({ fetch: server.fetch }).searchBooks('9798892426367');
    assert.equal(result.books.length, 2);
    assert.deepEqual(server.counts(), { landings: 2, posts: 2 });
    assert.equal(new Set(sessionIds).size, 2);
  }
});

test('persistent session expiry stops after one refreshed attempt', async () => {
  const server = mockCatalog(() => new Response('', { status: 401 }));
  await assert.rejects(createEbrplClient({ fetch: server.fetch }).searchBooks('fruit fly'), CatalogError);
  assert.deepEqual(server.counts(), { landings: 2, posts: 2 });
});

test('concurrent calls on one client keep matching session IDs and cookies', async () => {
  const sessionIds: string[] = [];
  let releasePosts!: () => void;
  const bothPosts = new Promise<void>(resolve => { releasePosts = resolve; });
  const server = mockCatalog(async ({ form, sessionId }) => {
    sessionIds.push(sessionId);
    if (sessionIds.length === 2) releasePosts();
    await bothPosts;
    return new Response(form.get('RequestType') === 'RecordNumber' ? recordXml : searchXml);
  });
  const client = createEbrplClient({ fetch: server.fetch });
  const [search, availability] = await Promise.all([
    client.searchBooks('9798892426367'), client.getAvailability('1.1906252', selectedBranches),
  ]);
  assert.equal(search.books.length, 2);
  assert.equal(availability.book.recordId, '1.1906252');
  assert.equal(new Set(sessionIds).size, 2);
  assert.deepEqual(server.counts(), { landings: 2, posts: 2 });
});
