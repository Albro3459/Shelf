import type { Branch } from './api-model.js';
import { CatalogError } from './model.js';

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseDirectory(text: string): Branch[] {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new CatalogError('Catalog directory is not valid JSON'); }
  if (!object(data) || !object(data.search) || !Array.isArray(data.search.restrictions)) {
    throw new CatalogError('Catalog directory has no search restrictions');
  }
  const locations = data.search.restrictions.filter(value => object(value) && value.ident === 'Location_1');
  const location = locations[0];
  if (locations.length !== 1 || !object(location) || !Array.isArray(location.values) || location.values.length === 0 || location.values.length > 100) {
    throw new CatalogError('Catalog directory has no complete public location list');
  }
  const codes = new Set<string>();
  const branches: Branch[] = [];
  for (const value of location.values) {
    if (!object(value) || typeof value.ident !== 'string' || !/^EBRPL\/[A-Z0-9]{2,10}$/.test(value.ident) ||
      typeof value.name !== 'string' || !value.name.trim() || value.name.length > 200 || codes.has(value.ident)) {
      throw new CatalogError('Catalog directory has an invalid location');
    }
    codes.add(value.ident);
    if (value.ident === 'EBRPL/ELR' || /digital resources/i.test(value.name)) continue;
    branches.push({ code: value.ident, name: value.name.trim() });
  }
  if (branches.length === 0) throw new CatalogError('Catalog directory has no physical branches');
  return branches;
}
