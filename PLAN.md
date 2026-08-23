# P1P1 — project plan

A daily Magic puzzle: one booster pack, one pick, twenty seconds. You choose,
then see how the crowd split.

Deliberately smaller than [8Pack](https://www.8pack.gg/), which runs eight picks
of a real draft. Going *smaller* than the incumbent is the wedge: one decision is
the Wordle shape — no commitment, one emoji-grid share, a habit slot rather than
a session.

---

## Status

| | |
| --- | --- |
| **Phase 0 — curation pipeline** | Done. See [README](README.md). |
| **Phase 1 — playable prototype** | Done. See [`web/`](web/). |
| **Phase 2 — real daily game** | Implemented in [`web/`](web/); launch configuration and product testing remain. |

Phase 0 answered the riskiest content question — *can you reliably produce first
picks people genuinely disagree about?* — and the answer is yes, with room to
spare:

* **~40% of real packs** clear the "contested" bar (13.9k of 36.3k in HBG, 24.9k
  of 60k in LTR).
* **All 32 Arena sets** are usable.
* At 90 packs per set that's **~2,900 daily puzzles, or 7.9 years** of content,
  and the eligible pool is an order of magnitude larger than that.

Content supply is not a risk. Everything below is about whether anyone plays.

---

## Locked decisions

**One pack, one pick, once a day.** Not a partial draft. The whole interaction
fits in a glance.

**Reset at UTC midnight.** One global puzzle means one tally row, one cache key,
and share text that cannot disagree between players in different timezones.
Local midnight is friendlier locally but would require per-timezone puzzle keys
and split tallies.

**Rotate across all Arena-drafted sets.** Nostalgia is a feature — an LTR or KTK
pack lands differently than the current Standard set. 32 sets is deep enough to
rotate for years without repeating.

**Packs are curated, not random.** A random P1P1 is usually boring: one obvious
bomb and the game is over. The pipeline generates thousands of candidates and
ranks them by predicted disagreement. Curation *is* the product.

**Percentile scoring, with a binary streak on top.** P1P1 is often genuinely
close between two or three cards; a bare right/wrong verdict feels arbitrary and
burns trust. Show "you picked the #2 card, 23% agreed." Keep a binary
matched-the-favourite streak for the Wordle habit loop.

**The Arena crowd is the immutable answer key.** Score percentiles and the
matched-the-favourite streak against the fitted 17Lands pick shares frozen with
the scheduled pack. After a player votes, show the site's live split beside the
Arena split with its exact sample size. Site votes never change that day's score
or streak. This avoids a cold start, moving outcomes, ballot-stuffing incentives,
and the feedback loop where players try to predict the site's previous players
instead of making their own draft pick.

**Players use anonymous browser identities.** The server issues a persistent,
signed random identifier in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie and
enforces one vote per `(day, player_id)`. No account, email, or fingerprinting is
required. Clearing the cookie starts a new identity; that is acceptable because
site votes cannot affect scores. Optional accounts can add cross-device streaks
later.

**The reveal carries the retention.** The input is a 20-second decision, so the
payoff has to be the reveal: crowd split across the pack, the win-rate-optimal
card next to it, and one line of *why*.

**The win-rate axis is GIH, and it never says "wrong".** Card strength comes from
the 17Lands game-data export: games won among games where the card was in hand,
cards under 200 such games left unrated. It replaced the mean event match wins of
everyone who first-picked a card, which was confounded by the drafter's whole
deck. The reveal prints the number and names the pack's best card; it does not
tell anyone their pick was incorrect. Shipped — see the reveal in [`web/`](web/).

---

## Open decision

### Where it lives

The app is currently an OpenAI Sites project (`web/.openai/hosting.json`). A
daily-habit product with share links and search traffic wants its own domain.
Decide before the first real user, because migrating URLs after people have
bookmarked and shared them costs more than moving now.

---

## Roadmap

### Phase 1 — playable prototype

Goal: find out whether the 20-second loop is actually fun. No backend.

Implemented in [`web/`](web/):

* Static page, one real pack hardcoded from `out/queue.LTR.json`.
* Click a card → locked pick and reveal with the modelled crowd split.
* Responsive, keyboard-accessible presentation of all 14 cards with source
  attribution and no pre-pick answer leakage.

The remaining work in this phase is product testing: does the reveal payoff make
people want tomorrow's pack?

Kill criterion: if the reveal feels flat with real data and real art, the concept
doesn't work and no amount of backend fixes it.

### Phase 2 — real daily game

The shape is a lookup, not a computation: immutable puzzle content ships in the
deploy bundle; only the site's own vote split is dynamic.

**2a. Content schedule — shipped.** `p1p1 schedule` consumes every
`out/queue.<SET>.json`, assigns a stable hash ID to each pack, interleaves sets,
dedupes pack IDs and top-two matchups globally, assigns UTC dates, and writes
`content/schedule.json`. Re-running appends without moving shipped days. The
artifact carries 17Lands/Scryfall attribution and a `why` field, and the web build
copies it into the deploy bundle.

Pipeline hardening still open: cache expensive artifacts by their inputs and
parameters, and replace persisted model pickles with a portable data format.

**2b. Service — shipped.** D1 stores one `vote` per `(day, player_id)` plus a
small `tally(day, card, n)` aggregate. The vote also records answer time and
whether the player shared. Public puzzle responses omit Arena shares until a
successful pick; submit-and-reveal, dated archive, image, social image, share,
and player-deletion routes use a signed anonymous browser identity. The D1
binding is `DB`; immutable puzzles never enter the database.

**2c. Client — shipped.** Today, archive, dated puzzle, loading, error, empty,
restored-pick, and reveal states use the generated schedule. All real pack cards
remain visible before picking. Card art is same-origin and cached through the
Worker/Cloudflare Images path. The reveal shows Arena and live site shares,
sample size, win rate, streak, explanation, and share result; answer timing starts
when the pack mounts. A privacy page exposes deletion of the anonymous identity
and its vote history.

**2d. Gates — shipped for the current contracts.** CI is configured to run Python tests, the
production web build, behavior-level vote/reveal persistence tests, lint, and
typecheck. Schedule tests cover stable IDs, interleaving, deterministic output,
append-only history, and conflict rejection. Bun is the only web lockfile.
Broader regression coverage for `ingest.extract` and scoring thresholds remains
pipeline hardening, not a launch-path dependency.

Scale is trivial — one insert per player per day, one aggregate per day.
Don't over-build this.

**Cut for v1:** personal stats, accounts, and every mode in "open questions for
later".

### Phase 3 — retention

* One-line "why" per puzzle. Hand-written, 90 at a time. It needs no code and
  blocks on nothing, so the writing can start today, in parallel with Phase 2 —
  and it is the highest-leverage writing in the product.
* Personal stats: agreement rate over time, which colors you overdraft.
* Archive as a habit surface rather than a route: streak repair, "you missed
  three days", play-past-days.

### Phase 4 — growth

The actual risk. See below.

---

## Risks

**Distribution, not technology.** 8Pack already occupies the daily-habit slot and
has its crowd flywheel spinning. Nothing here is hard to build; the hard part is
getting the first thousand people to come back on day two. Budget effort
accordingly — the pipeline took a day, distribution will take months.

**Beauty-contest degradation.** Covered above. Mitigated by scoring against the
Arena crowd rather than the site crowd.

**Answer leakage.** With one pick, the day's answer is trivially spoilable on
social. Wordle survived this; not worth engineering around.

**Set-data rot.** Five sets (`AFR, STX, TMT, ECL, TLA`) ship without a P1P1 row —
Arena only logs the opening pack after P1P2, and that back-fill is missing from
their exports. Ingest rebuilds the pack from the second-pick row's pool, so all
32 sets are usable, but the shape of the defect could change: it isn't
chronological (TMT/ECL/TLA are recent), so new sets need re-checking as they ship.

**Silent staleness.** Every expensive artifact — extracted picks, fitted model,
Scryfall metadata — is reused whenever the file exists, with no key on the inputs
that produced it. A changed source file or a changed model parameter therefore
produces the *old* answer key with no warning. Until cache keys ship, assume any
regenerated queue is only as fresh as `data/`.

**Fan Content Policy.** WotC permits free fan projects but constrains
monetization. Read it before building a business model on top. 17Lands data is
CC-BY 4.0 and requires attribution; Scryfall asks for attribution and caching.
Attribution now travels with the generated schedule and appears in the app;
Scryfall images are cached through the Worker/Cloudflare Images path. The app
also publishes its anonymous-data policy and exposes deletion. Monetization still
needs a separate Fan Content Policy review.

---

## What would tell you it's working

* **D1 → D2 return rate.** The only metric that matters early. A daily game that
  doesn't pull people back tomorrow is not a daily game.
* **Share rate.** Wordle's growth was entirely the emoji grid.
* **Median time-to-answer.** If it drifts above ~45s the packs are too hard or
  too cluttered; if it's under ~8s they're too obvious. This is a direct signal
  to retune the scoring weights — the pipeline exposes them for exactly this.
* **Agreement-rate distribution.** If most players match the favourite most days,
  the filters are too permissive and the puzzles aren't puzzles.

---

## Open questions for later

* Is there a weekly harder mode — pick 3 from a pack, or P1P1 from a cube?
* Do non-Arena sets (paper-only, cube) ever justify losing the answer key? They'd
  need site-crowd-only scoring, with all the beauty-contest problems that brings.
* Would a "draft with the crowd" mode — 8 picks, but scored against Arena data
  rather than site players — be a differentiated answer to 8Pack, or scope creep?
