import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { useAction, useConvexAuth, useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import { MAX_LIST_NAME } from '../../convex/listModel';
import type { Book } from '../../src/model';

export function useShelfAccount() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.current, isAuthenticated ? {} : 'skip');
  return {
    user,
    isAuthenticated,
    isLoading: isLoading || (isAuthenticated && user === undefined),
    canUseLists: isAuthenticated && user?.accessStatus === 'active',
  };
}

function listError(error: unknown): string {
  return error instanceof ConvexError && typeof error.data === 'string' ? error.data :
    'Could not update your list. Please try again.';
}

function NewListForm({ onCreated }: { onCreated: (listId: Id<'lists'>) => void }) {
  const createList = useMutation(api.lists.create);
  const inputId = useId();
  const [name, setName] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy) return;
    setIsBusy(true);
    setError('');
    try {
      const listId = await createList({ name });
      setName('');
      onCreated(listId);
    } catch (error) {
      setError(listError(error));
    } finally {
      setIsBusy(false);
    }
  }

  return <form className="new-list-form" onSubmit={event => void submit(event)}>
    <label htmlFor={inputId}>New list name</label>
    <div className="list-form-row"><input id={inputId} value={name} onChange={event => setName(event.target.value)} placeholder="e.g. To read" maxLength={MAX_LIST_NAME} required disabled={isBusy}/><button className="list-primary-button" disabled={isBusy || !name.trim()}>{isBusy ? 'Creating…' : 'Create list'}</button></div>
    {error && <p className="list-error" role="alert">{error}</p>}
  </form>;
}

export function SaveBookControl({ recordId, onOpenLists }: { recordId: string; onOpenLists: () => void }) {
  const account = useShelfAccount();
  const lists = useQuery(api.lists.mine, account.canUseLists ? {} : 'skip');
  const savedListIds = useQuery(api.lists.containingRecord, account.canUseLists ? { recordId } : 'skip');
  const saveBook = useAction(api.catalog.saveToList);
  const selectId = useId();
  const [selectedListId, setSelectedListId] = useState<Id<'lists'> | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const selectedList = lists?.find(list => list._id === selectedListId) ?? lists?.[0];
  const isSaved = selectedList && savedListIds?.includes(selectedList._id);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedList || isBusy) return;
    setIsBusy(true);
    setError('');
    setMessage('');
    try {
      await saveBook({ listId: selectedList._id, recordId });
      setMessage(`Saved to ${selectedList.name}.`);
    } catch (error) {
      setError(listError(error));
    } finally {
      setIsBusy(false);
    }
  }

  if (account.isLoading) return <div className="save-book"><p className="list-note" role="status">Loading your lists…</p></div>;
  if (!account.canUseLists) return <div className="save-book"><p className="list-note">{!account.isAuthenticated ? 'Sign in with Google to save books into your lists.' : account.user?.accessStatus === 'pending' ? 'List access is pending approval.' : 'List access is unavailable.'}</p></div>;
  if (!lists) return <div className="save-book"><p className="list-note" role="status">Loading your lists…</p></div>;

  return <div className="save-book" aria-busy={isBusy}>
    {lists.length > 0 ? <><form onSubmit={event => void save(event)}>
      <label htmlFor={selectId}>Save to a list</label>
      <div className="list-form-row"><select id={selectId} value={selectedList?._id ?? ''} onChange={event => {
        setSelectedListId(lists.find(list => list._id === event.target.value)?._id ?? null);
        setError('');
        setMessage('');
      }} disabled={isBusy}>{lists.map(list => <option key={list._id} value={list._id}>{list.name}</option>)}</select><button className="list-primary-button" disabled={isBusy || !selectedList || savedListIds === undefined || isSaved}>{isBusy ? 'Saving…' : isSaved ? 'Saved ✓' : 'Save book'}</button></div>
    </form><details className="create-list-details"><summary>Create another list</summary><NewListForm onCreated={setSelectedListId}/></details></> : <><p className="list-note">Create your first list to save this book.</p><NewListForm onCreated={setSelectedListId}/></>}
    {error && <p className="list-error" role="alert">{error}</p>}
    <p className="list-success" role="status">{message}</p>
    <button className="text-button" onClick={onOpenLists}>View my lists <span aria-hidden="true">→</span></button>
  </div>;
}

function ListContents({ listId, onOpenBook }: { listId: Id<'lists'>; onOpenBook: (book: Book) => void }) {
  const list = useQuery(api.lists.get, { listId });
  const renameList = useMutation(api.lists.rename);
  const deleteList = useMutation(api.lists.remove);
  const removeBook = useMutation(api.lists.removeBook);
  const inputId = useId();
  const [isRenaming, setIsRenaming] = useState(false);
  const [name, setName] = useState('');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');

  async function update(operation: () => Promise<unknown>, onSuccess?: () => void) {
    if (isBusy) return;
    setIsBusy(true);
    setError('');
    try {
      await operation();
      onSuccess?.();
    } catch (error) {
      setError(listError(error));
    } finally {
      setIsBusy(false);
    }
  }

  if (list === undefined) return <div className="loading-state" role="status"><span className="spinner"/>Loading saved books…</div>;
  if (!list) return <p className="list-note">This list is not available.</p>;

  return <div className="list-contents" aria-busy={isBusy}>
    <div className="section-heading"><div><span className="eyebrow">YOUR SAVED BOOKS</span><h2>{list.name}<span className="result-count">{list.items.length}</span></h2></div><div className="list-heading-actions"><button disabled={isBusy} onClick={() => { setName(list.name); setIsRenaming(true); setIsConfirmingDelete(false); }}>Rename</button><button disabled={isBusy} onClick={() => { setIsConfirmingDelete(true); setIsRenaming(false); }}>Delete list</button></div></div>
    {isRenaming && <form className="rename-list-form" onSubmit={event => {
      event.preventDefault();
      void update(() => renameList({ listId, name }), () => setIsRenaming(false));
    }}><label htmlFor={inputId}>List name</label><div className="list-form-row"><input id={inputId} value={name} onChange={event => setName(event.target.value)} maxLength={MAX_LIST_NAME} required disabled={isBusy}/><button className="list-primary-button" disabled={isBusy || !name.trim()}>Save name</button><button className="list-cancel-button" type="button" disabled={isBusy} onClick={() => setIsRenaming(false)}>Cancel</button></div></form>}
    {isConfirmingDelete && <div className="delete-list-confirmation"><p>Delete “{list.name}” and remove its {list.items.length} saved {list.items.length === 1 ? 'book' : 'books'}?</p><div className="list-form-row"><button className="list-danger-button" disabled={isBusy} onClick={() => void update(() => deleteList({ listId }))}>{isBusy ? 'Deleting…' : 'Delete list'}</button><button className="list-cancel-button" disabled={isBusy} onClick={() => setIsConfirmingDelete(false)}>Cancel</button></div></div>}
    {error && <p className="list-error" role="alert">{error}</p>}
    {list.items.length === 0 ? <div className="empty-state"><h3>A little room for your next read.</h3><p>Find a book, then choose this list to save it here.</p></div> : <ul className="saved-book-list">{list.items.map(item => <li key={item.bookId} className="saved-book-row"><div><h3>{item.title}</h3><p>{item.authors.join(', ') || 'Author not listed'}</p>{item.catalogBook && <button className="text-button" onClick={() => onOpenBook(item.catalogBook!)}>Check availability <span aria-hidden="true">→</span></button>}</div><button className="remove-book-button" disabled={isBusy} aria-label={`Remove ${item.title} from ${list.name}`} onClick={() => void update(() => removeBook({ listId, bookId: item.bookId }))}>Remove</button></li>)}</ul>}
  </div>;
}

export function MyLists({ onOpenBook, onFindBooks }: { onOpenBook: (book: Book) => void; onFindBooks: () => void }) {
  const account = useShelfAccount();
  const lists = useQuery(api.lists.mine, account.canUseLists ? {} : 'skip');
  const [selectedListId, setSelectedListId] = useState<Id<'lists'> | null>(null);
  const selectedList = lists?.find(list => list._id === selectedListId) ?? lists?.[0];
  const isPending = account.user?.accessStatus === 'pending';

  return <section className="my-lists" aria-labelledby="lists-title">
    <div className="lists-intro"><div><span className="eyebrow">YOUR NEXT CHAPTERS</span><h1 id="lists-title">My lists<span className="brand-dot">.</span></h1><p>Keep the books you want to come back to.</p></div><button className="secondary-button" onClick={onFindBooks}>Find a book <span aria-hidden="true">→</span></button></div>
    {account.isLoading || (account.canUseLists && lists === undefined) ? <div className="loading-state" role="status"><span className="spinner"/>Loading your lists…</div> : !account.canUseLists ? <div className="empty-state"><h3>{!account.isAuthenticated ? 'Make room for a good book.' : isPending ? 'Your account is awaiting approval.' : 'List access is unavailable.'}</h3><p>{!account.isAuthenticated ? 'Sign in with Google above to create lists and save books across visits.' : isPending ? 'You can use lists once your account has been approved.' : 'This account does not have access to saved lists.'}</p></div> : <div className="lists-workspace"><aside className="lists-sidebar" aria-label="Your book lists"><div className="list-tabs">{lists?.map(list => <button key={list._id} className={selectedList?._id === list._id ? 'selected' : ''} aria-pressed={selectedList?._id === list._id} onClick={() => setSelectedListId(list._id)}><span>{list.name}</span><span>{list.itemCount}</span></button>)}</div><NewListForm onCreated={setSelectedListId}/></aside>{selectedList ? <ListContents key={selectedList._id} listId={selectedList._id} onOpenBook={onOpenBook}/> : <div className="empty-state"><h3>Start your first list.</h3><p>Give it a name, then find a book to add.</p></div>}</div>}
  </section>;
}
