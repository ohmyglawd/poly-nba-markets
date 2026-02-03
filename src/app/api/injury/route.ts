import { NextResponse } from "next/server";
import { getInjuryReportWithCache } from "@/lib/injury";

export const runtime = "nodejs";

export async function GET() {
  const maxAgeMs = 60 * 60 * 1000; // 1 hour

  try {
    const { value, stale } = await getInjuryReportWithCache({
      maxAgeMs,
      lookbackSteps: 8, // 2h lookback @ 15m
      stepMinutes: 15,
    });

    return NextResponse.json({
      ok: true,
      stale,
      fetchedAtMs: value.fetchedAtMs,
      sourceUrl: value.sourceUrl,
      reportLabel: value.reportLabel,
      // For now return raw text; UI can derive per-game summaries.
      // If this gets large, we can switch to returning a parsed structure.
      pdfText: value.pdfText,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: String(e),
      },
      { status: 500 }
    );
  }
}
