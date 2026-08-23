import { and, desc, eq, lte } from "drizzle-orm";
import { getDb } from "@/db";
import { tallies, votes } from "@/db/schema";
import { clearPlayerCookie, playerIdentity } from "@/lib/player";
import {
  getScheduledDay,
  previousUtcDate,
  publicPuzzle,
  type PublicPuzzle,
  type ScheduledDay,
  utcDate,
} from "@/lib/schedule";

export type Reveal = {
  cards: Array<{
    name: string;
    arenaShare: number;
    winRate: number | null;
    siteVotes: number;
    siteShare: number;
  }>;
  arenaFavorite: string;
  bestWinRate: string | null;
  siteTotal: number;
  why: string;
  favoriteStreak: number;
};

export type GameState = {
  puzzle: PublicPuzzle;
  selectedCard: string | null;
  reveal: Reveal | null;
};

export type GameDependencies = {
  database: D1Database;
  cookieSecret: string;
};

async function favoriteStreak(
  database: D1Database,
  playerId: string,
  day: ScheduledDay,
  selectedCard: string,
): Promise<number> {
  if (selectedCard !== day.answer) return 0;

  const rows = await getDb(database)
    .select({ day: votes.day, card: votes.card })
    .from(votes)
    .where(and(eq(votes.playerId, playerId), lte(votes.day, day.date)))
    .orderBy(desc(votes.day));
  const voteByDay: Record<string, string> = Object.fromEntries(
    rows.map((row) => [row.day, row.card]),
  );

  let cursor = day.date;
  let streak = 0;
  while (true) {
    const scheduled = getScheduledDay(cursor);
    if (!scheduled || voteByDay[cursor] !== scheduled.answer) break;
    streak += 1;
    cursor = previousUtcDate(cursor);
  }
  return streak;
}

async function revealFor(
  database: D1Database,
  day: ScheduledDay,
  playerId: string,
  selectedCard: string,
): Promise<Reveal> {
  const rows = await getDb(database)
    .select({ card: tallies.card, n: tallies.n })
    .from(tallies)
    .where(eq(tallies.day, day.date));
  const tallyByCard: Record<string, number> = Object.fromEntries(
    rows.map((row) => [row.card, row.n]),
  );
  const siteTotal = rows.reduce((sum, row) => sum + row.n, 0);

  return {
    cards: day.cards.map((card) => {
      const siteVotes = tallyByCard[card.name] ?? 0;
      return {
        name: card.name,
        arenaShare: card.arena_share,
        winRate: card.win_rate,
        siteVotes,
        siteShare: siteTotal === 0 ? 0 : siteVotes / siteTotal,
      };
    }),
    arenaFavorite: day.answer,
    bestWinRate: day.best_win_rate,
    siteTotal,
    why: day.why,
    favoriteStreak: await favoriteStreak(database, playerId, day, selectedCard),
  };
}

function availablePuzzle(day: string): ScheduledDay | undefined {
  if (day > utcDate()) return undefined;
  return getScheduledDay(day);
}

function gameResponse(
  state: GameState | { error: string },
  status: number,
  setCookie?: string,
): Response {
  const headers = new Headers({ "Cache-Control": "no-store" });
  if (setCookie) headers.set("Set-Cookie", setCookie);
  return Response.json(state, { status, headers });
}

export async function loadGame(
  request: Request,
  date: string,
  dependencies: GameDependencies,
): Promise<Response> {
  const day = availablePuzzle(date);
  if (!day) return gameResponse({ error: "Puzzle not found" }, 404);

  const player = await playerIdentity(request, dependencies.cookieSecret);
  const [existing] = await getDb(dependencies.database)
    .select({ card: votes.card })
    .from(votes)
    .where(and(eq(votes.day, day.date), eq(votes.playerId, player.id)))
    .limit(1);

  const reveal = existing
    ? await revealFor(dependencies.database, day, player.id, existing.card)
    : null;
  return gameResponse(
    {
      puzzle: publicPuzzle(day),
      selectedCard: existing?.card ?? null,
      reveal,
    },
    200,
    player.setCookie,
  );
}

export async function submitPick(
  request: Request,
  date: string,
  dependencies: GameDependencies,
): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return gameResponse({ error: "Cross-origin submissions are not allowed" }, 403);
  }

  const day = availablePuzzle(date);
  if (!day) return gameResponse({ error: "Puzzle not found" }, 404);

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return gameResponse({ error: "Expected a JSON request body" }, 400);
  }
  const card =
    typeof payload === "object" && payload !== null && "card" in payload
      ? payload.card
      : undefined;
  const elapsedMs =
    typeof payload === "object" && payload !== null && "elapsedMs" in payload
      ? payload.elapsedMs
      : undefined;
  if (typeof card !== "string" || !day.cards.some((candidate) => candidate.name === card)) {
    return gameResponse({ error: "Card is not in this pack" }, 400);
  }
  if (
    typeof elapsedMs !== "number" ||
    !Number.isSafeInteger(elapsedMs) ||
    elapsedMs < 0 ||
    elapsedMs > 86_400_000
  ) {
    return gameResponse({ error: "Answer time is invalid" }, 400);
  }

  const player = await playerIdentity(request, dependencies.cookieSecret);
  const database = dependencies.database;
  const results = await database.batch([
    database
      .prepare(
        "INSERT INTO vote (day, player_id, card, elapsed_ms) VALUES (?1, ?2, ?3, ?4) " +
          "ON CONFLICT(day, player_id) DO NOTHING",
      )
      .bind(day.date, player.id, card, elapsedMs),
    database
      .prepare(
        "INSERT INTO tally (day, card, n) " +
          "SELECT ?1, ?2, 1 WHERE changes() = 1 " +
          "ON CONFLICT(day, card) DO UPDATE SET n = n + 1",
      )
      .bind(day.date, card),
    database
      .prepare("SELECT card FROM vote WHERE day = ?1 AND player_id = ?2")
      .bind(day.date, player.id),
  ]);
  const stored = results[2].results[0];
  if (
    !stored ||
    typeof stored !== "object" ||
    !("card" in stored) ||
    typeof stored.card !== "string"
  ) {
    throw new Error("Vote transaction completed without a stored vote");
  }
  const storedCard = stored.card;

  return gameResponse(
    {
      puzzle: publicPuzzle(day),
      selectedCard: storedCard,
      reveal: await revealFor(database, day, player.id, storedCard),
    },
    results[0].meta.changes === 1 ? 201 : 200,
    player.setCookie,
  );
}

export async function markShared(
  request: Request,
  date: string,
  dependencies: GameDependencies,
): Promise<Response> {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return gameResponse({ error: "Cross-origin submissions are not allowed" }, 403);
  }

  const day = availablePuzzle(date);
  if (!day) return gameResponse({ error: "Puzzle not found" }, 404);

  const player = await playerIdentity(request, dependencies.cookieSecret);
  const result = await dependencies.database
    .prepare(
      "UPDATE vote SET shared_at = COALESCE(shared_at, CURRENT_TIMESTAMP) " +
        "WHERE day = ?1 AND player_id = ?2",
    )
    .bind(day.date, player.id)
    .run();
  if (result.meta.changes === 0) {
    return gameResponse({ error: "Submit a pick before sharing" }, 409);
  }
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function deletePlayerData(
  request: Request,
  dependencies: GameDependencies,
): Promise<Response> {
  const player = await playerIdentity(request, dependencies.cookieSecret);
  const database = dependencies.database;
  await database.batch([
    database
      .prepare(
        "UPDATE tally SET n = n - 1 WHERE EXISTS (" +
          "SELECT 1 FROM vote " +
          "WHERE vote.player_id = ?1 " +
          "AND vote.day = tally.day AND vote.card = tally.card" +
          ")",
      )
      .bind(player.id),
    database.prepare("DELETE FROM vote WHERE player_id = ?1").bind(player.id),
    database.prepare("DELETE FROM tally WHERE n = 0"),
  ]);
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Set-Cookie": clearPlayerCookie(request),
    },
  });
}
