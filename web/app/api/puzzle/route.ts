import { loadGame, submitPick } from "@/lib/game";
import { gameDependencies } from "@/lib/runtime";
import { utcDate } from "@/lib/schedule";

function internalError(error: unknown): Response {
  console.error(error);
  return Response.json(
    { error: "The daily puzzle is temporarily unavailable" },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  try {
    return await loadGame(request, utcDate(), gameDependencies());
  } catch (error) {
    return internalError(error);
  }
}

export async function POST(request: Request) {
  try {
    return await submitPick(request, utcDate(), gameDependencies());
  } catch (error) {
    return internalError(error);
  }
}
