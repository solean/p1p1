# P1P1 web prototype

Phase 1 of P1P1: one real *The Lord of the Rings: Tales of Middle-earth* pack,
one locked first pick, and an immediate reveal of the modelled Arena crowd
split. The fixture is embedded so the prototype has no backend or runtime data
dependency.

## Run locally

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

## Verify

```bash
npm test
npm run lint
```

The page is deployed through Sites using the project declaration in
`.openai/hosting.json`. D1 and R2 are intentionally disabled for this phase.
