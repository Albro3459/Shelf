// Domain schema reference; runtime validators live in convex/schema.ts
// Convex supplies _id and _creationTime; timestamps below are Unix milliseconds

import type { GenericId } from 'convex/values';
import type { AvailabilityStatus } from '../src/model.js';

export type ShelfId<Table extends keyof ShelfTables> = GenericId<Table>;

// Selected auth profile fields plus app fields; preserve the full managed auth schema
export type ShelfUserDoc = {
  name?: string;
  email?: string;
  emailVerificationTime?: number;
  image?: string;
  accessStatus?: 'pending' | 'active' | 'disabled';
  emailNotificationsEnabled?: boolean;
};

export type ShelfListDoc = {
  userId: ShelfId<'users'>;
  name: string;
  updatedAt: number;
};

export type ShelfListItemDoc = {
  listId: ShelfId<'lists'>;
  bookId: ShelfId<'books'>;
};

// A confirmed grouping of physical editions in the same language
export type ShelfBookDoc = {
  title: string;
  authors: string[];
  language?: string;
  updatedAt: number;
  nextCheckAt?: number;
  checkStartedAt?: number;
  checkLeaseExpiresAt?: number;
  lastCheckAt?: number;
};

export type ShelfBookIsbnDoc = {
  bookId: ShelfId<'books'>;
  isbn13: string;
};

export type ShelfIguanaConfig = {
  landingUrl: string;
  searchUrl: string;
  directoryUrl: string;
};

export type ShelfLibrarySystemDoc = {
  code: string;
  name: string;
  adapterKey: 'iguana';
  config: ShelfIguanaConfig;
  isEnabled: boolean;
};

export type ShelfBranchDoc = {
  librarySystemId: ShelfId<'librarySystems'>;
  externalId: string;
  name: string;
  isEnabled: boolean;
};

export type ShelfCatalogRecordDoc = {
  bookId: ShelfId<'books'>;
  librarySystemId: ShelfId<'librarySystems'>;
  externalId: string;
  observedIsbns: string[];
  physicalFormat?: string;
  updatedAt: number;
  nextCheckAt?: number;
  lastAttemptAt?: number;
  lastSuccessfulCheckAt?: number;
  lastErrorCode?: string;
};

export type ShelfSubscriptionDoc = {
  userId: ShelfId<'users'>;
  bookId: ShelfId<'books'>;
  branchId: ShelfId<'branches'>;
  isEnabled: boolean;
  updatedAt: number;
};

// Failed checks preserve successful observations and update catalog record error fields
export type ShelfAvailabilityDoc = {
  catalogRecordId: ShelfId<'catalogRecords'>;
  branchId: ShelfId<'branches'>;
  status: AvailabilityStatus;
  checkedAt: number;
  lastKnownStatus?: 'available' | 'unavailable';
  lastKnownAt?: number;
  rawStatuses: string[];
  rawAvailableFlags: string[];
};

// Each event starts an available period; confirmed unavailability closes it
export type ShelfAvailabilityEventDoc = {
  bookId: ShelfId<'books'>;
  branchId: ShelfId<'branches'>;
  startedAt: number;
  endedAt?: number;
};

export type ShelfNotificationStatus =
  | 'pending'
  | 'sending'
  | 'submitted'
  | 'failed'
  | 'uncertain'
  | 'cancelled';

// One email intent per user, book, branch, and available period
export type ShelfNotificationDoc = {
  userId: ShelfId<'users'>;
  subscriptionId: ShelfId<'subscriptions'>;
  bookId: ShelfId<'books'>;
  branchId: ShelfId<'branches'>;
  availabilityEventId: ShelfId<'availabilityEvents'>;
  channel: 'email';
  status: ShelfNotificationStatus;
  attemptCount: number;
  lastAttemptAt?: number;
  nextAttemptAt?: number;
  leaseExpiresAt?: number;
  submittedAt?: number;
  providerMessageId?: string;
  lastErrorCode?: string;
};

export type ShelfTables = {
  users: ShelfUserDoc;
  lists: ShelfListDoc;
  listItems: ShelfListItemDoc;
  books: ShelfBookDoc;
  bookIsbns: ShelfBookIsbnDoc;
  librarySystems: ShelfLibrarySystemDoc;
  branches: ShelfBranchDoc;
  catalogRecords: ShelfCatalogRecordDoc;
  subscriptions: ShelfSubscriptionDoc;
  availability: ShelfAvailabilityDoc;
  availabilityEvents: ShelfAvailabilityEventDoc;
  notifications: ShelfNotificationDoc;
};

export type ShelfDocument<Table extends keyof ShelfTables> = ShelfTables[Table] & {
  _id: ShelfId<Table>;
  _creationTime: number;
};
