import type { AvailabilityStatus } from '../src/model.js';
import type { Id } from './_generated/dataModel';

export const MAX_SUBSCRIPTIONS = 100;
export const MAX_RECORDS_PER_BOOK = 20;
export const CHECK_INTERVAL_MS = 60 * 60 * 1000;
export const FRESHNESS_MS = 65 * 60 * 1000;
export const SEND_LEASE_MS = 2 * 60 * 1000;
export const MAX_SEND_ATTEMPTS = 3;
export const RETRYABLE_EMAIL_ERRORS = ['TooManyRequestsException', 'LimitExceededException'];

export type AlertBranch = { _id: Id<'branches'>; name: string; isSelected: boolean };
export type BookAlertOptions = { branches: AlertBranch[]; emailEnabled: boolean };
export type SavedAlert = {
  _id: Id<'subscriptions'>;
  title: string;
  branchName: string;
  status: AvailabilityStatus;
};

export function withinCheckHours(now: number): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find(part => part.type === 'hour')?.value);
  return hour >= 8 && hour <= 17;
}
