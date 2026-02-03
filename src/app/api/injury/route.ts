import { NextResponse } from "next/server";
import { getInjuryReportWithCache } from "@/lib/injury";
import { summarizeInjuriesFromPdfText } from "@/lib/injuryParse";

export const runtime = "nodejs";

export async function GET() {
  const maxAgeMs = 60 * 60 * 1000; // 1 hour

  try {
    const { value, stale } = await getInjuryReportWithCache({
      maxAgeMs,
      lookbackSteps: 8, // 2h lookback @ 15m
      stepMinutes: 15,
    });

    const summary = summarizeInjuriesFromPdfText(value.pdfText);

    return NextResponse.json({
      ok: true,
      stale,
      fetchedAtMs: value.fetchedAtMs,
      sourceUrl: value.sourceUrl,
      reportLabel: value.reportLabel,
      summary,
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
