import { markShared } from "@/lib/game";
import { gameDependencies } from "@/lib/runtime";

type RouteContext = {
  params: Promise<{ date: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { date } = await context.params;
    return await markShared(request, date, gameDependencies());
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Share could not be recorded" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
