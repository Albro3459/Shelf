import type { Id } from './_generated/dataModel';
import type { Book } from '../src/model.js';

export const MAX_LISTS = 50;
export const MAX_LIST_ITEMS = 200;
export const MAX_LIST_NAME = 80;

export type ListSummary = { _id: Id<'lists'>; name: string; itemCount: number };
export type SavedListItem = { bookId: Id<'books'>; title: string; authors: string[]; catalogBook: Book | null };
export type ListDetail = { _id: Id<'lists'>; name: string; items: SavedListItem[] };
