export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputError';
  }
}

export function normalizeRecordId(value: string): string {
  if (/^[1-9]\d{0,11}$/.test(value)) return `1.${value}`;
  if (/^1\.[1-9]\d{0,11}$/.test(value)) return value;
  throw new InputError('Enter a valid EBRPL record ID');
}

export function resolveInput(rawInput: string): { kind: 'search'; query: string } | { kind: 'record'; recordId: string } {
  const input = rawInput.trim();
  if (!input || input.length > 1000 || /[\u0000-\u001f\u007f]/.test(input)) {
    throw new InputError('Enter 1 to 1000 characters');
  }
  if (/^(?:1\.)?\d+$/.test(input) && !/^(?:\d{10}|\d{13})$/.test(input)) {
    return { kind: 'record', recordId: normalizeRecordId(input) };
  }
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(input) || /^(?:https?|file|javascript|data|mailto):/i.test(input) ||
    /^\/\//.test(input) || /^(?:www\.|catalog\.ebrpl\.com)/i.test(input)) {
    let url: URL;
    try { url = new URL(input); } catch { throw new InputError('Enter a complete HTTPS EBRPL catalog record URL'); }
    if (url.protocol !== 'https:' || url.hostname !== 'catalog.ebrpl.com' || url.port || url.username || url.password ||
      url.pathname !== '/iguana/www.main.cls' || /[\\]/.test(input)) {
      throw new InputError('Only HTTPS EBRPL catalog record URLs are supported');
    }
    const fragment = new URLSearchParams(url.hash.slice(1));
    const ids = fragment.getAll('recordId');
    if (ids.length !== 1) throw new InputError('Catalog URL must include one recordId');
    return { kind: 'record', recordId: normalizeRecordId(ids[0] ?? '') };
  }
  return { kind: 'search', query: input };
}
