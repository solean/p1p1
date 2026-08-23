import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function builtWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${Math.random()}`);
  return (await import(workerUrl.href)).default;
}

function executionContext() {
  return {
    waitUntil() {},
    passThroughOnException() {},
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

test("server-renders today's real pack without leaking the reveal", async () => {
  const schedule = JSON.parse(
    await readFile(new URL("../../content/schedule.json", import.meta.url), "utf8"),
  );
  const today = new Date().toISOString().slice(0, 10);
  const puzzle = schedule.days.find((day) => day.date === today);
  assert.ok(puzzle, `Missing scheduled puzzle for ${today}`);
  assert.equal(schedule.days.some((day) => day.set === "HBG"), false);

  const worker = await builtWorker();
  const response = await worker.fetch(
    new Request("https://p1p1.test/", { headers: { accept: "text/html" } }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    executionContext(),
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>P1P1 — One pack\. One pick\.<\/title>/i);
  assert.match(html, /What’s your first pick\?/);
  for (const card of puzzle.cards.slice(0, 3)) {
    assert.match(html, new RegExp(`Choose ${escapeRegExp(escapeHtml(card.name))}`));
  }
  assert.match(html, /17Lands/);
  assert.match(html, /Scryfall/);
  const favorite = puzzle.cards.find((card) => card.name === puzzle.answer);
  assert.ok(favorite);
  assert.doesNotMatch(
    html,
    new RegExp(`${(favorite.arena_share * 100).toFixed(1)}% Arena share`, "i"),
  );
  assert.doesNotMatch(html, /Arena #1/);
});
