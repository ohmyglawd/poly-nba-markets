import { NextResponse } from 'next/server';
import type { MatchupCard, PolymarketMarket } from '@/lib/types';

type GammaMarket = Record<string, unknown>;

type GammaEvent = Record<string, unknown> & {
  markets?: GammaMarket[];
};

function getStr(o: Record<string, unknown>, k: string) {
  const v = o[k];
  return typeof v === 'string' ? v : '';
}

function getNum(o: Record<string, unknown>, k: string) {
  const v = o[k];
  return typeof v === 'number' ? v : undefined;
}

function isoToLocalYyyyMmDd(iso: string, tzOffsetMinutes: number) {
  // tzOffsetMinutes is like Date.getTimezoneOffset(): minutes behind UTC.
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const localMs = t - tzOffsetMinutes * 60_000;
  const d = new Date(localMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizeTeams(title: string) {
  // Event title is usually "Grizzlies vs. Lakers".
  const cleaned = title.replace(/\s+/g, ' ').trim();
  const m = cleaned.split(/\s+vs\.?\s+/i);
  if (m.length === 2) return { away: m[0].trim(), home: m[1].trim() };
  return null;
}

function mapSportsMarketType(s: string) {
  const x = s.toLowerCase();
  if (x === 'moneyline') return 'moneyline' as const;
  if (x === 'spreads') return 'spread' as const;
  if (x === 'totals') return 'total' as const;
  return 'unknown' as const;
}

function toNumMaybe(v: unknown) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function mapMarket(m: GammaMarket): PolymarketMarket {
  const title = getStr(m, 'groupItemTitle') || getStr(m, 'question') || getStr(m, 'title') || getStr(m, 'name');
  const id = String(getStr(m, 'id') || getStr(m, 'conditionId') || title);

  const sportsMarketType = getStr(m, 'sportsMarketType');
  const type = mapSportsMarketType(sportsMarketType);

  const outcomes = m['outcomes'];
  const prices = m['outcomePrices'];

  const parseStrList = (v: unknown): string[] => {
    if (Array.isArray(v)) return v.map(String);
    if (typeof v === 'string') {
      // Gamma sometimes returns JSON-encoded strings.
      try {
        const x = JSON.parse(v) as unknown;
        if (Array.isArray(x)) return x.map(String);
      } catch {
        // ignore
      }
    }
    return [];
  };

  const parseNumList = (v: unknown): Array<number | undefined> => {
    if (Array.isArray(v)) return v.map(toNumMaybe);
    if (typeof v === 'string') {
      try {
        const x = JSON.parse(v) as unknown;
        if (Array.isArray(x)) return x.map(toNumMaybe);
      } catch {
        // ignore
      }
    }
    return [];
  };

  const outs = parseStrList(outcomes);
  const prs = parseNumList(prices);

  // Fallback: if outcomePrices aren't present, try lastTradePrice/bestAsk.
  if (outs.length === 2 && prs.length === 0) {
    const lp = toNumMaybe(m['lastTradePrice']);
    const ba = toNumMaybe(m['bestAsk']);
    const p0 = lp ?? ba;
    if (typeof p0 === 'number') {
      prs[0] = p0;
      prs[1] = 1 - p0;
    }
  }

  const selections = outs.map((label, i) => ({
    label,
    priceYes: prs[i],
  }));

  const line = toNumMaybe(m['line']);
  const subtitle = line != null && type !== 'moneyline' ? `${type === 'spread' ? 'Line' : 'Total'} ${line}` : undefined;

  const pm: PolymarketMarket = {
    id,
    type,
    sportsMarketType: sportsMarketType || undefined,
    line,
    title: subtitle ? `${title} · ${subtitle}` : title,
    volume: getNum(m, 'volumeNum') ?? getNum(m, 'volume'),
    liquidity: getNum(m, 'liquidityNum') ?? getNum(m, 'liquidity'),
    selections,
  };

  return pm;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date'); // YYYY-MM-DD (user local date)
  const tzOffset = Number(searchParams.get('tzOffset') ?? '0');

  if (!date) {
    return NextResponse.json({ error: 'Missing date (YYYY-MM-DD)' }, { status: 400 });
  }

  // NBA series id from your example. We can later make this configurable.
  const seriesId = searchParams.get('series_id') || '10345';

  const base = process.env.POLYMARKET_GAMMA_BASE || 'https://gamma-api.polymarket.com';
  const url = new URL('/events', base);
  url.searchParams.set('series_id', seriesId);
  url.searchParams.set('active', 'true');
  url.searchParams.set('closed', 'false');

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' }, cache: 'no-store' });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return NextResponse.json(
      { error: `Polymarket events fetch failed: ${res.status}`, detail: text.slice(0, 2000) },
      { status: 502 }
    );
  }

  const raw = (await res.json()) as unknown;
  const events = Array.isArray(raw) ? (raw as GammaEvent[]) : [];

  const items: MatchupCard[] = events
    .filter((ev) => {
      const startTime = getStr(ev, 'startTime') || getStr(ev, 'eventDate') || getStr(ev, 'endDate');
      const local = startTime ? isoToLocalYyyyMmDd(startTime, Number.isFinite(tzOffset) ? tzOffset : 0) : null;
      return local === date;
    })
    .map((ev) => {
      const title = getStr(ev, 'title');
      const teams = normalizeTeams(title);
      const id = String(getStr(ev, 'id') || getStr(ev, 'slug') || title);
      const startTime = getStr(ev, 'startTime') || getStr(ev, 'eventDate') || getStr(ev, 'endDate') || undefined;

      const marketsAll = Array.isArray(ev.markets) ? ev.markets.map(mapMarket) : [];
      // For now, only show core markets
      const markets = marketsAll.filter(
        (m) => (m.sportsMarketType || '').toLowerCase() === 'moneyline' || (m.sportsMarketType || '').toLowerCase() === 'spreads' || (m.sportsMarketType || '').toLowerCase() === 'totals'
      );

      const card: MatchupCard = {
        id,
        league: 'NBA',
        startTime,
        awayTeam: { name: (teams?.away ?? title) || 'TBD' },
        homeTeam: { name: (teams?.home ?? title) || 'TBD' },
        markets,
        sourceUrl: `https://polymarket.com/event/${getStr(ev, 'slug')}`,
      };

      return card;
    });

  return NextResponse.json({ date, seriesId, count: items.length, items });
}
