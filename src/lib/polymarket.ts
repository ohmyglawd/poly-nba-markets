import type { PolymarketMarket } from '@/lib/types';

export function groupByMarketType(markets: PolymarketMarket[]) {
  const groups: Record<string, PolymarketMarket[]> = {};
  for (const m of markets) {
    const k = m.sportsMarketType || m.type || 'unknown';
    (groups[k] ||= []).push(m);
  }
  return groups;
}
