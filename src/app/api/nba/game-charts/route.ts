import { NextResponse } from 'next/server';
import { nbaHeaders } from '@/lib/nbaHeaders';

type NextData = Record<string, unknown>;

type Leader = {
  id?: number;
  name?: string;
  value?: number;
};

type TeamCharts = {
  teamId?: number;
  teamTricode?: string;
  teamName?: string;
  score?: number;
  seasonAveragesPerGame?: {
    pts?: number;
    reb?: number;
    ast?: number;
    stl?: number;
    blk?: number;
    tov?: number;
    fgPct?: number;
    fg3Pct?: number;
    ftPct?: number;
  };
  leadingPlayers?: {
    pts?: Leader;
    reb?: Leader;
    ast?: Leader;
    blk?: Leader;
  };
};

type GameChartsSummary = {
  gameId: string;
  gameStatusText?: string;
  period?: number;
  gameClock?: string;
  homeTeam?: TeamCharts;
  awayTeam?: TeamCharts;
};

function get(o: unknown, k: string): unknown {
  return o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined;
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function leaderFromStats(s: Record<string, unknown>, kind: 'Pts' | 'Reb' | 'Ast' | 'Blk'): Leader {
  const first = String(s[`player${kind}LeaderFirstName`] ?? '').trim();
  const last = String(s[`player${kind}LeaderFamilyName`] ?? '').trim();
  const id = num(s[`player${kind}LeaderId`]);
  const value = num(s[`player${kind}Leader${kind}`]);
  const name = `${first} ${last}`.trim() || undefined;
  return { id: id ? Number(id) : undefined, name, value };
}

function teamFromGameAndCharts(
  gameTeam: Record<string, unknown> | undefined,
  chartsTeam: Record<string, unknown> | undefined
): TeamCharts {
  const gt = gameTeam || {};
  const ct = chartsTeam || {};

  const stats = (get(ct, 'statistics') as Record<string, unknown> | undefined) || undefined;

  const seasonAveragesPerGame = stats
    ? {
        pts: num(stats.points),
        reb: num(stats.reboundsTotal),
        ast: num(stats.assists),
        stl: num(stats.steals),
        blk: num(stats.blocks),
        tov: num(stats.turnovers),
        fgPct: num(stats.fieldGoalsPercentage),
        fg3Pct: num(stats.threePointersPercentage),
        ftPct: num(stats.freeThrowsPercentage),
      }
    : undefined;

  const leadingPlayers = stats
    ? {
        pts: leaderFromStats(stats, 'Pts'),
        reb: leaderFromStats(stats, 'Reb'),
        ast: leaderFromStats(stats, 'Ast'),
        blk: leaderFromStats(stats, 'Blk'),
      }
    : undefined;

  return {
    teamId: num(get(gt, 'teamId')) ?? num(get(ct, 'teamId')),
    teamTricode: (get(gt, 'teamTricode') as string | undefined) ?? (get(ct, 'teamTricode') as string | undefined),
    teamName: (get(gt, 'teamName') as string | undefined) ?? (get(ct, 'teamName') as string | undefined),
    score: num(get(gt, 'score')),
    seasonAveragesPerGame,
    leadingPlayers,
  };
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
      return NextResponse.json(
        { error: 'NBA game-charts parse failed: missing __NEXT_DATA__' },
        { status: 502 }
      );
    }

    const nextData = JSON.parse(m[1]) as NextData;
    const pageProps = get(get(nextData, 'props'), 'pageProps');
    const game = get(pageProps, 'game');

    const gameObj = (typeof game === 'object' && game ? (game as Record<string, unknown>) : {}) as Record<
      string,
      unknown
    >;

    const pregameCharts = get(gameObj, 'pregameCharts') as Record<string, unknown> | undefined;
    const homeCharts = (pregameCharts ? (get(pregameCharts, 'homeTeam') as Record<string, unknown> | undefined) : undefined) ??
      undefined;
    const awayCharts = (pregameCharts ? (get(pregameCharts, 'awayTeam') as Record<string, unknown> | undefined) : undefined) ??
      undefined;

    const homeGame = (get(gameObj, 'homeTeam') as Record<string, unknown> | undefined) ?? undefined;
    const awayGame = (get(gameObj, 'awayTeam') as Record<string, unknown> | undefined) ?? undefined;

    const payload: GameChartsSummary = {
      gameId: String(get(gameObj, 'gameId') ?? gameId),
      gameStatusText: (get(gameObj, 'gameStatusText') as string | undefined) ?? undefined,
      period: (get(gameObj, 'period') as number | undefined) ?? undefined,
      gameClock: (get(gameObj, 'gameClock') as string | undefined) ?? undefined,
      homeTeam: teamFromGameAndCharts(homeGame, homeCharts),
      awayTeam: teamFromGameAndCharts(awayGame, awayCharts),
    };

    return NextResponse.json(payload);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'NBA game-charts error', detail: msg }, { status: 502 });
  }
}
