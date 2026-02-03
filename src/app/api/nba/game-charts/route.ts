import { NextResponse } from 'next/server';
import { nbaHeaders } from '@/lib/nbaHeaders';

type NextData = Record<string, unknown>;

type GameChartsSummary = {
  gameId: string;
  gameStatusText?: string;
  period?: number;
  gameClock?: string;
  homeTeam?: {
    teamId?: number;
    teamTricode?: string;
    teamName?: string;
    statistics?: Record<string, unknown>;
  };
  awayTeam?: {
    teamId?: number;
    teamTricode?: string;
    teamName?: string;
    statistics?: Record<string, unknown>;
  };
};

function get(o: unknown, k: string): unknown {
  return o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined;
}

function pickStats(obj: Record<string, unknown> | undefined) {
  if (!obj) return undefined;
  const s = (get(obj, 'statistics') as Record<string, unknown> | undefined) ?? undefined;
  if (!s) return undefined;
  // Keep only a compact subset for UI (A-level summary)
  const keys = [
    'points',
    'reboundsTotal',
    'assists',
    'turnovers',
    'steals',
    'blocks',
    'fieldGoalsPercentage',
    'threePointersPercentage',
    'freeThrowsPercentage',
    'pointsInThePaint',
  ];
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = s[k];
  return out;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const gameId = searchParams.get('gameId');
  if (!gameId) {
    return NextResponse.json({ error: 'Missing gameId' }, { status: 400 });
  }

  try {
    const url = `https://www.nba.com/game/${encodeURIComponent(gameId)}/game-charts`;
    const res = await fetch(url, {
      headers: {
        ...nbaHeaders(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return NextResponse.json(
        { error: `NBA game-charts page fetch failed ${res.status}`, detail: text.slice(0, 2000) },
        { status: 502 }
      );
    }

    const html = await res.text();
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m || !m[1]) {
      return NextResponse.json({ error: 'NBA game-charts parse failed: missing __NEXT_DATA__' }, { status: 502 });
    }

    const nextData = JSON.parse(m[1]) as NextData;
    const pageProps = get(get(get(nextData, 'props'), 'pageProps'), 'pageProps') ?? get(get(nextData, 'props'), 'pageProps');
    const game = get(pageProps, 'game');

    const postgameCharts = get(game, 'postgameCharts') as Record<string, unknown> | undefined;
    const home = (postgameCharts ? (get(postgameCharts, 'homeTeam') as Record<string, unknown> | undefined) : undefined) ??
      (get(game, 'homeTeam') as Record<string, unknown> | undefined);
    const away = (postgameCharts ? (get(postgameCharts, 'awayTeam') as Record<string, unknown> | undefined) : undefined) ??
      (get(game, 'awayTeam') as Record<string, unknown> | undefined);

    const payload: GameChartsSummary = {
      gameId: String(get(game, 'gameId') ?? gameId),
      gameStatusText: (get(game, 'gameStatusText') as string | undefined) ?? undefined,
      period: (get(game, 'period') as number | undefined) ?? undefined,
      gameClock: (get(game, 'gameClock') as string | undefined) ?? undefined,
      homeTeam: {
        teamId: Number(get(home, 'teamId') ?? 0) || undefined,
        teamTricode: (get(home, 'teamTricode') as string | undefined) ?? undefined,
        teamName: (get(home, 'teamName') as string | undefined) ?? undefined,
        statistics: pickStats(home),
      },
      awayTeam: {
        teamId: Number(get(away, 'teamId') ?? 0) || undefined,
        teamTricode: (get(away, 'teamTricode') as string | undefined) ?? undefined,
        teamName: (get(away, 'teamName') as string | undefined) ?? undefined,
        statistics: pickStats(away),
      },
    };

    return NextResponse.json(payload);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'NBA game-charts error', detail: msg }, { status: 502 });
  }
}
