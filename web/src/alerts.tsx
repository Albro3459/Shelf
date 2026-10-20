import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { useAction, useMutation, useQuery } from 'convex/react';
import { ConvexError } from 'convex/values';
import { api } from '../../convex/_generated/api';
import type { Id } from '../../convex/_generated/dataModel';
import type { BookAlertOptions } from '../../convex/notificationModel';

function alertError(error: unknown): string {
  return error instanceof ConvexError && typeof error.data === 'string' ? error.data : 'Could not update your alerts. Please try again.';
}

function BranchAlertForm({ listId, bookId, options, onSaved }: {
  listId: Id<'lists'>; bookId: Id<'books'>; options: BookAlertOptions; onSaved: () => void;
}) {
  const save = useMutation(api.alerts.save);
  const [selected, setSelected] = useState(() => options.branches.filter(branch => branch.isSelected).map(branch => branch._id));
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy) return;
    setIsBusy(true);
    setError('');
    try {
      await save({ listId, bookId, branchIds: selected });
      onSaved();
    } catch (error) {
      setError(alertError(error));
    } finally {
      setIsBusy(false);
    }
  }
  return <form className="branch-alert-form" onSubmit={event => void submit(event)}>
    <fieldset disabled={isBusy}><legend>Email me when a copy is available at:</legend>
      <div className="branch-alert-choices">{options.branches.map(branch => <label key={branch._id} className="alert-checkbox"><input type="checkbox" checked={selected.includes(branch._id)} onChange={event => setSelected(current => event.target.checked ? [...current, branch._id] : current.filter(id => id !== branch._id))}/><span>{branch.name}</span></label>)}</div>
    </fieldset>
    {!options.emailEnabled && <p className="list-note">Email is paused. Turn on email alerts above to receive notifications.</p>}
    <p className="list-note">Checked hourly, 8 AM–5 PM Central. You’ll also get an email if a copy is already available.</p>
    <button className="list-primary-button" disabled={isBusy}>{isBusy ? 'Saving…' : 'Save alerts'}</button>
    {error && <p className="list-error" role="alert">{error}</p>}
  </form>;
}

export function BookAlerts({ listId, bookId, title }: { listId: Id<'lists'>; bookId: Id<'books'>; title: string }) {
  const prepare = useAction(api.alerts.prepare);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const options = useQuery(api.alerts.options, isOpen ? { listId, bookId } : 'skip');
  const panelId = useId();
  async function toggle() {
    setMessage('');
    if (isOpen) { setIsOpen(false); return; }
    setIsLoading(true);
    setError('');
    try {
      await prepare({ listId, bookId });
      setIsOpen(true);
    } catch (error) {
      setError(alertError(error));
    } finally {
      setIsLoading(false);
    }
  }
  return <div className="book-alerts">
    <button className="text-button" aria-label={`Branch alerts for ${title}`} aria-expanded={isOpen} aria-controls={panelId} disabled={isLoading} onClick={() => void toggle()}>{isLoading ? 'Loading branches…' : isOpen ? 'Close alerts' : 'Branch alerts'}</button>
    <div id={panelId}>{isOpen && (options === undefined ? <p className="list-note" role="status">Loading alert choices…</p> : !options ? <p className="list-note">This saved book is no longer available.</p> : options.branches.length ? <BranchAlertForm listId={listId} bookId={bookId} options={options} onSaved={() => { setIsOpen(false); setMessage('Alert choices saved.'); }}/> : <p className="list-note">No branches are available for alerts.</p>)}</div>
    {error && <p className="list-error" role="alert">{error}</p>}
    {message && <p className="list-success" role="status">{message}</p>}
  </div>;
}

export function EmailAlerts({ isEnabled, email }: { isEnabled: boolean; email: string | null }) {
  const alerts = useQuery(api.alerts.mine, {});
  const toggleEmail = useMutation(api.alerts.setEmailEnabled);
  const disable = useMutation(api.alerts.disable);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState('');
  async function update(operation: () => Promise<unknown>) {
    if (isBusy) return;
    setIsBusy(true);
    setError('');
    try { await operation(); }
    catch (error) { setError(alertError(error)); }
    finally { setIsBusy(false); }
  }
  return <section className="email-alerts" aria-label="Email alerts">
    <div className="email-alert-heading"><div><h2>Email alerts</h2><p>{isEnabled ? `Send availability updates to ${email ?? 'your account email'}.` : 'Email is off. Your branch choices stay saved.'}</p></div><label className="alert-checkbox email-switch"><input type="checkbox" aria-label="Email alerts" checked={isEnabled} disabled={isBusy} onChange={event => void update(() => toggleEmail({ isEnabled: event.target.checked }))}/><span>{isEnabled ? 'On' : 'Off'}</span></label></div>
    {alerts && alerts.length > 0 ? <details className="saved-alerts"><summary>{alerts.length} saved {alerts.length === 1 ? 'branch alert' : 'branch alerts'}{!isEnabled && ' · paused'}</summary><p className="list-note">Alerts stay on when a book is removed from a list. Stop them here.</p><ul>{alerts.map(alert => <li key={alert._id}><div><strong>{alert.title}</strong><span>{alert.branchName}</span></div><button className="remove-book-button" aria-label={`Stop alert for ${alert.title} at ${alert.branchName}`} disabled={isBusy} onClick={() => void update(() => disable({ subscriptionId: alert._id }))}>Stop alert</button></li>)}</ul></details> : <p className="list-note">Choose “Branch alerts” beside a saved book to get started.</p>}
    {error && <p className="list-error" role="alert">{error}</p>}
  </section>;
}
