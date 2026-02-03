export type InjuryStatus = "Out" | "Doubtful" | "Questionable" | "Probable";

export type TeamInjurySummary = {
  teamName: string;
  counts: Record<InjuryStatus, number>;
};

export type InjurySummary = {
  byTeamName: Record<string, TeamInjurySummary>;
};

const TEAM_TAILS = new Set([
  "Hawks",
  "Celtics",
  "Nets",
  "Hornets",
  "Bulls",
  "Cavaliers",
  "Mavericks",
  "Nuggets",
  "Pistons",
  "Warriors",
  "Rockets",
  "Pacers",
  "Clippers",
  "Lakers",
  "Grizzlies",
  "Heat",
  "Bucks",
  "Timberwolves",
  "Pelicans",
  "Knicks",
  "Thunder",
  "Magic",
  "Suns",
  "Spurs",
  "Raptors",
  "Jazz",
  "Wizards",
  "Kings",
  "Blazers",
  "76ers",
  "Sixers",
]);

export function summarizeInjuriesFromPdfText(pdfText: string): InjurySummary {
  const byTeamName: Record<string, TeamInjurySummary> = {};

  // Normalize the entire text to make tokenization reliable.
  // pdf-parse tends to smash words together.
  const normalized = normalizeForParsing(
    pdfText
      .replace(/\r?\n/g, " ")
      .replace(/InjuryReport:[^\s]+/g, " ")
      .replace(/Page\d+of\d+/g, " ")
      .replace(/GameDateGameTimeMatchupTeamPlayerNameCurrentStatusReason/g, " ")
  );

  const tokens = normalized.split(/\s+/).filter(Boolean);

  let currentTeamName: string | null = null;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    // Update team context when we see a plausible team tail.
    if (TEAM_TAILS.has(t)) {
      const name = buildTeamName(tokens, i);
      if (name) currentTeamName = name;
      continue;
    }

    // Count when we see a status token.
    if (isStatusToken(t) && currentTeamName) {
      bump(byTeamName, currentTeamName, t as InjuryStatus);
    }
  }

  return { byTeamName };
}

function buildTeamName(tokens: string[], tailIndex: number): string | null {
  const tail = tokens[tailIndex];

  // Look back up to 3 tokens to form City + Nickname (e.g. Los Angeles Lakers).
  const parts: string[] = [tail];
  for (let j = tailIndex - 1; j >= 0 && parts.length < 4; j--) {
    const tok = tokens[j];

    // Stop if we hit obvious non-team markers.
    if (/\d{2}\/\d{2}\/\d{4}/.test(tok)) break;
    if (/\d{1,2}:\d{2}\(ET\)/.test(tok)) break;
    if (/[A-Z]{2,3}@[A-Z]{2,3}/.test(tok)) break;
    if (tok.includes("/")) break; // Injury/Illness...
    if (tok === "GLeague" || tok === "Two-Way" || tok === "On" || tok === "Assignment") break;

    const low = tok.toLowerCase();
    if (
      low === "injury" ||
      low === "illness" ||
      low === "contusion" ||
      low === "fracture" ||
      low === "management" ||
      low === "injurymanagement" ||
      low === "recovery" ||
      low === "rest" ||
      low === "notyetsubmitted"
    ) {
      break;
    }

    // Stop on big ALLCAPS markers.
    if (tok === tok.toUpperCase() && tok.length >= 4) break;

    // Team/city tokens are typically alphabetic.
    if (!/^[A-Za-z]+$/.test(tok)) break;

    parts.unshift(tok);

    // Heuristic: once we have at least 2 words, accept.
    // (Special case: "76ers" is 1 token but already handled by tail alone.)
  }

  const name = parts.join(" ");

  // Validate: should end with a known tail.
  if (!TEAM_TAILS.has(parts[parts.length - 1])) return null;

  // Most teams are at least 2 words, except 76ers.
  if (name === "76ers") return "Philadelphia 76ers";
  if (parts.length < 2) return null;

  // Normalize Trail Blazers naming if it appears.
  if (/\bTrail\s+Blazers\b/.test(name) && !/\bPortland\b/.test(name)) {
    // Some PDFs might omit city; keep as-is.
    return name;
  }

  return name;
}

function bump(byTeamName: Record<string, TeamInjurySummary>, teamName: string, status: InjuryStatus) {
  if (!byTeamName[teamName]) {
    byTeamName[teamName] = {
      teamName,
      counts: {
        Out: 0,
        Doubtful: 0,
        Questionable: 0,
        Probable: 0,
      },
    };
  }
  byTeamName[teamName].counts[status]++;
}

function isStatusToken(t: string): boolean {
  return t === "Out" || t === "Doubtful" || t === "Questionable" || t === "Probable";
}

function normalizeForParsing(s: string): string {
  let x = s;

  // Separate matchup token
  x = x.replace(/([A-Z]{2,3}@[A-Z]{2,3})/g, " $1 ");

  // Separate known status words
  x = x.replace(/(Out|Doubtful|Questionable|Probable)/g, " $1 ");

  // Add space after comma for player tokens
  x = x.replace(/,/g, ", ");

  // Split some common smash boundaries
  x = x.replace(/\)(?=\w)/g, ") ");
  x = x.replace(/(?<=[a-z])(?=[A-Z])/g, " ");
  x = x.replace(/(?<=[A-Z])(?=[A-Z][a-z])/g, " ");
  x = x.replace(/(?<=[0-9])(?=[A-Za-z])/g, " ");

  x = x.replace(/\s+/g, " ").trim();
  return x;
}
