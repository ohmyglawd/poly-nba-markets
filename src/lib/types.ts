export type MarketType = 'moneyline' | 'spread' | 'total' | 'unknown';

export type PolymarketSelection = {
  label: string;
  priceYes?: number; // 0..1
  priceNo?: number; // 0..1
};

export type PolymarketMarket = {
  id: string;
  type: MarketType;
  title: string;
  volume?: number;
  liquidity?: number;
  selections: PolymarketSelection[];
};

export type MatchupCard = {
  id: string;
  startTime?: string; // ISO
  league: 'NBA';
  awayTeam: { name: string; abbr?: string };
  homeTeam: { name: string; abbr?: string };
  markets: PolymarketMarket[];
  sourceUrl?: string;
};

export type NbaTeamInfo = {
  teamId: number;
  abbr: string;
  name: string;
};

export type NbaGameResult = {
  gameId: string;
  gameDate: string; // ISO-ish
  matchup: string;
  wl: 'W' | 'L' | string;
  pts: number;
  oppPts: number;
};

export type NbaResolvedGame = {
  date: string;
  home: NbaTeamInfo;
  away: NbaTeamInfo;
  gameId?: string;
  gameChartsUrl?: string;
};

export type NbaMatchupData = {
  date: string; // YYYY-MM-DD (local date from client)
  home: NbaTeamInfo;
  away: NbaTeamInfo;
  season: string;
  seasonType: string;
  headToHead: {
    totalGames: number;
    homeWins: number;
    awayWins: number;
    games: NbaGameResult[];
  };
  recentForm: {
    homeLast5: NbaGameResult[];
    awayLast5: NbaGameResult[];
  };
};
