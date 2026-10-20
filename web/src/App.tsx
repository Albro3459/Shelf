import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { AvailabilityResponse, SearchResponse } from '../../src/api-model';
import type { AvailabilityStatus, Book, BranchObservation } from '../../src/model';

const examples = [
  { label: 'Fruit fly', query: 'Fruit fly' },
  { label: 'An ISBN', query: '9780593321201' },
  { label: 'A catalog link', query: 'https://catalog.ebrpl.com/iguana/www.main.cls?surl=search&p=*#recordId=1.1906252' },
];
const statusLabels: Record<AvailabilityStatus, string> = {
  available: 'Available',
  unavailable: 'Unavailable',
  unknown: 'Status unknown',
  'not-held': 'No holdings reported',
};
const statusOrder: Record<AvailabilityStatus, number> = { available: 0, unavailable: 1, unknown: 2, 'not-held': 3 };

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) {
    let message = 'The library catalog could not complete this request. Please try again.';
    try {
      const body = await response.json() as { error?: unknown };
      if (typeof body.error === 'string' && body.error.trim()) message = body.error;
    } catch { /* Use the fallback when the server has no JSON error */ }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function BookIcon({ small = false }: { small?: boolean }) {
  return <svg width={small ? 19 : 26} height={small ? 19 : 26} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 6.5C9 4.4 5.5 4 2.5 4.5v14c3-.5 6.5-.1 9.5 2 3-2.1 6.5-2.5 9.5-2v-14C18.5 4 15 4.4 12 6.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M12 6.5v14" stroke="currentColor" strokeWidth="1.5"/></svg>;
}

function Arrow({ external = false }: { external?: boolean }) {
  return <svg width="17" height="17" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d={external ? 'M5 15 15 5M5 5h10v10' : 'M4 10h12m-5-5 5 5-5 5'} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}

function Cover({ book, large = false }: { book: Book; large?: boolean }) {
  const palette = [...book.recordId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3;
  return <div className={`book-cover palette-${palette}${large ? ' large-cover' : ''}`} aria-hidden="true"><div className="cover-rule"/><span className="cover-title">{book.title}</span><div className="cover-bottom"><BookIcon small/><span>{book.authors[0] || 'EBRPL collection'}</span></div></div>;
}

function ErrorMessage({ message, retry }: { message: string; retry: () => void }) {
  return <div className="error-message" role="alert"><strong>We couldn’t reach that shelf.</strong><p>{message}</p><button className="text-button" onClick={retry}>Try again <Arrow/></button></div>;
}

function cleanStatus(value: string): string {
  return value.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim();
}

function BranchRow({ branch }: { branch: BranchObservation }) {
  const descriptions = [...new Set(branch.rawStatuses.map(cleanStatus).filter(Boolean))];
  const hasHoldings = branch.rawStatuses.length > 0 || branch.rawAvailableFlags.length > 0;
  const label = branch.status === 'unknown' && !hasHoldings ? 'No holdings reported' : statusLabels[branch.status];
  return <li className="branch-row"><div className="branch-copy"><strong>{branch.branchName || branch.branchCode}</strong>{descriptions.length > 0 && <span>{descriptions.join(' · ')}</span>}</div><span className={`branch-status ${branch.status}`}><span aria-hidden="true">{branch.status === 'available' ? '✓' : branch.status === 'unavailable' ? '−' : '·'}</span>{label}</span></li>;
}

function recordFromLocation(): string | null {
  const params = new URLSearchParams(window.location.hash.slice(1));
  return params.get('record');
}

export function App() {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [books, setBooks] = useState<Book[]>([]);
  const [total, setTotal] = useState(0);
  const [nextStartRecord, setNextStartRecord] = useState<number | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedBook, setSelectedBook] = useState<Book | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [detailError, setDetailError] = useState('');
  const detailPanel = useRef<HTMLElement | null>(null);
  const searchController = useRef<AbortController | null>(null);
  const detailController = useRef<AbortController | null>(null);
  const failedSearch = useRef({ query: '', startRecord: 1 });

  function updateLocation(recordId: string | null) {
    const hash = recordId ? `#record=${encodeURIComponent(recordId)}` : '';
    if (window.location.hash !== hash) window.history.pushState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
  }

  async function selectBook(recordId: string, book: Book | null = null, writeLocation = true) {
    detailController.current?.abort();
    const controller = new AbortController();
    detailController.current = controller;
    setSelectedId(recordId);
    setSelectedBook(book);
    setAvailability(null);
    setDetailError('');
    setIsChecking(true);
    if (writeLocation) updateLocation(recordId);
    try {
      const result = await getJson<AvailabilityResponse>(`/api/availability/${encodeURIComponent(recordId)}`, controller.signal);
      if (controller.signal.aborted) return;
      setAvailability(result);
      setSelectedBook(result.book);
    } catch (error) {
      if (!controller.signal.aborted) setDetailError(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      if (!controller.signal.aborted) setIsChecking(false);
    }
  }

  async function search(rawQuery: string, startRecord = 1) {
    const submittedQuery = rawQuery.trim();
    if (!submittedQuery) return;
    searchController.current?.abort();
    const controller = new AbortController();
    searchController.current = controller;
    const isMore = startRecord > 1;
    failedSearch.current = { query: submittedQuery, startRecord };
    setSearchError('');
    if (isMore) {
      setIsLoadingMore(true);
    } else {
      detailController.current?.abort();
      setIsChecking(false);
      setSelectedId(null);
      setSelectedBook(null);
      setAvailability(null);
      setDetailError('');
      updateLocation(null);
      setInput(submittedQuery);
      setQuery(submittedQuery);
      setBooks([]);
      setTotal(0);
      setNextStartRecord(null);
      setHasSearched(true);
      setIsSearching(true);
      setIsLoadingMore(false);
    }
    try {
      const params = new URLSearchParams({ q: submittedQuery, startRecord: String(startRecord), limit: '20' });
      const result = await getJson<SearchResponse>(`/api/search?${params}`, controller.signal);
      if (controller.signal.aborted) return;
      if (result.kind === 'record') {
        setHasSearched(false);
        void selectBook(result.recordId);
      } else {
        const physicalBooks = result.books.filter(book => book.isPhysicalBook === true);
        setBooks(previous => isMore ? [...new Map([...previous, ...physicalBooks].map(book => [book.recordId, book])).values()] : physicalBooks);
        setTotal(result.totalCatalogResults);
        setNextStartRecord(result.nextStartRecord);
        if (!isMore && physicalBooks[0]) void selectBook(physicalBooks[0].recordId, physicalBooks[0]);
      }
    } catch (error) {
      if (!controller.signal.aborted) setSearchError(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      if (!controller.signal.aborted) {
        setIsSearching(false);
        setIsLoadingMore(false);
      }
    }
  }

  useEffect(() => {
    const initialRecord = recordFromLocation();
    if (initialRecord) void selectBook(initialRecord, null, false);
    const onNavigate = () => {
      searchController.current?.abort();
      setIsSearching(false);
      setIsLoadingMore(false);
      const recordId = recordFromLocation();
      if (recordId) void selectBook(recordId, null, false);
      else {
        detailController.current?.abort();
        setSelectedId(null);
        setSelectedBook(null);
        setAvailability(null);
        setDetailError('');
        setIsChecking(false);
      }
    };
    window.addEventListener('popstate', onNavigate);
    return () => {
      searchController.current?.abort();
      detailController.current?.abort();
      window.removeEventListener('popstate', onNavigate);
    };
  }, []);

  function openBook(book: Book) {
    void selectBook(book.recordId, book);
    if (window.matchMedia('(max-width: 800px)').matches) {
      window.requestAnimationFrame(() => detailPanel.current?.scrollIntoView({
        block: 'start',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      }));
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void search(input);
  }

  const branches = availability ? [...availability.branches].sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || (a.branchName || a.branchCode).localeCompare(b.branchName || b.branchCode)) : [];
  const availableCount = branches.filter(branch => branch.status === 'available').length;
  const knownCount = branches.filter(branch => branch.status === 'available' || branch.status === 'unavailable').length;
  const hasWorkspace = hasSearched || selectedId != null;
  const checkedDate = availability ? new Date(availability.checkedAt) : null;
  const checkedLabel = checkedDate && !Number.isNaN(checkedDate.getTime()) ? checkedDate.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;

  return <div className="app-shell">
    <header className="site-header"><a className="brand" href={window.location.pathname} aria-label="Shelf home"><img className="brand-icon" src="/shelf.svg" width="45" height="45" alt=""/><span>Shelf<span className="brand-dot">.</span></span></a><div className="library-name"><span className="library-mark" aria-hidden="true"/>East Baton Rouge<span className="library-name-second">Parish Library</span></div></header>
    <main>
      <section className={`hero${hasWorkspace ? ' compact' : ''}`} aria-labelledby="page-title">
        <div className="eyebrow"><span/>YOUR NEXT READ, NEARBY</div>
        <h1 id="page-title">A good book.{' '}<br/>A <em>nearby</em> shelf.</h1>
        <p className="hero-description">Find a physical book in the EBRPL collection.<br className="desktop-break"/> See which branches have a copy available.</p>
        <form className="search-form" onSubmit={onSubmit} role="search"><label className="sr-only" htmlFor="book-search">Title, author, ISBN, record ID, or catalog link</label><svg className="search-icon" width="23" height="23" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.6"/><path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg><input id="book-search" type="search" value={input} onChange={event => setInput(event.target.value)} placeholder="Title, author, ISBN, record ID, or catalog link" autoComplete="off" required/><button className="search-button" type="submit" disabled={!input.trim()}>Find a book <Arrow/></button></form>
        <div className="examples"><span>Try a search</span>{examples.map(example => <button key={example.label} onClick={() => void search(example.query)}>{example.label}<span aria-hidden="true">↗</span></button>)}</div>
      </section>

      {!hasWorkspace && <section className="welcome-note" aria-label="How it works"><div className="note-symbol"><BookIcon/></div><div><h2>The whole parish, one search.</h2><p>Explore physical books, choose a title, and check availability at every EBRPL branch.</p></div><span className="note-number" aria-hidden="true">BATON ROUGE, LA</span></section>}

      {hasWorkspace && <section className={`workspace${!hasSearched ? ' direct-record' : ''}`} aria-label="Books and branch availability">
        {hasSearched && <div className="results-panel" aria-busy={isSearching}>
          <div className="section-heading"><div><span className="eyebrow">THE COLLECTION</span><h2>Search results<span className="result-count">{books.length > 0 ? books.length : ''}</span></h2></div><span className="physical-label"><BookIcon small/>Physical books</span></div>
          {isSearching ? <div className="loading-state" role="status"><span className="spinner"/>Searching the library catalog…</div> : <>
            {searchError && <ErrorMessage message={searchError} retry={() => void search(failedSearch.current.query, failedSearch.current.startRecord)}/>}
            {books.length > 0 && <><p className="result-summary">For <strong>{query.length > 90 ? `${query.slice(0, 90)}…` : query}</strong>{total > 0 && <span>{total.toLocaleString()} catalog matches across all formats</span>}</p><div className="book-list">{books.map(book => <button key={book.recordId} className={`book-result${selectedId === book.recordId ? ' selected' : ''}`} onClick={() => openBook(book)} aria-pressed={selectedId === book.recordId}><Cover book={book}/><span className="book-result-copy"><span className="book-format">BOOK</span><strong>{book.title}</strong><span className="book-author">{book.authors.join(', ') || 'Author not listed'}</span><span className="book-action">Check branches <Arrow/></span></span>{selectedId === book.recordId && <span className="selection-mark" aria-label="Selected">✓</span>}</button>)}</div></>}
            {!searchError && books.length === 0 && !selectedId && <div className="empty-state"><BookIcon/><h3>{nextStartRecord ? 'Keep exploring the catalog.' : 'No physical books found.'}</h3><p>{nextStartRecord ? 'No physical books appeared on this page. Later catalog results may include the book you’re looking for.' : 'Try a shorter title, an author’s name, or an ISBN. You can also paste a catalog record link.'}</p></div>}
            {nextStartRecord != null && <div className="pagination"><button className="secondary-button" disabled={isLoadingMore} onClick={() => void search(query, nextStartRecord)}>{isLoadingMore ? <><span className="spinner"/>Loading more…</> : <>Load more books <span aria-hidden="true">↓</span></>}</button><p>Catalog results can include other formats.<br/>Only physical books appear here.</p></div>}
          </>}
        </div>}

        <aside ref={detailPanel} className="detail-panel" aria-label="Selected book availability" aria-busy={isChecking}>
          {!selectedId ? <div className="detail-placeholder"><div className="placeholder-books" aria-hidden="true"><span/><span/><span/></div><span className="eyebrow">FROM PAGE TO PLACE</span><h2>Find your copy.</h2><p>Choose a book to see its availability<br/>across the parish.</p></div> : <>
            <div className="detail-heading"><span className="eyebrow">ON THE SHELF</span>{selectedBook && <span className="physical-label">Physical book</span>}</div>
            {selectedBook && <><div className="selected-book"><Cover book={selectedBook} large/><div><h2>{selectedBook.title}</h2><p className="detail-authors">{selectedBook.authors.join(', ') || 'Author not listed'}</p><a className="catalog-link" href={selectedBook.catalogUrl} target="_blank" rel="noopener noreferrer">View in library catalog <Arrow external/></a></div></div><dl className="book-metadata">{selectedBook.isbns.length > 0 && <div><dt>ISBN</dt><dd>{selectedBook.isbns.join(' · ')}</dd></div>}<div><dt>Record</dt><dd>{selectedBook.recordId}</dd></div></dl></>}
            {isChecking && <div className="loading-state detail-loading" role="status"><span className="spinner"/>Checking branch availability…</div>}
            {detailError && <ErrorMessage message={detailError} retry={() => void selectBook(selectedId, selectedBook)}/>}
            {availability && <><div className="availability-heading"><div><h3>Branch availability</h3><p>{availableCount > 0 ? `Available at ${availableCount} ${availableCount === 1 ? 'branch' : 'branches'}` : knownCount > 0 ? 'No available copies reported' : 'Availability could not be confirmed'}</p></div><button className="refresh-button" onClick={() => void selectBook(selectedId, selectedBook)} aria-label="Refresh branch availability" title="Refresh availability">↻</button></div><div className="checked-at">{checkedLabel ? <>Checked <time dateTime={availability.checkedAt}>{checkedLabel}</time></> : 'Latest catalog response'}<span>Availability can change</span></div>{branches.length > 0 ? <ul className="branch-list">{branches.map(branch => <BranchRow key={branch.branchCode} branch={branch}/>)}</ul> : <p className="no-holdings">The catalog returned no branch information for this record. Check the library catalog for more details.</p>}<p className="availability-note">Missing holdings do not confirm whether a branch owns a copy. Check the library catalog for loan details.</p></>}
          </>}
        </aside>
      </section>}
    </main>
    <footer className="site-footer"><span><BookIcon small/>Made for the next chapter.</span><p>Live information from the EBRPL catalog.</p><a href="https://www.ebrpl.com/" target="_blank" rel="noopener noreferrer">Visit EBRPL <Arrow external/></a></footer>
  </div>;
}
