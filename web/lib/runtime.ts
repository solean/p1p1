import { env } from "cloudflare:workers";
import type { GameDependencies } from "@/lib/game";

type RuntimeEnv = {
  DB?: D1Database;
  PLAYER_COOKIE_SECRET?: string;
};

export function gameDependencies(): GameDependencies {
  const runtime = env as RuntimeEnv;
  if (!runtime.DB) {
    throw new Error(
      "Cloudflare D1 binding `DB` is unavailable. Bind a D1 database before using the production game.",
    );
  }
  if (!runtime.PLAYER_COOKIE_SECRET || runtime.PLAYER_COOKIE_SECRET.length < 32) {
    throw new Error("PLAYER_COOKIE_SECRET must contain at least 32 characters");
  }
  return {
    database: runtime.DB,
    cookieSecret: runtime.PLAYER_COOKIE_SECRET,
  };
}
