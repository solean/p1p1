import { loadGame, submitPick } from "@/lib/game";
import { gameDependencies } from "@/lib/runtime";

type RouteContext = {
  params: Promise<{ date: string }>;
};

function internalError(error: unknown): Response {
  console.error(error);
  return Response.json(
    { error: "The requested puzzle is temporarily unavailable" },
    { status: 500, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { date } = await context.params;
    return await loadGame(request, date, gameDependencies());
  } catch (error) {
    return internalError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { date } = await context.params;
    return await submitPick(request, date, gameDependencies());
  } catch (error) {
    return internalError(error);
  }
}
