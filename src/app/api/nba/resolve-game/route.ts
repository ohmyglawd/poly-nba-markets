import { NextResponse } from 'next/server';
import { nbaHeaders } from '@/lib/nbaHeaders';
import type { NbaTeamInfo } from '@/lib/types';

type ResolveResponse = {
  date: string;
  home: NbaTeamInfo;
  away: NbaTeamInfo;
  gameId?: string;
  gameChartsUrl?: string;
};

const NBA_TEAMS: NbaTeamInfo[] = [
  { teamId: 1610612737, abbr: 'ATL', name: 'Hawks' },
  { teamId: 1610612738, abbr: 'BOS', name: 'Celtics' },
  { teamId: 1610612751, abbr: 'BKN', name: 'Nets' },
  { teamId: 1610612766, abbr: 'CHA', name: 'Hornets' },
  { teamId: 1610612741, abbr: 'CHI', name: 'Bulls' },
  { teamId: 1610612739, abbr: 'CLE', name: 'Cavaliers' },
  { teamId: 1610612742, abbr: 'DAL', name: 'Mavericks' },
  { teamId: 1610612743, abbr: 'DEN', name: 'Nuggets' },
  { teamId: 1610612765, abbr: 'DET', name: 'Pistons' },
  { teamId: 1610612744, abbr: 'GSW', name: 'Warriors' },
  { teamId: 1610612745, abbr: 'HOU', name: 'Rockets' },
  { teamId: 1610612754, abbr: 'IND', name: 'Pacers' },
  { teamId: 1610612746, abbr: 'LAC', name: 'Clippers' },
  { teamId: 1610612747, abbr: 'LAL', name: 'Lakers' },
  { teamId: 1610612763, abbr: 'MEM', name: 'Grizzlies' },
  { teamId: 1610612748, abbr: 'MIA', name: 'Heat' },
  { teamId: 1610612749, abbr: 'MIL', name: 'Bucks' },
  { teamId: 1610612750, abbr: 'MIN', name: 'Timberwolves' },
  { teamId: 1610612740, abbr: 'NOP', name: 'Pelicans' },
  { teamId: 1610612752, abbr: 'NYK', name: 'Knicks' },
  { teamId: 1610612760, abbr: 'OKC', name: 'Thunder' },
  { teamId: 1610612753, abbr: 'ORL', name: 'Magic' },
  { teamId: 1610612755, abbr: 'PHI', name: '76ers' },
  { teamId: 1610612756, abbr: 'PHX', name: 'Suns' },
  { teamId: 1610612757, abbr: 'POR', name: 'Trail Blazers' },
  { teamId: 1610612758, abbr: 'SAC', name: 'Kings' },
  { teamId: 1610612759, abbr: 'SAS', name: 'Spurs' },
  { teamId: 1610612761, abbr: 'TOR', name: 'Raptors' },
  { teamId: 1610612762, abbr: 'UTA', name: 'Jazz' },
  { teamId: 1610612764, abbr: 'WAS', name: 'Wizards' },
];

function lc(s: string) {
  return s.toLowerCase();
}

function findTeam(needle: string): NbaTeamInfo {
  const n = lc(needle);
  return (
    NBA_TEAMS.find((t) => lc(t.name) === n) ||
    NBA_TEAMS.find((t) => n.includes(lc(t.name))) ||
    NBA_TEAMS.find((t) => lc(t.name).includes(n)) ||
    NBA_TEAMS.find((t) => lc(t.abbr) === n) ||
    NBA_TEAMS[0]
  );
}

function get(o: unknown, k: string): unknown {
  return o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const home = searchParams.get('home');
  const away = searchParams.get('away');

  if (!date || !home || !away) {
    return NextResponse.json(
      { error: 'Missing params: date=YYYY-MM-DD&home=...&away=...' },
      { status: 400 }
    );
  }

  const homeTeam = findTeam(home);
  const awayTeam = findTeam(away);

  try {
    const gamesUrl = `https://www.nba.com/games?date=${encodeURIComponent(date)}`;
    const htmlRes = await fetch(gamesUrl, {
      headers: {
        ...nbaHeaders(),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      cache: 'no-store',
    });

    if (!htmlRes.ok) {
      const text = await htmlRes.text().catch(() => '');
      return NextResponse.json(
        { error: `NBA games page fetch failed ${htmlRes.status}`, detail: text.slice(0, 2000) },
        { status: 502 }
      );
    }

    const html = await htmlRes.text();
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m || !m[1]) {
      return NextResponse.json({ error: 'NBA games page parse failed: missing __NEXT_DATA__' }, { status: 502 });
    }

    const nextData = JSON.parse(m[1]) as unknown;
    const pageProps = get(get(nextData, 'props'), 'pageProps');
    const gameCardFeed = get(pageProps, 'gameCardFeed');
    const modules = get(gameCardFeed, 'modules');
    const firstModule = Array.isArray(modules) ? (modules[0] as unknown) : undefined;
    const cards = get(firstModule, 'cards');

    let gameId: string | undefined;

    if (Array.isArray(cards)) {
      for (const c of cards as Array<Record<string, unknown>>) {
        const cardData = (c['cardData'] || {}) as Record<string, unknown>;
        const ht = (cardData['homeTeam'] || {}) as Record<string, unknown>;
        const at = (cardData['awayTeam'] || {}) as Record<string, unknown>;
        const homeId = Number(ht['teamId'] ?? 0);
        const awayId = Number(at['teamId'] ?? 0);
        if (homeId === homeTeam.teamId && awayId === awayTeam.teamId) {
          const gid = cardData['gameId'];
          if (typeof gid === 'string' && gid) gameId = gid;
          break;
        }
      }
    }

    const payload: ResolveResponse = {
      date,
      home: homeTeam,
      away: awayTeam,
      gameId,
      gameChartsUrl: gameId ? `https://www.nba.com/game/${gameId}/game-charts` : undefined,
    };

    return NextResponse.json(payload);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'NBA resolve-game error', detail: msg }, { status: 502 });
  }
}
