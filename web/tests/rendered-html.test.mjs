import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the playable P1P1 pack without leaking the reveal", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>P1P1 — One pack\. One pick\.<\/title>/i);
  assert.match(html, /What’s your first pick\?/);
  assert.match(html, /Choose There and Back Again/);
  assert.match(html, /Choose Nazgûl/);
  assert.match(html, /Choose Fear, Fire, Foes!/);
  assert.match(html, /17Lands/);
  assert.match(html, /Scryfall/);
  assert.doesNotMatch(html, /modelled share/i);
  assert.doesNotMatch(html, /Arena #1/);
  assert.doesNotMatch(html, /codex-preview|SkeletonPreview|react-loading-skeleton/i);
});

test("contains one locked-choice interaction and all fourteen cards", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const cardEntries = page.match(/name: "/g) ?? [];

  assert.equal(cardEntries.length, 14);
  assert.match(page, /if \(!revealed\) \{[\s\S]*?setSelected\(card\.name\);/);
  assert.match(page, /disabled=\{revealed\}/);
  assert.match(page, /aria-live="polite"/);
  assert.match(page, /percentage < 0\.1 \? "<0\.1%"/);
  assert.match(page, /card\.share < 0\.05/);
});

test("sorts the reveal by pick share with a reduced-motion-safe layout animation", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");

  assert.match(page, /const SORTED_CARDS = \[\.\.\.CARDS\]\.sort\(\(a, b\) => b\.share - a\.share\)/);
  assert.match(page, /const displayedCards = revealed \? SORTED_CARDS : CARDS/);
  assert.match(page, /cardPositions\.current = new Map/);
  assert.match(page, /element\.animate\(/);
  assert.match(page, /prefers-reduced-motion: reduce/);
  assert.match(page, /Cards ranked by modelled pick share/);
});
