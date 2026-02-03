import pdf from "pdf-parse";

const ET_TZ = "America/New_York";

export type InjuryCacheValue = {
  fetchedAtMs: number;
  sourceUrl: string;
  reportLabel: string; // derived from filename (ET)
  pdfText: string;
};

let cache: InjuryCacheValue | null = null;
let inFlight: Promise<InjuryCacheValue> | null = null;

export function getCachedInjuryReport(maxAgeMs: number): InjuryCacheValue | null {
  if (!cache) return null;
  if (Date.now() - cache.fetchedAtMs <= maxAgeMs) return cache;
  return null;
}

export async function getInjuryReportWithCache(params: {
  maxAgeMs: number;
  lookbackSteps?: number; // 15-min steps
  stepMinutes?: number;
}): Promise<{ value: InjuryCacheValue; stale: boolean }>
{
  const { maxAgeMs } = params;
  const fresh = getCachedInjuryReport(maxAgeMs);
  if (fresh) return { value: fresh, stale: false };

  // If a refresh is already in progress, prefer returning stale cache if present.
  if (inFlight) {
    if (cache) return { value: cache, stale: true };
    const v = await inFlight;
    return { value: v, stale: false };
  }

  inFlight = (async () => {
    const v = await fetchLatestInjuryReport({
      lookbackSteps: params.lookbackSteps ?? 8,
      stepMinutes: params.stepMinutes ?? 15,
    });
    cache = v;
    return v;
  })();

  try {
    const v = await inFlight;
    return { value: v, stale: false };
  } finally {
    inFlight = null;
  }
}

export async function fetchLatestInjuryReport(params: {
  lookbackSteps: number;
  stepMinutes: number;
}): Promise<InjuryCacheValue> {
  const { lookbackSteps, stepMinutes } = params;

  const now = new Date();
  const candidates = buildCandidateUrls(now, lookbackSteps, stepMinutes);

  let lastErr: unknown = null;

  for (const c of candidates) {
    try {
      const ok = await urlExists(c.url);
      if (!ok) continue;

      const pdfBuf = await fetchPdf(c.url);
      const parsed = await pdf(pdfBuf);

      return {
        fetchedAtMs: Date.now(),
        sourceUrl: c.url,
        reportLabel: c.label,
        pdfText: parsed.text || "",
      };
    } catch (e) {
      lastErr = e;
      continue;
    }
  }

  throw new Error(
    `Failed to locate a recent NBA injury report PDF (checked ${candidates.length} candidates). Last error: ${String(
      lastErr
    )}`
  );
}

function buildCandidateUrls(now: Date, lookbackSteps: number, stepMinutes: number): Array<{ url: string; label: string }> {
  // Use Intl to format date/time in ET reliably.
  // We generate a series of timestamps rounded down to the nearest 15-min boundary (or stepMinutes).
  const out: Array<{ url: string; label: string }> = [];

  const dt = new Date(now.getTime());
  // Round down to the stepMinutes boundary in ET by iteratively stepping back and formatting.
  // We do an initial coarse rounding in UTC then correct by formatting in ET.
  // Pragmatically: generate N steps back and let formatting decide the filename.

  for (let i = 0; i <= lookbackSteps; i++) {
    const t = new Date(dt.getTime() - i * stepMinutes * 60_000);
    const { dateStr, hh12, mm, ampm } = formatEtFilenameParts(t);
    const url = `https://ak-static.cms.nba.com/referee/injury/Injury-Report_${dateStr}_${hh12}_${mm}${ampm}.pdf`;
    out.push({ url, label: `${dateStr} ${hh12}:${mm} ${ampm} ET` });
  }

  // De-dup in case formatting collides across steps
  const seen = new Set<string>();
  return out.filter((x) => {
    if (seen.has(x.url)) return false;
    seen.add(x.url);
    return true;
  });
}

function formatEtFilenameParts(d: Date): { dateStr: string; hh12: string; mm: string; ampm: "AM" | "PM" } {
  // en-CA gives YYYY-MM-DD.
  const dateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: ET_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ET_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  })
    .formatToParts(d)
    .reduce<Record<string, string>>((acc, p) => {
      if (p.type !== "literal") acc[p.type] = p.value;
      return acc;
    }, {});

  const hh = String(parts.hour ?? "12").padStart(2, "0");
  const mm = String(parts.minute ?? "00").padStart(2, "0");
  const ampm = (parts.dayPeriod ?? "AM").toUpperCase() as "AM" | "PM";

  return { dateStr, hh12: hh, mm, ampm };
}

async function urlExists(url: string): Promise<boolean> {
  // Prefer HEAD to save bandwidth; fallback to GET if blocked.
  const head = await fetch(url, { method: "HEAD", cache: "no-store" }).catch(() => null);
  if (head) return head.ok;

  const r = await fetch(url, { method: "GET", cache: "no-store" });
  return r.ok;
}

async function fetchPdf(url: string): Promise<Buffer> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Failed to fetch PDF: ${r.status} ${r.statusText}`);
  const ab = await r.arrayBuffer();
  return Buffer.from(ab);
}
