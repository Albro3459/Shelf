# EBRPL book finder

Search the East Baton Rouge Parish Library catalog and check physical books across its public branches. The POC includes a React frontend, a small Node API, and a reusable TypeScript catalog client. The catalog client uses ordinary `fetch`, explicit anonymous-session cookies, and a pure JavaScript XML parser. Node APIs stay in the server and local CLI.

Use Node.js 24, pinned in `.node-version`, and TypeScript 7. React and Vite use the current stable releases installed in the lockfile.

```sh
fnm use 24
npm install
npm run dev
```

Open [the app](http://localhost:5173). The dev command runs Vite on port 5173 and the API on loopback port 5174. Vite proxies `/api` requests to the API, so catalog sessions stay on the server.

Enter a title, author, ISBN, EBRPL record ID (`1.1906252` or `1906252`), or a complete HTTPS catalog record link. Search results show confirmed physical books. Selecting one checks all public physical branches returned by the catalog's live directory. Missing holdings stay unknown and are not treated as unavailable.

The API filters one upstream catalog page at a time. A page containing only digital items can have no physical results and still have a next page. Load more to continue. Catalog totals include all formats.

Build and run the compiled API with a preview of the static frontend:

```sh
npm run build
npm start
# In another terminal
npm run preview
```

The preview serves [port 4173](http://localhost:4173) and proxies to the API on port 5174. The static frontend build is in `dist/web`, the compiled Node entry is `dist/api/server/index.js`, and the catalog library keeps its `dist/index.js` export. `PORT` can change the API listener, but update the proxy target in `vite.config.ts` if doing so locally. Neither dev nor preview is a public deployment.

## Convex development

Cloud catalog access was verified on a development deployment with the existing client in Convex's default runtime. The internal `catalog:checkAvailability` action returns availability across the live branch directory. It does not save observations or send notifications. The React POC still uses the local Node API.

The Convex CLI is included in the project dependencies. It is also installed globally on this machine. On another machine, install dependencies and connect to the existing project:

```sh
npm install
npm run convex -- login
npm run convex -- dev --configure existing --team YOUR_TEAM --project YOUR_PROJECT --dev-deployment cloud --once
```

The CLI saves deployment configuration in the ignored `.env.local`. To publish backend changes to the configured development deployment and run the cloud check:

```sh
npm run convex -- dev --once --typecheck enable
npm run convex -- run catalog:checkAvailability '{"recordId":"1.1906252"}'
```

Run `npm run convex -- dev` to sync backend changes continuously during development. Generated bindings in `convex/_generated` belong in Git. The production build also typechecks Convex functions.

## API

- `GET /api/search?q=...&startRecord=1&limit=20`: physical search results with the next catalog offset, or a resolved record ID for direct input
- `GET /api/availability/:recordId`: the confirmed physical book and statuses for every public physical branch
- `GET /api/branches`: the dynamic branch directory
- `GET /api/health`: server health

`server/handler.ts` accepts standard Fetch `Request`/`Response` objects. `src/service.ts` handles catalog operations independently of the Node HTTP listener. This keeps the API suitable for a future cloud-function adapter. The POC has no database, accounts, saved lists, or notification jobs yet. Future storage will connect users to their book lists, chosen branches, notification preferences, and observations/delivery state.

Only exact HTTPS `catalog.ebrpl.com/iguana/www.main.cls` record URLs are accepted. The server extracts the record ID and never fetches a user-supplied URL. Bare 10- and 13-digit inputs are searched as ISBNs. Use the `1.` prefix to disambiguate a numeric catalog ID of those lengths.

## Catalog CLI and client

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

`getAvailability(recordId, branchCodes?)` returns `{ book, branches, checkedAt }`. It validates the returned record identity and rejects records whose metadata does not confirm a physical book. Recognized material codes come from the catalog's published material wordings and include adult, juvenile, teen, biography, graphic, large print, and reference books. Other material codes remain unconfirmed until checked against the catalog. Digital material indicators take precedence over `Ebook=0`.

`getBranches()` reads the public selectable `Location_1` list from `Service.Search.cls?language=eng` and excludes Digital Resources. It caches a validated successful directory for one hour and shares concurrent loads. Internal/legacy location wordings are not added to the public branch list. Directory failures fail the API request rather than falling back to the CLI's three default branches. The CLI defaults stay separate from the app's all-branch behavior.

Each branch observation includes `branchCode`, `branchName`, `status`, `rawStatuses`, and `rawAvailableFlags`. An explicit `1` flag reports `available`. Rows containing only `0` report `unavailable`. Missing holdings and unrecognized flags report `unknown`. The public status type reserves `not-held`, but missing rows alone do not establish that status. Availability flags are never copy counts. For repeated summary rows, a `1` wins, while unknown flags prevent an all-unavailable result. Multi-copy summary semantics still need further live verification. Preserve the raw wording when displaying or storing an observation.

`checkedAt` is the client observation time, not a catalog freshness timestamp. Empty, malformed, login, HTTP, and mismatched-record responses fail the lookup instead of becoming unavailable observations.

`createEbrplClient({ fetch?, timeoutMs?, userAgent? })` accepts an injected fetch implementation, a per-request timeout (20 seconds by default), and a descriptive User-Agent. Each operation initializes its own anonymous session with cookies from the landing page. Cookies stay paired with that operation's session ID, including during concurrent calls. An empty response, recognizable session-expiry/login page, or HTTP 401 gets one retry with a fresh session. Other failures do not retry. No user cookies or persistent session storage are needed.

```sh
npm run build
npm run typecheck
npm test
```

The core typecheck excludes Node ambient types. Separate configurations check the frontend, server, tests, and Vite setup. Targeted tests use recorded, sanitized XML and mocked HTTP responses for catalog parsing, input resolution, directory discovery, physical pagination, all-branch joins, and safe HTTP errors. See [fixture notes](test/fixtures/README.md) for the observed protocol and its limits.

The core now runs in a deployed Convex action using web APIs. The Node API can also be adapted to another cloud-function host. Frontend hosting, database/auth integration, scheduled checks, and email notifications remain future work.
