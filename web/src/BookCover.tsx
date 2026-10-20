import type { Book } from '../../src/model';

export function BookIcon({ small = false }: { small?: boolean }) {
  return <svg width={small ? 19 : 26} height={small ? 19 : 26} viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 6.5C9 4.4 5.5 4 2.5 4.5v14c3-.5 6.5-.1 9.5 2 3-2.1 6.5-2.5 9.5-2v-14C18.5 4 15 4.4 12 6.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/><path d="M12 6.5v14" stroke="currentColor" strokeWidth="1.5"/></svg>;
}

export function BookCover({ book, large = false }: { book: Pick<Book, 'recordId' | 'title' | 'authors'>; large?: boolean }) {
  const palette = [...book.recordId].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3;
  return <div className={`book-cover palette-${palette}${large ? ' large-cover' : ''}`} aria-hidden="true"><div className="cover-rule"/><span className="cover-title">{book.title}</span><div className="cover-bottom"><BookIcon small/><span>{book.authors[0] || 'EBRPL collection'}</span></div></div>;
}
