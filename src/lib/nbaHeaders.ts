export function nbaHeaders() {
  // stats.nba.com is picky; these headers help reduce 403s.
  // (Mostly mimicking nba.com web requests.)
  return {
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    Origin: 'https://www.nba.com',
    Referer: 'https://www.nba.com/',
    Connection: 'keep-alive',

    // Commonly required by stats.nba.com
    'x-nba-stats-origin': 'stats',
    'x-nba-stats-token': 'true',

    // Fetch metadata (helps sometimes)
    'Sec-Fetch-Site': 'same-site',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
  } as Record<string, string>;
}
