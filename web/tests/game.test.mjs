import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { Database } from "bun:sqlite";
import {
  deletePlayerData,
  loadGame,
  markShared,
  submitPick,
} from "../lib/game";

class D1Statement {
  constructor(database, query, bindings = []) {
    this.database = database;
    this.query = query;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new D1Statement(this.database, this.query, bindings);
  }

  async all() {
    const results = this.database.query(this.query).all(...this.bindings);
    return { results, success: true, meta: { changes: 0 } };
  }

  async raw() {
    const { results } = await this.all();
    return results.map((row) => Object.values(row));
  }

  async run() {
    const result = this.database.query(this.query).run(...this.bindings);
    return {
      results: [],
      success: true,
      meta: { changes: result.changes, last_row_id: result.lastInsertRowid },
    };
  }

  async executeForBatch() {
    return /^\s*(SELECT|PRAGMA)\b/i.test(this.query) ? this.all() : this.run();
  }
}

class TestD1Database {
  constructor() {
    this.database = new Database(":memory:");
  }

  prepare(query) {
    return new D1Statement(this.database, query);
  }

  async batch(statements) {
    this.database.run("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.executeForBatch());
      this.database.run("COMMIT");
      return results;
    } catch (error) {
      this.database.run("ROLLBACK");
      throw error;
    }
  }

  exec(query) {
    this.database.exec(query);
  }

  rows(query, ...bindings) {
    return this.database.query(query).all(...bindings);
  }
}

async function migratedDatabase() {
  const database = new TestD1Database();
  const migrations = [
    "../drizzle/0000_fearless_colleen_wing.sql",
    "../drizzle/0001_odd_nebula.sql",
  ];
  for (const migration of migrations) {
    database.exec(await readFile(new URL(migration, import.meta.url), "utf8"));
  }
  return database;
}

function dependencies(database) {
  return {
    database,
    cookieSecret: "test-player-cookie-secret-0123456789abcdef",
  };
}

function submission(endpoint, cookie, card, elapsedMs) {
  return new Request(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      Origin: new URL(endpoint).origin,
    },
    body: JSON.stringify({ card, elapsedMs }),
  });
}

test("submit-and-reveal stores one vote, restores it, and deletes player data", async () => {
  const database = await migratedDatabase();
  const runtime = dependencies(database);
  const endpoint = "https://p1p1.test/api/puzzles/2026-08-22";

  const initial = await loadGame(new Request(endpoint), "2026-08-22", runtime);
  expect(initial.status).toBe(200);
  const initialBody = await initial.json();
  expect(initialBody.selectedCard).toBeNull();
  expect(initialBody.reveal).toBeNull();
  expect("answer" in initialBody.puzzle).toBe(false);
  expect("arenaShare" in initialBody.puzzle.cards[0]).toBe(false);
  const cookie = initial.headers.get("set-cookie")?.split(";", 1)[0];
  expect(cookie).toBeTruthy();

  const first = await submitPick(
    submission(endpoint, cookie, "Acererak the Archlich", 4321),
    "2026-08-22",
    runtime,
  );
  expect(first.status).toBe(201);
  const firstBody = await first.json();
  expect(firstBody.selectedCard).toBe("Acererak the Archlich");
  expect(firstBody.reveal.siteTotal).toBe(1);
  expect(firstBody.reveal.favoriteStreak).toBe(1);

  const duplicate = await submitPick(
    submission(endpoint, cookie, "Grazilaxx, Illithid Scholar", 9999),
    "2026-08-22",
    runtime,
  );
  expect(duplicate.status).toBe(200);
  const duplicateBody = await duplicate.json();
  expect(duplicateBody.selectedCard).toBe("Acererak the Archlich");
  expect(duplicateBody.reveal.siteTotal).toBe(1);

  const restored = await loadGame(
    new Request(endpoint, { headers: { Cookie: cookie } }),
    "2026-08-22",
    runtime,
  );
  expect(restored.status).toBe(200);
  expect((await restored.json()).selectedCard).toBe("Acererak the Archlich");
  expect(database.rows("SELECT card, elapsed_ms FROM vote")).toEqual([
    { card: "Acererak the Archlich", elapsed_ms: 4321 },
  ]);
  expect(database.rows("SELECT card, n FROM tally")).toEqual([
    { card: "Acererak the Archlich", n: 1 },
  ]);

  const shared = await markShared(
    new Request(`https://p1p1.test/api/share/2026-08-22`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: "https://p1p1.test" },
    }),
    "2026-08-22",
    runtime,
  );
  expect(shared.status).toBe(204);
  expect(database.rows("SELECT shared_at FROM vote")[0].shared_at).toBeTruthy();

  const deleted = await deletePlayerData(
    new Request("https://p1p1.test/api/player", {
      method: "DELETE",
      headers: { Cookie: cookie },
    }),
    runtime,
  );
  expect(deleted.status).toBe(204);
  expect(deleted.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(database.rows("SELECT * FROM vote")).toEqual([]);
  expect(database.rows("SELECT * FROM tally")).toEqual([]);
});

test("submission rejects cross-origin and invalid timing data", async () => {
  const database = await migratedDatabase();
  const runtime = dependencies(database);
  const endpoint = "https://p1p1.test/api/puzzles/2026-08-22";

  const crossOrigin = await submitPick(
    new Request(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://attacker.test" },
      body: JSON.stringify({ card: "Acererak the Archlich", elapsedMs: 10 }),
    }),
    "2026-08-22",
    runtime,
  );
  expect(crossOrigin.status).toBe(403);

  const invalidTiming = await submitPick(
    new Request(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: "https://p1p1.test" },
      body: JSON.stringify({ card: "Acererak the Archlich", elapsedMs: -1 }),
    }),
    "2026-08-22",
    runtime,
  );
  expect(invalidTiming.status).toBe(400);
  expect(database.rows("SELECT * FROM vote")).toEqual([]);
});
