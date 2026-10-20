export function cleanCatalogText(value: string): string {
  return value.replace(/<\/?q>/gi, '').replace(/<br\s*\/?\s*>/gi, ' ').replace(/\s+/g, ' ').trim();
}
