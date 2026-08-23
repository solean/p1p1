import assert from "node:assert/strict";
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

test("server-renders today's real pack without leaking the reveal", async () => {
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
  assert.match(html, /Choose Acererak the Archlich/);
  assert.match(html, /Choose Grazilaxx, Illithid Scholar/);
  assert.match(html, /Choose Shambling Ghast/);
  assert.match(html, /17Lands/);
  assert.match(html, /Scryfall/);
  assert.doesNotMatch(html, /49\.1% Arena share/i);
  assert.doesNotMatch(html, /Arena #1/);
});
