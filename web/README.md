# P1P1 web app

The production daily game serves one immutable scheduled pack per UTC day. A
player gets a signed anonymous browser cookie, can submit one pick per day, and
then sees:

- the fitted 17Lands Arena pick split and rank;
- the live P1P1 site split with its exact sample size;
- 17Lands games-in-hand win rates;
- a matched-the-Arena-favourite streak.

Puzzle content is bundled from `../content/schedule.json`; only votes and
aggregate tallies live in Cloudflare D1. Card images are proxied through the app
and transformed by Cloudflare Images.

## Run locally

Requires Bun and Node.js `>=22.13.0`.

```bash
bun install
bun run db:migrate:local
export PLAYER_COOKIE_SECRET="$(openssl rand -hex 32)"
bun run dev
```

`db:migrate:local` is idempotent and applies `drizzle/*.sql` to the same
project-local Miniflare state used by the development server.

## Verify

```bash
bun run test
bun run lint
bunx tsc --noEmit
```

The test command builds the production Worker, server-renders the real current
pack, and exercises vote insertion, duplicate prevention, reveal restoration,
sharing metrics, and player-data deletion against an isolated SQLite-backed D1
adapter.

## Content

From the repository root:

```bash
p1p1 schedule
```

This consumes every available `out/queue.<SET>.json`, interleaves sets, dedupes
pack IDs and top-two matchups globally, and appends UTC-dated entries without
changing previously scheduled days.

## Deploy

The Sites declaration is `.openai/hosting.json`. Production requires:

- D1 binding `DB`, with the generated `drizzle/*.sql` migrations applied;
- Cloudflare Images binding `IMAGES`;
- a secret `PLAYER_COOKIE_SECRET` containing at least 32 characters.

Do not commit the cookie secret. `vite.config.ts` only forwards it to local
Miniflare when it is present in the process environment.

Draft data: [17Lands public datasets](https://www.17lands.com/public_datasets),
CC BY 4.0. Card data and images: [Scryfall](https://scryfall.com). P1P1 is
unofficial Fan Content and is not approved or endorsed by Wizards of the Coast.
