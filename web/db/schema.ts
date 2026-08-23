import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const votes = sqliteTable(
  "vote",
  {
    day: text("day").notNull(),
    playerId: text("player_id").notNull(),
    card: text("card").notNull(),
    elapsedMs: integer("elapsed_ms").notNull(),
    sharedAt: text("shared_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.day, table.playerId] }),
    index("vote_player_day_idx").on(table.playerId, table.day),
  ],
);

export const tallies = sqliteTable(
  "tally",
  {
    day: text("day").notNull(),
    card: text("card").notNull(),
    n: integer("n").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.day, table.card] })],
);
