import { execFile, spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { resolve } from "node:path";
import { promisify } from "node:util";

const root = fileURLToPath(new URL("..", import.meta.url));
const wranglerDirectory = resolve(root, ".wrangler");
const configPath = resolve(wranglerDirectory, "local-d1.json");
const persistencePath =
  process.env.P1P1_D1_PERSIST_TO ?? resolve(wranglerDirectory, "state");

await mkdir(wranglerDirectory, { recursive: true });
await writeFile(
  configPath,
  JSON.stringify(
    {
      $schema: "../node_modules/wrangler/config-schema.json",
      name: "p1p1-local-db",
      compatibility_date: "2026-05-15",
      d1_databases: [
        {
          binding: "DB",
          database_name: "site-creator-d1",
          database_id: "00000000-0000-4000-8000-000000000000",
          migrations_dir: "../drizzle",
        },
      ],
    },
    null,
    2,
  ),
);
const executeFile = promisify(execFile);
const executeArguments = [
  "wrangler",
  "d1",
  "execute",
  "DB",
  "--local",
  "--persist-to",
  persistencePath,
  "--config",
  configPath,
];

async function executeLocal(command) {
  const { stdout } = await executeFile(
    "bunx",
    [...executeArguments, "--command", command, "--json"],
    { cwd: root, maxBuffer: 10 * 1024 * 1024 },
  );
  const [result] = JSON.parse(stdout);
  if (!result?.success) throw new Error("Wrangler could not inspect the local D1 database");
  return result.results ?? [];
}

const [schema] = await executeLocal(`
  SELECT
    COALESCE((
      SELECT group_concat(name, ',')
      FROM (SELECT name FROM pragma_table_info('tally') ORDER BY cid)
    ), '') AS tally_columns,
    COALESCE((
      SELECT group_concat(name, ',')
      FROM (SELECT name FROM pragma_table_info('tally') WHERE pk > 0 ORDER BY pk)
    ), '') AS tally_primary_key,
    COALESCE((
      SELECT group_concat(name, ',')
      FROM (SELECT name FROM pragma_table_info('vote') ORDER BY cid)
    ), '') AS vote_columns,
    COALESCE((
      SELECT group_concat(name, ',')
      FROM (SELECT name FROM pragma_table_info('vote') WHERE pk > 0 ORDER BY pk)
    ), '') AS vote_primary_key,
    COALESCE((
      SELECT group_concat(name, ',')
      FROM (SELECT name FROM pragma_index_info('vote_player_day_idx') ORDER BY seqno)
    ), '') AS vote_index_columns,
    EXISTS(
      SELECT 1 FROM sqlite_master
      WHERE type = 'table' AND name = 'd1_migrations'
    ) AS has_migration_ledger
`);

if (!schema) throw new Error("Wrangler returned no local D1 schema information");

const hasGameTables = schema.tally_columns !== "" || schema.vote_columns !== "";
if (hasGameTables) {
  const hasBaseSchema =
    schema.tally_columns === "day,card,n" &&
    schema.tally_primary_key === "day,card" &&
    schema.vote_primary_key === "day,player_id" &&
    schema.vote_index_columns === "player_id,day";
  const hasInitialVoteSchema =
    schema.vote_columns === "day,player_id,card,created_at";
  const hasCurrentVoteSchema =
    schema.vote_columns === "day,player_id,card,created_at,elapsed_ms,shared_at";

  if (!hasBaseSchema || (!hasInitialVoteSchema && !hasCurrentVoteSchema)) {
    throw new Error(
      "Local D1 already contains vote/tally tables with an unexpected schema. " +
        "Refusing to alter or discard local data.",
    );
  }

  const applied = new Set(
    schema.has_migration_ledger
      ? (await executeLocal("SELECT name FROM d1_migrations")).map((row) => row.name)
      : [],
  );
  if (applied.has("0001_odd_nebula.sql") && !hasCurrentVoteSchema) {
    throw new Error(
      "Local D1 records migration 0001, but its vote table is missing metric columns.",
    );
  }

  const baseline = [];
  if (!applied.has("0000_fearless_colleen_wing.sql")) {
    baseline.push("0000_fearless_colleen_wing.sql");
  }
  if (hasCurrentVoteSchema && !applied.has("0001_odd_nebula.sql")) {
    baseline.push("0001_odd_nebula.sql");
  }

  if (baseline.length > 0) {
    const statements = [
      "CREATE TABLE IF NOT EXISTS d1_migrations (" +
        "id INTEGER PRIMARY KEY AUTOINCREMENT, " +
        "name TEXT UNIQUE, " +
        "applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL" +
        ")",
      ...baseline.map(
        (name) => `INSERT OR IGNORE INTO d1_migrations (name) VALUES ('${name}')`,
      ),
    ];
    await executeLocal(`${statements.join("; ")};`);
    console.log(`Baselined existing local schema: ${baseline.join(", ")}`);
  }
}

const child = spawn(
  "bunx",
  [
    "wrangler",
    "d1",
    "migrations",
    "apply",
    "DB",
    "--local",
    "--persist-to",
    persistencePath,
    "--config",
    configPath,
  ],
  { cwd: root, stdio: "inherit" },
);

const exitCode = await new Promise((resolveExit, reject) => {
  child.once("error", reject);
  child.once("exit", (code, signal) => {
    if (signal) reject(new Error(`Wrangler exited on signal ${signal}`));
    else resolveExit(code ?? 1);
  });
});
if (exitCode !== 0) process.exitCode = exitCode;
