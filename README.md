# EBRPL catalog client

Search the East Baton Rouge Parish Library catalog and check branch holdings for a confirmed physical book. The TypeScript client uses ordinary `fetch`, explicit anonymous-session cookies, and a pure JavaScript XML parser. Only the local CLI imports Node APIs.

Requires Node.js 22.12 or later for local development.

```sh
npm install
npm run catalog -- search 'fruit fly'
npm run catalog -- search 9798892426367
npm run catalog -- availability 1.1906252
npm run catalog -- availability 1.1906252 --branches EBRPL/JCR,EBRPL/SOU,EBRPL/BBR,EBRPL/EBR
```

Commands print JSON. Errors print a JSON error to stderr and set a nonzero exit status. Jones Creek, South, and Bluebonnet are the default branches. Other EBRPL codes can be supplied explicitly.

```ts
import { createEbrplClient } from './src/index.js';

const catalog = createEbrplClient();
const results = await catalog.searchBooks('Josh Silver');
const availability = await catalog.getAvailability('1.1906252', ['EBRPL/JCR']);
```

`searchBooks(query, { startRecord?, limit? })` returns `{ total, books }`. Search uses the catalog keyword index for title, author, and ISBN text. Each book includes its catalog record ID, title, authors, ISBNs, document/material types, catalog URL, and `isPhysicalBook` (`true`, `false`, or `null` when unconfirmed). Pagination defaults to start record 1 and limit 10.

Search returns candidates for review. An ISBN may match an ebook or a physical record containing several bindings. Brief results may expose only the cover ISBN. Select the catalog record ID before monitoring, then use the full-record lookup to obtain its metadata. The client never selects a search match automatically.

`getAvailability(recordId, branchCodes?)` returns `{ book, branches, checkedAt }`. It validates the returned record identity and rejects records whose metadata does not confirm a physical book. Current recognized material codes are `FICA`, `NONFICA`, `NONFICT`, and `NONFICJ`, with a book material icon also accepted. Other material codes remain unconfirmed until checked against the catalog. Digital material indicators take precedence over `Ebook=0`.

Each branch observation includes `branchCode`, `branchName`, `status`, `rawStatuses`, and `rawAvailableFlags`. An explicit `1` flag reports `available`. Rows containing only `0` report `unavailable`. Missing holdings and unrecognized flags report `unknown`. The public status type reserves `not-held`, but missing rows alone do not establish that status. Availability flags are never copy counts. For repeated summary rows, a `1` wins, while unknown flags prevent an all-unavailable result. Multi-copy summary semantics still need further live verification. Preserve the raw wording when displaying or storing an observation.

`checkedAt` is the client observation time, not a catalog freshness timestamp. Empty, malformed, login, HTTP, and mismatched-record responses fail the lookup instead of becoming unavailable observations.

`createEbrplClient({ fetch?, timeoutMs?, userAgent? })` accepts an injected fetch implementation, a per-request timeout (20 seconds by default), and a descriptive User-Agent. Each operation initializes its own anonymous session with cookies from the landing page. Cookies stay paired with that operation's session ID, including during concurrent calls. An empty response, recognizable session-expiry/login page, or HTTP 401 gets one retry with a fresh session. Other failures do not retry. No user cookies or persistent session storage are needed.

```sh
npm run build
npm run typecheck
npm test
```

The core typecheck excludes Node ambient types. Tests use recorded, sanitized XML and mocked HTTP responses. See [fixture notes](test/fixtures/README.md) for the observed protocol and its limits.

The core is intended for a Convex action using the default V8 runtime. Deployment and live Convex validation, library automation guidance, authentication, scheduling, notifications, and frontend work remain separate tasks.
