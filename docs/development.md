# Development

[Back to Shelf](../README.md)

Commands and source paths below are relative to the repository root.

## Local setup

The React frontend calls a Convex backend that shares a reusable TypeScript catalog client with the local CLI. The catalog client uses ordinary `fetch`, explicit anonymous-session cookies, and a pure JavaScript XML parser.

Use Node.js 24, pinned in `.node-version`, and TypeScript 7. React and Vite use the current stable releases installed in the lockfile.

```sh
fnm use 24
npm install
npm run convex -- deployment create local --select
npm run dev
```

Create the local deployment once. On subsequent runs, use `npm run dev`. It starts Convex, syncs the backend, then starts Vite on [port 5173](http://localhost:5173). The local backend normally listens on port 3210 and keeps its state in the ignored `.convex/` directory. The CLI writes the selected deployment and browser URL to the ignored `.env.local`; Vite reads this file from the repository root.

Enter a title, author, ISBN, EBRPL record ID (`1.1906252` or `1906252`), or a complete HTTPS catalog record link. Search results show confirmed physical books. Selecting one checks all public physical branches returned by the catalog's live directory. Missing holdings stay unknown and are not treated as unavailable.

Sign in with Google to create book lists. Choose a list on a book's detail panel to save it, then open **My lists** to revisit its availability, rename lists, or remove books. Saved lists persist in Convex and update across sessions. Saving a book does not enable notifications.

The API filters one upstream catalog page at a time. A page containing only digital items can have no physical results and still have a next page. Load more to continue. Catalog totals include all formats.

Build and preview the static frontend while your selected Convex backend is running:

```sh
npm run build
npm run preview
```

The preview serves [port 4173](http://localhost:4173). The static frontend build is in `dist/web`, and the catalog library keeps its `dist/index.js` export. `VITE_CONVEX_URL` selects the frontend's backend at build time. Keep `npm run convex -- dev` running in another terminal when previewing against a local backend. For cloud frontend builds, select the intended cloud backend or set its URL before building.

## GitHub Pages

Shelf uses hash navigation (`#record=...` and `#view=lists`), so book and list links work on GitHub Pages without server rewrites. The configured address is https://shelf.gocloudlaunch.com.

```sh
npm run deploy
```

The predeploy script bumps the patch version in `package.json` and `package-lock.json` without creating a Git tag, then builds against the production backend at https://mellow-ibex-872.convex.cloud. The deploy script publishes only `dist/web` to the remote gh-pages branch. It preserves the custom domain through `web/public/CNAME` and disables Jekyll. It does not commit or push the source branch. Publishing requires explicit approval to push the `gh-pages` branch. Commit the version files when you save the release.

To check the release build without publishing or changing its version, run `npm run build:pages`.

GitHub Pages must publish from the gh-pages branch at `/`. The Cloudflare record is a CNAME from shelf.gocloudlaunch.com to albro3459.github.io. Leave it DNS-only until GitHub verifies the domain and issues its HTTPS certificate, then enable HTTPS enforcement. Cloudflare proxying can be enabled after that. Keep TLS certificate validation enabled and leave all other records unchanged.

Set `SITE_URL` on the production deployment, `mellow-ibex-872`, to https://shelf.gocloudlaunch.com for auth redirects and notification links. Register this frontend origin and https://mellow-ibex-872.convex.site/api/auth/callback/google in the Google OAuth client. Each Convex deployment needs its own backend environment variables and auth signing keys. Deploy production functions with `npm run convex -- deploy --typecheck enable`. The Pages release publishes only the frontend and does not deploy Convex functions.

## Convex development

The same functions run in local and cloud Convex deployments. Each deployment has separate data and environment variables. Local development requires the backend process to stay running. Catalog requests still reach the live library catalog. Saved books, lists, branch observations, and notification history persist in the selected backend.

The Convex CLI is included in the project dependencies. To connect a machine to an existing cloud project:

```sh
npm install
npm run convex -- login
npm run convex -- dev --configure existing --team YOUR_TEAM --project YOUR_PROJECT --dev-deployment cloud --once
```

After creating a local deployment, switch between local and personal cloud development with:

```sh
npm run convex -- deployment select local
# Or
npm run convex -- deployment select dev
```

Restart `npm run dev` after switching deployments. You can also invoke the internal availability check from another terminal against the selected backend:

```sh
npm run convex -- run catalog:checkAvailability '{"recordId":"1.1906252"}'
```

Use `npm run convex -- dev --once --typecheck enable` to sync to cloud development without starting the frontend. For a local backend, keep `npm run dev` or `npm run convex -- dev` running while invoking functions. Generated bindings in `convex/_generated` belong in Git. The production build also typechecks Convex functions. `.env.example` contains placeholders for manual cloud configuration; no deployment secrets belong in the frontend.

## Convex API

- `catalog.search({ input, startRecord?, limit? })`: physical search results with the next catalog offset, or a resolved record ID for direct input
- `catalog.getAvailability({ recordId })`: the confirmed physical book and statuses for every public physical branch
- `catalog.getBranches({})`: the dynamic branch directory
- `catalog.checkAvailability({ recordId })`: internal availability check for backend and CLI use
- `catalog.saveToList({ listId, recordId })`: confirm catalog metadata and save a book to an owned list
- `lists.mine({})`, `lists.get({ listId })`, `lists.containingRecord({ recordId })`: the active user's private lists, saved books, and memberships
- `lists.create({ name })`, `lists.rename({ listId, name })`, `lists.remove({ listId })`, `lists.removeBook({ listId, bookId })`: private list management

The frontend uses Convex's generated API and React client. `src/service.ts` handles input validation, physical filtering, and all-branch availability for the public and internal actions. Expected input and record errors return useful messages; upstream failures return a generic message. Google sign-in creates a Convex Auth account. Private list functions derive ownership from that account, and books use internal Convex IDs with separate catalog record and ISBN references. Scheduled monitoring calls internal functions using this same catalog code.

Only exact HTTPS `catalog.ebrpl.com/iguana/www.main.cls` record URLs are accepted. The backend extracts the record ID and never fetches a user-supplied URL. Bare 10- and 13-digit inputs are searched as ISBNs. Use the `1.` prefix to disambiguate a numeric catalog ID of those lengths.

## Google sign-in

Create a Web application OAuth client in Google Cloud. Add the frontend origin and the selected backend's HTTP Actions URL followed by `/api/auth/callback/google` as an authorized redirect URI. Cloud HTTP Actions URLs end in `.convex.site`. A local backend normally uses `http://127.0.0.1:3211`; register its exact callback separately if using local auth.

Copy `.env.convex.example` to the ignored `.env.convex` and fill in the Google credentials. Select the target deployment, then configure its backend environment and auth routes:

```sh
npm run convex -- env set --from-file .env.convex
npm run auth:setup -- --web-server-url http://localhost:5173
npm run convex -- dev --once --typecheck enable
npm run dev:web
```

The auth initializer creates `JWT_PRIVATE_KEY` and `JWKS` on the selected backend and preserves existing keys unless you choose to replace them. Keep a local backend running in another terminal when configuring it. Each deployment needs its own environment configuration.

Open `http://localhost:5173` for this configuration. `SITE_URL` must match the frontend address used for sign-in. Set it to the final HTTPS frontend URL when deploying. Sign-in preserves the current path and book hash, and Convex Auth exchanges and removes the callback's query code. Google credentials and signing keys stay on the backend. The Google sign-in HTTP route sets secure, HttpOnly, unpartitioned `SameSite=Lax` cookies and loads a page on the auth domain before continuing to Google. If the browser withholds the verifier cookie on its return, the callback makes one navigation on the auth domain before exchanging the code. A missing cookie after that retry produces a restart page. Auth responses use `no-store`, and the intermediate pages send no referrer or external requests.

Catalog search remains public. `users.current` returns only the authenticated user's basic profile and access status, using Convex Auth's canonical `users._id`. New accounts have active access and notifications disabled. Existing pending accounts become active at their next sign-in. Repeat sign-ins preserve disabled access and notification preferences. Lists and notifications require active access. Administrators can change access with the internal `users.setAccess` mutation through the dashboard or CLI. See the [data model](data-model.md).

Setup follows the [Convex Auth guide](https://labs.convex.dev/auth/setup) and [Google provider configuration](https://labs.convex.dev/auth/config/oauth/google).

## Availability alerts

In My lists, turn on Email alerts and choose Branch alerts for a saved book. Select the branches and save. Branch choices apply across lists. Removing a book or deleting its list keeps its alerts, which can be stopped in the saved-alert summary.

Convex checks watched books hourly from 8 AM through 5 PM Central, daily, with daylight saving time handled automatically. Newly enabled alerts reuse recent availability or request a fresh check. Users subscribing during an available period still receive an email. Unchanged availability sends no repeat, and catalog failures do not create a new available period.

Set `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, and `SES_FROM_EMAIL` in the ignored `.env.convex` and import them into the selected backend. `SITE_URL` supplies the manage-alerts link. Keep all credentials on the backend. The examples contain placeholders only.

SES sends from an internal Convex action. Notifications track attempts and provider acceptance, without inbox delivery tracking. Ambiguous requests are never automatically retried. See the [data model](data-model.md) for eligibility, deduplication, retry behavior, and limits. Initial book saves monitor their confirmed catalog record, with multiple editions supported once their records have been explicitly linked. Automatic edition discovery is not implemented.

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

The core and Convex typechecks exclude Node ambient types. Separate configurations check the frontend, existing tests, and Vite setup. Existing tests use recorded, sanitized XML and mocked HTTP responses for catalog parsing, input resolution, directory discovery, physical pagination, and all-branch joins. See [fixture notes](../test/fixtures/README.md) for the observed protocol and its limits.

Automatic edition discovery remains future work.
