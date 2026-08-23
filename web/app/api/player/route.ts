import { deletePlayerData } from "@/lib/game";
import { gameDependencies } from "@/lib/runtime";

export async function DELETE(request: Request) {
  try {
    return await deletePlayerData(request, gameDependencies());
  } catch (error) {
    console.error(error);
    return Response.json(
      { error: "Player data could not be deleted" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
