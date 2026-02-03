export function toYyyyMmDd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromYyyyMmDd(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function toNbaMmDdYyyy(yyyyMmDd: string) {
  // stats.nba.com endpoints usually take MM/DD/YYYY
  const [y, m, d] = yyyyMmDd.split('-');
  return `${m}/${d}/${y}`;
}
