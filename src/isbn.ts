export function canonicalIsbn13(rawIsbn: string): string | null {
  let isbn = rawIsbn.replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(isbn)) {
    const sum = [...isbn].reduce((total, digit, index) => total + (digit === 'X' ? 10 : Number(digit)) * (10 - index), 0);
    if (sum % 11 !== 0) return null;
    isbn = `978${isbn.slice(0, 9)}`;
    const sum13 = [...isbn].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
    return `${isbn}${(10 - sum13 % 10) % 10}`;
  }
  if (!/^97[89]\d{10}$/.test(isbn)) return null;
  const sum = [...isbn].reduce((total, digit, index) => total + Number(digit) * (index % 2 === 0 ? 1 : 3), 0);
  return sum % 10 === 0 ? isbn : null;
}
