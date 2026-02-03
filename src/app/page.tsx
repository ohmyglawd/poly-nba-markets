'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MatchupCard, NbaResolvedGame } from '@/lib/types';
import { toYyyyMmDd } from '@/lib/date';
import { groupByMarketType } from '@/lib/polymarket';

function cn(...xs: Array<string | false | undefined>) {
  return xs.filter(Boolean).join(' ');
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs text-emerald-200">
      {children}
    </span>
  );
}

function fmtCents(p?: number) {
  if (p == null || !Number.isFinite(p)) return '—';
  const c = p * 100;
  if (c < 1) return `${c.toFixed(1)}¢`;
  return `${Math.round(c)}¢`;
}

function fmtVal(v: unknown) {
  if (v == null) return '—';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '—';
  if (typeof v === 'string') return v;
  return '—';
}

export default function Home() {
  const today = useMemo(() => toYyyyMmDd(new Date()), []);
  const [date, setDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<MatchupCard[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [resolved, setResolved] = useState<Record<string, NbaResolvedGame | { error: string }>>({});
  const [charts, setCharts] = useState<Record<string, unknown>>({});

  async function load() {
    setLoading(true);
    setError(null);
    setOpenId(null);
    try {
      const tzOffset = new Date().getTimezoneOffset();
      const res = await fetch(
        `/api/polymarket?date=${encodeURIComponent(date)}&tzOffset=${encodeURIComponent(String(tzOffset))}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'failed');
      setItems(json.items || []);
    } catch (e: unknown) {
      setItems([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  async function ensureResolved(card: MatchupCard) {
    if (resolved[card.id]) return;
    try {
      const url = `/api/nba/resolve-game?date=${encodeURIComponent(date)}&home=${encodeURIComponent(
        card.homeTeam.name
      )}&away=${encodeURIComponent(card.awayTeam.name)}`;
      const res = await fetch(url);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.detail || json?.error || 'NBA resolve failed');
      setResolved((d) => ({ ...d, [card.id]: json }));

      // Auto-load charts if we got a gameId
      if (json?.gameId) await loadCharts(card.id, String(json.gameId));
    } catch (e: unknown) {
      setResolved((d) => ({
        ...d,
        [card.id]: { error: e instanceof Error ? e.message : String(e) },
      }));
    }
  }

  // Advanced stats removed (stats.nba.com is not reliable on Vercel)

  async function loadCharts(cardId: string, gameId: string) {
    const key = `${cardId}:${gameId}`;
    if (charts[key]) return;
    const res = await fetch(`/api/nba/game-charts?gameId=${encodeURIComponent(gameId)}`);
    const json = await res.json();
    setCharts((c) => ({ ...c, [key]: json }));
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <header className="mb-8 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">NBA Markets</h1>
              <p className="text-sm text-neutral-400">
                Polymarket-style matchup list · focus on Moneyline / Spread / Total
              </p>
            </div>
            <Pill>Robinhood-ish dark</Pill>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm text-neutral-300">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm"
            />
            <button
              onClick={load}
              className={cn(
                'rounded-md px-3 py-2 text-sm font-medium',
                'border border-emerald-500/30 bg-emerald-500/15 text-emerald-200',
                'hover:bg-emerald-500/20'
              )}
            >
              Refresh
            </button>
            {loading && <span className="text-sm text-neutral-500">Loading…</span>}
          </div>

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-200">
              {error}
            </div>
          )}
        </header>

        <section className="space-y-3">
          {items.length === 0 && !loading ? (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/30 p-6 text-neutral-400">
              No matchups found for this date (with current Polymarket adapter).
            </div>
          ) : null}

          {items.map((card) => {
            const isOpen = openId === card.id;
            const r = resolved[card.id];
            return (
              <div
                key={card.id}
                className="rounded-xl border border-neutral-800 bg-neutral-900/30 backdrop-blur"
              >
                <button
                  className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
                  onClick={async () => {
                    const next = isOpen ? null : card.id;
                    setOpenId(next);
                    if (next) await ensureResolved(card);
                  }}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold">
                        {card.awayTeam.name} @ {card.homeTeam.name}
                      </span>
                      <span className="text-xs text-neutral-500">NBA</span>
                    </div>
                    <div className="text-xs text-neutral-500">
                      {card.startTime ? new Date(card.startTime).toLocaleString() : 'Time TBD'}
                    </div>

                    <div className="mt-1 flex flex-wrap gap-2">
                      {card.markets
                        .filter((m) => m.type === 'moneyline' || m.type === 'spread' || m.type === 'total')
                        .slice(0, 3)
                        .map((m) => (
                          <span
                            key={m.id}
                            className="rounded-md border border-neutral-800 bg-neutral-950/40 px-2 py-1 text-[11px] text-neutral-300"
                          >
                            <span className="mr-2 text-neutral-500">
                              {m.type === 'moneyline' ? 'ML' : m.type === 'spread' ? 'SPRD' : 'TOTAL'}
                            </span>
                            <span className="tabular-nums">
                              {m.selections
                                .slice(0, 2)
                                .map((s) => `${s.label} ${fmtCents(s.priceYes)}`)
                                .join(' · ')}
                            </span>
                          </span>
                        ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {card.sourceUrl ? (
                      <a
                        className="text-xs text-emerald-300 hover:underline"
                        href={card.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        open market
                      </a>
                    ) : null}
                    <span className="text-neutral-500">{isOpen ? '▾' : '▸'}</span>
                  </div>
                </button>

                {isOpen ? (
                  <div className="border-t border-neutral-800 px-4 py-4">
                    {/* Markets (show even if NBA API blocks) */}
                    <div className="mb-4 rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="text-sm font-semibold">Markets</div>
                        <span className="text-xs text-neutral-500">{card.markets.length} markets</span>
                      </div>

                      <div className="grid gap-3 md:grid-cols-3">
                        {Object.entries(groupByMarketType(card.markets))
                          .sort((a, b) => b[1].length - a[1].length)
                          .slice(0, 6)
                          .map(([k, list]) => (
                            <div key={k} className="rounded-md border border-neutral-800 bg-neutral-900/30 p-3">
                              <div className="mb-2 flex items-center justify-between">
                                <div className="text-xs font-semibold text-neutral-300">{k}</div>
                                <span className="text-[11px] text-neutral-500">{list.length}</span>
                              </div>
                              <div className="space-y-2">
                                {list.slice(0, 3).map((m) => (
                                  <div key={m.id} className="rounded-md border border-neutral-800 bg-neutral-950/30 p-2">
                                    <div className="text-[11px] text-neutral-400 line-clamp-2">{m.title}</div>
                                    <div className="mt-1 flex flex-wrap gap-2">
                                      {m.selections.slice(0, 2).map((s) => (
                                        <div
                                          key={s.label}
                                          className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs"
                                        >
                                          <span className="text-neutral-200">{s.label}</span>
                                          <span className="tabular-nums text-emerald-200">{fmtCents(s.priceYes)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                                {list.length > 3 ? (
                                  <div className="text-[11px] text-neutral-500">+{list.length - 3} more</div>
                                ) : null}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>

                    {!r ? (
                      <div className="text-sm text-neutral-500">Resolving gameId…</div>
                    ) : 'error' in r ? (
                      <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                        {r.error}
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="rounded-lg border border-neutral-800 bg-neutral-950/40 p-4">
                          <div className="mb-2 flex items-center justify-between">
                            <div className="text-sm font-semibold">Game Charts (nba.com)</div>
                            {r.gameChartsUrl ? (
                              <a
                                className="text-xs text-emerald-300 hover:underline"
                                href={r.gameChartsUrl}
                                target="_blank"
                                rel="noreferrer"
                              >
                                open
                              </a>
                            ) : null}
                          </div>

                          {!r.gameId ? (
                            <div className="text-xs text-neutral-500">No gameId resolved for this matchup.</div>
                          ) : (
                            <div className="text-xs text-neutral-500">gameId: {r.gameId}</div>
                          )}

                          {r.gameId ? (() => {
                            const key = `${card.id}:${r.gameId}`;
                            type ChartsSummary = {
                              error?: string;
                              homeTeam?: {
                                teamTricode?: string;
                                score?: number;
                                seasonAveragesPerGame?: Record<string, unknown>;
                                leadingPlayers?: Record<string, unknown>;
                              };
                              awayTeam?: {
                                teamTricode?: string;
                                score?: number;
                                seasonAveragesPerGame?: Record<string, unknown>;
                                leadingPlayers?: Record<string, unknown>;
                              };
                            };
                            const ch = charts[key] as ChartsSummary | undefined;
                            if (!ch) {
                              return <div className="mt-3 text-xs text-neutral-500">Loading charts summary…</div>;
                            }
                            if (ch.error) {
                              return (
                                <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                                  {String(ch.error)}
                                </div>
                              );
                            }
                            const hs = (ch?.homeTeam?.seasonAveragesPerGame || {}) as Record<string, unknown>;
                            const as = (ch?.awayTeam?.seasonAveragesPerGame || {}) as Record<string, unknown>;
                            const hl = (ch?.homeTeam?.leadingPlayers || {}) as Record<string, unknown>;
                            const al = (ch?.awayTeam?.leadingPlayers || {}) as Record<string, unknown>;

                            type Leader = { name?: string; value?: number };
                            const getLeader = (o: Record<string, unknown>, k: string): Leader => {
                              const v = o[k];
                              if (!v || typeof v !== 'object') return {};
                              const r = v as Record<string, unknown>;
                              const name = typeof r.name === 'string' ? r.name : undefined;
                              const value = typeof r.value === 'number' ? r.value : undefined;
                              return { name, value };
                            };

                            const leaderLine = (x: Leader) =>
                              x.name ? `${x.name} ${x.value ?? ''}`.trim() : '—';

                            return (
                              <div className="mt-3 grid gap-3 md:grid-cols-2">
                                <div className="rounded-md border border-neutral-800 bg-neutral-900/30 p-3">
                                  <div className="mb-1 flex items-center justify-between">
                                    <div className="text-xs font-semibold text-neutral-300">
                                      {ch?.homeTeam?.teamTricode || 'HOME'}
                                    </div>
                                    <div className="text-xs text-neutral-500 tabular-nums">{fmtVal(ch?.homeTeam?.score)}</div>
                                  </div>
                                  <div className="text-[11px] text-neutral-500">Season averages / game</div>
                                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-neutral-300">
                                    <div>PTS</div><div className="tabular-nums">{fmtVal(hs.pts)}</div>
                                    <div>REB</div><div className="tabular-nums">{fmtVal(hs.reb)}</div>
                                    <div>AST</div><div className="tabular-nums">{fmtVal(hs.ast)}</div>
                                    <div>TOV</div><div className="tabular-nums">{fmtVal(hs.tov)}</div>
                                  </div>
                                  <div className="mt-3 text-[11px] text-neutral-500">Leading players</div>
                                  <div className="mt-1 grid grid-cols-2 gap-2 text-xs text-neutral-300">
                                    <div>PTS</div><div className="truncate">{leaderLine(getLeader(hl, 'pts'))}</div>
                                    <div>REB</div><div className="truncate">{leaderLine(getLeader(hl, 'reb'))}</div>
                                    <div>AST</div><div className="truncate">{leaderLine(getLeader(hl, 'ast'))}</div>
                                  </div>
                                </div>

                                <div className="rounded-md border border-neutral-800 bg-neutral-900/30 p-3">
                                  <div className="mb-1 flex items-center justify-between">
                                    <div className="text-xs font-semibold text-neutral-300">
                                      {ch?.awayTeam?.teamTricode || 'AWAY'}
                                    </div>
                                    <div className="text-xs text-neutral-500 tabular-nums">{fmtVal(ch?.awayTeam?.score)}</div>
                                  </div>
                                  <div className="text-[11px] text-neutral-500">Season averages / game</div>
                                  <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-neutral-300">
                                    <div>PTS</div><div className="tabular-nums">{fmtVal(as.pts)}</div>
                                    <div>REB</div><div className="tabular-nums">{fmtVal(as.reb)}</div>
                                    <div>AST</div><div className="tabular-nums">{fmtVal(as.ast)}</div>
                                    <div>TOV</div><div className="tabular-nums">{fmtVal(as.tov)}</div>
                                  </div>
                                  <div className="mt-3 text-[11px] text-neutral-500">Leading players</div>
                                  <div className="mt-1 grid grid-cols-2 gap-2 text-xs text-neutral-300">
                                    <div>PTS</div><div className="truncate">{leaderLine(getLeader(al, 'pts'))}</div>
                                    <div>REB</div><div className="truncate">{leaderLine(getLeader(al, 'reb'))}</div>
                                    <div>AST</div><div className="truncate">{leaderLine(getLeader(al, 'ast'))}</div>
                                  </div>
                                </div>
                              </div>
                            );
                          })() : null}
                        </div>

                        {/* Advanced stats removed */}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>

        <footer className="mt-10 text-xs text-neutral-600">
          Adapter status: Polymarket parsing is heuristic right now. Next step is to map markets to Moneyline/Spread/Total and show trading-like prices.
        </footer>
      </div>
    </main>
  );
}
