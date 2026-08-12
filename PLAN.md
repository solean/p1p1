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
| **Phase 2 — real daily game** | Not started. |

Phase 0 answered the riskiest content question — *can you reliably produce first
picks people genuinely disagree about?* — and the answer is yes, with room to
spare:

* **~40% of real packs** clear the "contested" bar (13.9k of 36.3k in HBG, 24.9k
  of 60k in LTR).
* **27 of 32 Arena sets** are usable.
* At 90 packs per set that's **~2,400 daily puzzles, or 6.6 years** of content,
  and the eligible pool is an order of magnitude larger than that.

Content supply is not a risk. Everything below is about whether anyone plays.

---

## Locked decisions

**One pack, one pick, once a day.** Not a partial draft. The whole interaction
fits in a glance.

**Rotate across all Arena-drafted sets.** Nostalgia is a feature — an LTR or KTK
pack lands differently than the current Standard set. 27 sets is deep enough to
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

---

## Open decisions

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

### 3. Win-rate axis

`model.win_rates` currently uses mean event match wins of drafters who took each
card first. It costs no extra download, but it's badly confounded — stronger
players take better cards, and match wins reflect the whole deck. Good enough to
*surface* disagreement, not to tell a player they were wrong.

If the reveal is going to assert "the better pick was X," pull GIH win rate from
the separate 17Lands game-data files first. Decide before Phase 2, because it
changes what the reveal is allowed to claim.

### 4. Pack presentation

Real packs are 14–15 cards. Showing all of them is authentic and most of them
are obviously unpickable. Trimming to the live contenders is friendlier on
mobile but leaks the answer. **Lean authentic**; solve it with layout, not by
removing cards.

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

* Nightly job serves puzzle N from a pre-built queue. Content is already
  generated, so this is a lookup, not a computation.
* Vote storage, one submission per player per day, locked before reveal.
* Streaks, share card, archive of past days.
* Site-crowd split displayed alongside the Arena answer.

Scale is trivial — one insert per player per day, one aggregate per day.
Cloudflare Workers + D1, or Next.js + Postgres. Don't over-build this.

### Phase 3 — retention

* One-line "why" per puzzle. Hand-written for the queue; 90 at a time is
  tractable and it's the highest-leverage writing in the product.
* Personal stats: agreement rate over time, which colors you overdraft.
* Archive / play past days.

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

**Set-data rot.** Five sets (`AFR, STX, TMT, ECL, TLA`) have no P1P1 row in the
export, and it isn't chronological — recent sets are affected. Ingest detects
this per set and refuses rather than silently curating second picks, but new sets
need re-checking as they ship.

**Fan Content Policy.** WotC permits free fan projects but constrains
monetization. Read it before building a business model on top. 17Lands data is
CC-BY 4.0 and requires attribution; Scryfall asks for attribution and caching.

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
