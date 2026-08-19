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
| **Phase 2 — real daily game** | Not started. Scoped below; decisions 1, 4, 5 gate it. |

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

## Open decisions

Answer 1, 4, and 5 before writing any Phase 2 schema — each one changes what
gets stored. 3 and 6 can wait until there is something to lay out or a URL to
move.

### 1. Whose crowd is "the answer"? — the important one

Three candidate answer keys:

| | source | properties |
| --- | --- | --- |
| **(a) Site crowd** | your own players' votes | matches the original pitch; needs traffic; gameable |
| **(b) Arena crowd** | the fitted model over real 17Lands drafts | available day one, stable, ungameable, huge n |
| **(c) Win rate** | game-data files | "correct" rather than popular; confounded |

**Recommendation: score against (b), display (a) alongside it.**

The reason is a feedback loop that's easy to miss. If the score is "did you match
*this site's* crowd," players stop drafting and start playing a Keynesian beauty
contest — picking what they think others will pick. Consensus compounds, packs
that were 40/35/25 collapse toward the favourite, and the puzzle degrades over
exactly the timescale you're trying to build a habit on. Scoring against tens of
thousands of real Arena drafters who have never heard of the site breaks that
loop entirely, and it is still honestly "the crowdsourced pick" — just a much
larger and more legitimate crowd.

Displaying the site's own split next to it is then a *feature*, not the answer
key: "the internet took the rare; you and 61% of players here took the common."
Divergence between the two crowds is interesting content in its own right.

This also means there is no cold start at all. Day one has a real answer.

### 2. If the site crowd ever becomes the answer, how do you blend?

Should you go with (a) after all, don't hard-switch at some vote threshold —
early and late players would see different answers for the same puzzle. Use the
model as a Dirichlet prior and update:

```
shown_share = (k · model_p + votes) / (k + n)
```

with a pseudo-count `k` around 100. Continuous, honest at every n, converges to
the real distribution once traffic justifies it.

### 3. Pack presentation

Real packs are 14–15 cards. Showing all of them is authentic and most of them
are obviously unpickable. Trimming to the live contenders is friendlier on
mobile but leaks the answer. **Lean authentic**; solve it with layout, not by
removing cards.

### 4. Day boundary

UTC, not local midnight. One global puzzle means one tally row, one cache key,
and share text that can't disagree between two people in different timezones.
Local midnight buys a friendlier reset hour at the cost of per-timezone puzzle
keys and a tally that has to be sharded by them. Not worth it.

### 5. Identity

A signed anonymous cookie, issued on first visit. One row per player per day,
keyed on it. Requiring an account before the first pick puts a login wall in
front of a twenty-second game and kills the funnel; accounts can come later,
optional, for cross-device streaks. `web/app/chatgpt-auth.ts` is scaffolding
from the template and is not wired to anything.

Because the answer key is the Arena model, ballot stuffing cannot move a score.
That deletes most of the anti-abuse work a vote-scored game would need — one
more reason decision 1 goes the way it does.

### 6. Where it lives

Currently an OpenAI Sites project (`web/.openai/hosting.json`). A daily-habit
product with share links and search traffic wants its own domain. Decide before
the first real user, because migrating URLs after people have bookmarked and
shared them costs more than moving now.

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

The shape is a lookup, not a computation: content is already generated, and all
32 sets of queues are about 3 MB of JSON. That fits in the deploy bundle, so the
read path needs no database at all. The only dynamic thing is the site's own
vote split.

**2a. Content becomes a schedule.** Today `curate` writes one `out/queue.<SET>.json`
per set, with no identity per pack, and `diversify` resets its matchup counter
every run — so there is nothing stopping two sets from shipping the same pairing
a week apart.

* Stable pack ID: hash of set plus sorted card names. Everything below depends
  on it.
* `p1p1 schedule`: consume every queue, interleave sets, dedupe globally on pack
  ID *and* on the top-two matchup, assign UTC dates, emit `content/schedule.json`.
* Append-only. Shipped days freeze; re-running never reshuffles history.
* Cache invalidation. `curate` currently reuses `data/*.npz` and `model.*.pkl`
  unconditionally, so changing `--l2`, `--min-games`, or the model code silently
  reuses the old fit. Key the cache on parameters plus code version.
* Stop persisting the model as a pickle. θ and names into npz or JSON: portable,
  version-stable, and not arbitrary code execution on a file CI will fetch.
* Emit 17Lands and Scryfall attribution into the generated artifacts, not just
  the README.
* Add the `why` field to the schema now even though the copy comes later.

**2b. The service.** Two tables, no more: `vote(day, player_id, card, created_at)`
with a unique index on `(day, player_id)`, and `tally(day, card, n)` incremented
on submit. Puzzles stay static — immutable content does not belong in a database.
Routes: today's puzzle, submit-and-reveal, and one dated puzzle for the archive.
D1 has to actually be bound (`.openai/hosting.json` sets it to `null` today, and
the db helper throws by design until it isn't); `web/examples/d1/` is the pattern
to copy. The build also has to ship `content/schedule.json`, which today's plugin
doesn't copy.

**2c. Client.** The prototype hands the client every card's share up front. That
is correct for a fixture and fatal for a game: the payload has to split into a
pack before the pick and a reveal after it. Beyond that — routes for today, the
archive, and a dated day; pick and streak persisted server-side by cookie so a
refresh doesn't erase the day; a per-day share card and OG image, which is the
growth mechanism and not decoration; real loading, error, and empty states;
card art cached through R2 or the Worker cache rather than hotlinked to Scryfall
on every view; the hardcoded LOTR narrative strings deleted; and the event
capture behind the four metrics below, since a launch you can't measure teaches
you nothing. Time-to-answer needs a timer started at pack render.

**2d. Gates.** There is no CI. Lint, typecheck, the web tests, and Python tests
on every push. The web tests currently regex the source for a couple of
assertions — replace those with the real path: pick, reveal, persist, one vote
enforced. There are no Python tests at all; the highest-value targets are
`ingest.extract` (tar vs plain, numbering base, the rebuilt opening pick, a
malformed new-set header), `schedule` determinism and append-only-ness, and the
`score` thresholds. One lockfile, not two.

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
produces the *old* answer key with no warning. Fixed in 2a; until then, assume
any regenerated queue is only as fresh as `data/`.

**Fan Content Policy.** WotC permits free fan projects but constrains
monetization. Read it before building a business model on top. 17Lands data is
CC-BY 4.0 and requires attribution; Scryfall asks for attribution and caching.
Neither attribution reaches the generated artifacts today — only the README —
and storing a player cookie and votes brings a privacy policy and a deletion
path with it.

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
