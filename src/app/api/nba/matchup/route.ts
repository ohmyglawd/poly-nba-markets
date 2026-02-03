import { NextResponse } from 'next/server';
import { nbaHeaders } from '@/lib/nbaHeaders';
import { toNbaMmDdYyyy } from '@/lib/date';
import type { NbaMatchupData, NbaGameResult, NbaTeamInfo } from '@/lib/types';

type ResultSet = {
  name?: string;
  headers?: string[];
  rowSet?: unknown[][];
};

type NbaApiEnvelope = {
  resultSets?: ResultSet[];
  resultSet?: ResultSet;
};

function currentSeasonLabel(now = new Date()) {
  // NBA season label like 2025-26.
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  // season starts around Oct
  const startYear = m >= 10 ? y : y - 1;
  const endYear2 = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endYear2}`;
}

function toYyyyMmDdCompact(yyyyMmDd: string) {
  return yyyyMmDd.replaceAll('-', '');
}

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

type CacheEntry = { exp: number; value: unknown };

const CACHE_TTL_MS = 5 * 60_000; // 5 minutes
const fetchCache: Map<string, CacheEntry> = (globalThis as unknown as { __nbaFetchCache?: Map<string, CacheEntry> })
  .__nbaFetchCache ?? new Map<string, CacheEntry>();
(globalThis as unknown as { __nbaFetchCache?: Map<string, CacheEntry> }).__nbaFetchCache = fetchCache;

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function nbaJson(url: string, opts?: { cacheKey?: string; ttlMs?: number; retries?: number }): Promise<NbaApiEnvelope> {
  const cacheKey = opts?.cacheKey ?? url;
  const ttlMs = opts?.ttlMs ?? CACHE_TTL_MS;

  const now = Date.now();
  const hit = fetchCache.get(cacheKey);
  if (hit && hit.exp > now) return hit.value as NbaApiEnvelope;

  const retries = opts?.retries ?? 2;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: nbaHeaders(), cache: 'no-store' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        // Retry on common transient statuses.
        if ([403, 429, 500, 502, 503].includes(res.status) && attempt < retries) {
          await sleep(350 * (attempt + 1));
          continue;
        }
        throw new Error(`NBA fetch failed ${res.status}: ${text.slice(0, 2000)}`);
      }

      const json = (await res.json()) as NbaApiEnvelope;
      fetchCache.set(cacheKey, { exp: now + ttlMs, value: json });
      return json;
    } catch (e: unknown) {
      lastErr = e;
      if (attempt < retries) {
        await sleep(350 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function rowsByHeaders(resultSet: ResultSet) {
  const headers = Array.isArray(resultSet?.headers) ? resultSet.headers : [];
  const rowSet = Array.isArray(resultSet?.rowSet) ? (resultSet.rowSet as unknown[][]) : [];
  const idx = (name: string) => headers.indexOf(name);
  return { headers, rowSet, idx };
}

function parseTeamGameLogRow(headers: string[], row: unknown[]): NbaGameResult {
  const idx = (name: string) => headers.indexOf(name);
  const s = (i: number) => String(row[i] ?? '');
  const n = (i: number) => Number(row[i] ?? 0);

  const gameId = idx('Game_ID') >= 0 ? s(idx('Game_ID')) : s(0);
  const gameDate = idx('GAME_DATE') >= 0 ? s(idx('GAME_DATE')) : s(1);
  const matchup = idx('MATCHUP') >= 0 ? s(idx('MATCHUP')) : s(2);
  const wl = idx('WL') >= 0 ? s(idx('WL')) : s(3);
  const pts = idx('PTS') >= 0 ? n(idx('PTS')) : n(row.length - 1);

  return {
    gameId,
    gameDate,
    matchup,
    wl,
    pts,
    oppPts: 0,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date'); // YYYY-MM-DD
  const home = searchParams.get('home'); // team name (from polymarket)
  const away = searchParams.get('away');

  if (!date || !home || !away) {
    return NextResponse.json(
      { error: 'Missing params: date=YYYY-MM-DD&home=...&away=...' },
      { status: 400 }
    );
  }

  const season = searchParams.get('season') || currentSeasonLabel();
  const seasonType = searchParams.get('seasonType') || 'Regular Season';

  try {
    // 1) Use scoreboardV2 on that date to map team names -> teamIds.
    const mmddyyyy = toNbaMmDdYyyy(date);
    const scoreboardUrl = new URL('https://stats.nba.com/stats/scoreboardv2');
    scoreboardUrl.searchParams.set('GameDate', mmddyyyy);
    scoreboardUrl.searchParams.set('LeagueID', '00');
    scoreboardUrl.searchParams.set('DayOffset', '0');

    const scoreboard = await nbaJson(scoreboardUrl.toString(), {
      cacheKey: `scoreboard:${date}`,
      ttlMs: 60_000,
      retries: 3,
    });
    const resultSets = Array.isArray(scoreboard?.resultSets) ? scoreboard.resultSets : [];

    const teamsRs = resultSets.find((r) => r?.name === 'TeamStats');

    let allTeams: NbaTeamInfo[] = [];

    if (teamsRs) {
      const teams = rowsByHeaders(teamsRs);
      const teamRowToInfo = (row: unknown[]): NbaTeamInfo => {
        const teamId = Number(row[teams.idx('TEAM_ID')] ?? 0);
        const abbr = String(row[teams.idx('TEAM_ABBREVIATION')] ?? '');
        const name = String(row[teams.idx('TEAM_NAME')] ?? '');
        return { teamId, abbr, name };
      };
      allTeams = teams.rowSet.map(teamRowToInfo);
    } else {
      // Fallback (A -> B):
      // A) try CDN liveData scoreboard (may be blocked in some environments)
      // B) parse nba.com/games __NEXT_DATA__ (usually more accessible)

      const byId = new Map<number, NbaTeamInfo>();

      // A)
      try {
        const ymd = toYyyyMmDdCompact(date);
        const cdnUrl = `https://cdn.nba.com/static/json/liveData/scoreboard/scoreboard_${ymd}.json`;
        const alt = await nbaJson(cdnUrl, { cacheKey: `cdnScoreboard:${date}`, ttlMs: 60_000, retries: 2 });

        const scoreboardObj = (alt as unknown as { scoreboard?: { games?: unknown[] } }).scoreboard;
        const gamesAlt = Array.isArray(scoreboardObj?.games)
          ? (scoreboardObj?.games as Array<Record<string, unknown>>)
          : [];

        for (const g of gamesAlt) {
          for (const side of ['homeTeam', 'awayTeam'] as const) {
            const t = (g?.[side] || {}) as Record<string, unknown>;
            const teamId = Number(t['teamId'] ?? 0);
            const abbr = String(t['teamTricode'] ?? '');
            const name = String(t['teamName'] ?? '');
            if (teamId) byId.set(teamId, { teamId, abbr, name });
          }
        }
      } catch {
        // ignore and try B
      }

      // B)
      if (byId.size === 0) {
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
          return NextResponse.json(
            { error: 'NBA games page parse failed: missing __NEXT_DATA__' },
            { status: 502 }
          );
        }

        let nextData: unknown;
        try {
          nextData = JSON.parse(m[1]);
        } catch {
          return NextResponse.json(
            { error: 'NBA games page parse failed: invalid __NEXT_DATA__ json' },
            { status: 502 }
          );
        }

        const get = (o: unknown, k: string): unknown =>
          o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined;

        const props = get(nextData, 'props');
        const pageProps = get(props, 'pageProps');
        const gameCardFeed = get(pageProps, 'gameCardFeed');
        const modules = get(gameCardFeed, 'modules');
        const firstModule = Array.isArray(modules) ? (modules[0] as unknown) : undefined;
        const cards = get(firstModule, 'cards');

        if (Array.isArray(cards)) {
          for (const c of cards as Array<Record<string, unknown>>) {
            const cardData = (c['cardData'] || {}) as Record<string, unknown>;
            for (const side of ['homeTeam', 'awayTeam'] as const) {
              const t = (cardData?.[side] || {}) as Record<string, unknown>;
              const teamId = Number(t['teamId'] ?? 0);
              const abbr = String(t['teamTricode'] ?? '');
              const name = String(t['teamName'] ?? '');
              if (teamId) byId.set(teamId, { teamId, abbr, name });
            }
          }
        }
      }

      allTeams = Array.from(byId.values());

      if (allTeams.length === 0) {
        return NextResponse.json(
          { error: 'Unexpected NBA scoreboard response (missing TeamStats; fallbacks A/B empty)' },
          { status: 502 }
        );
      }
    }

    const lc = (s: string) => s.toLowerCase();

    const findTeam = (needle: string) => {
      const n = lc(needle);
      // Use a stable static map; scoreboard/team feeds can vary and cause mismatches.
      const pool = NBA_TEAMS;
      return (
        pool.find((t) => lc(t.name) === n) ||
        pool.find((t) => n.includes(lc(t.name))) ||
        pool.find((t) => lc(t.name).includes(n)) ||
        // also match by abbreviation if user passes it
        pool.find((t) => lc(t.abbr) === n) ||
        pool[0]
      );
    };

    const homeTeam = findTeam(home);
    const awayTeam = findTeam(away);

    // 2) Head-to-head (current season): leaguegamefinder with TeamID + VsTeamID.
    const leagueGameFinderUrl = new URL('https://stats.nba.com/stats/leaguegamefinder');
    leagueGameFinderUrl.searchParams.set('LeagueID', '00');
    leagueGameFinderUrl.searchParams.set('Season', season);
    leagueGameFinderUrl.searchParams.set('SeasonType', seasonType);
    leagueGameFinderUrl.searchParams.set('TeamID', String(homeTeam.teamId));
    leagueGameFinderUrl.searchParams.set('VsTeamID', String(awayTeam.teamId));

    const h2h = await nbaJson(leagueGameFinderUrl.toString(), {
      cacheKey: `h2h:${season}:${seasonType}:${homeTeam.teamId}:${awayTeam.teamId}`,
      ttlMs: 10 * 60_000,
      retries: 2,
    });
    const h2hRs = (Array.isArray(h2h?.resultSets) ? h2h.resultSets : [])[0];
    const h2hRows = h2hRs ? rowsByHeaders(h2hRs) : { headers: [], rowSet: [], idx: () => -1 };

    const idx = (name: string) => h2hRows.idx(name);
    const h2hGames: NbaGameResult[] = h2hRows.rowSet.slice(0, 10).map((row) => {
      const gameId = String(row[idx('GAME_ID')] ?? '');
      const gameDate = String(row[idx('GAME_DATE')] ?? '');
      const matchup = String(row[idx('MATCHUP')] ?? '');
      const wl = String(row[idx('WL')] ?? '');
      const pts = Number(row[idx('PTS')] ?? 0);
      return { gameId, gameDate, matchup, wl, pts, oppPts: 0 };
    });

    const homeWins = h2hGames.filter((g) => g.wl === 'W').length;
    const awayWins = h2hGames.filter((g) => g.wl === 'L').length;

    // 3) Recent form: teamgamelog last 5.
    const teamGameLog = async (teamId: number) => {
      const url = new URL('https://stats.nba.com/stats/teamgamelog');
      url.searchParams.set('TeamID', String(teamId));
      url.searchParams.set('Season', season);
      url.searchParams.set('SeasonType', seasonType);
      const json = await nbaJson(url.toString(), {
        cacheKey: `teamgamelog:${season}:${seasonType}:${teamId}`,
        ttlMs: 10 * 60_000,
        retries: 2,
      });
      const rs = (Array.isArray(json?.resultSets) ? json.resultSets : [])[0];
      const { headers, rowSet } = rs ? rowsByHeaders(rs) : { headers: [] as string[], rowSet: [] as unknown[][] };
      return rowSet.slice(0, 5).map((r) => parseTeamGameLogRow(headers, r));
    };

    const [homeLast5, awayLast5] = await Promise.all([
      teamGameLog(homeTeam.teamId),
      teamGameLog(awayTeam.teamId),
    ]);

    const payload: NbaMatchupData = {
      date,
      season,
      seasonType,
      home: homeTeam,
      away: awayTeam,
      headToHead: {
        totalGames: h2hGames.length,
        homeWins,
        awayWins,
        games: h2hGames,
      },
      recentForm: { homeLast5, awayLast5 },
    };

    return NextResponse.json(payload);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: 'NBA proxy error', detail: msg }, { status: 502 });
  }
}
