# poly-nba

Next.js frontend that lists Polymarket NBA matchups by selected date and expands a matchup to show NBA official stats (via server-side proxy).

## Dev

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Notes
- Uses a server-side proxy for `stats.nba.com` to avoid CORS and to set required headers.
- Polymarket data currently uses the public Gamma endpoint (configurable).

## Env (optional)
- `POLYMARKET_GAMMA_BASE=https://gamma-api.polymarket.com`
