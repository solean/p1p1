# p1p1 — pack curation for a daily pack-1-pick-1 game

Batch pipeline that turns 17Lands draft data into a ranked queue of packs worth
using as daily puzzles. It answers the riskiest question up front: **can you
reliably produce first picks that people genuinely disagree about?**

The repository also contains a no-backend playable prototype in [`web/`](web/).
There is still no game server or vote storage; the Python package remains the
content pipeline.

```bash
uv venv && uv pip install -e .
p1p1 sets                 # which sets have usable data
p1p1 curate BLB           # build a queue for one set
p1p1 validate BLB         # is the model accurate and calibrated?
open out/review.BLB.html  # eyeball the result

cd web                    # run the Phase 1 game prototype
npm install && npm run dev
```

Outputs land in `out/`:

* `queue.<SET>.json` — the packs, with predicted crowd split per card
* `review.<SET>.html` — the same thing with card art, for judging by eye

## How it works

**1. Ingest.** Stream the set's draft file from the 17Lands public S3 bucket and
keep only first picks — about 1 row in 42. Files are 40–230 MB gzipped and
several GB raw, so nothing is written to disk unless you pass `--keep-raw`.

**2. Fit.** Every first pick is a discrete choice: a drafter saw pack `S` and
took card `i`. Fit a conditional logit (Plackett-Luce),

```
P(pick i | pack S) = exp(θ_i) / Σ_{j∈S} exp(θ_j)
```

one latent pick-utility `θ` per card. The likelihood is convex, so L-BFGS finds
the global optimum in seconds.

This matters more than it might look. Distinct 14-card packs vastly outnumber
observed drafts — in HBG, 36,322 of 36,330 observed packs were unique — so you
**cannot** answer "what did the crowd pick from this pack" by counting. The model
generalizes to packs nobody ever saw, which is what makes a day-one seeded
answer key possible before you have a single user.

Sanity check: held-out top-1 accuracy **66.9%** on HBG and **62.1%** on LTR,
against a 7.1% random baseline — it calls the crowd's actual pick about two
times in three. Accuracy alone wouldn't justify printing "37% of players took
this", so `p1p1 validate` also checks calibration; predicted shares track
observed frequencies closely across the whole range on both sets.

**3. Score.** Candidate packs are *real observed packs*, not synthesized
collation — the dataset is full of genuine boosters, so there's no need to model
booster sheets. Each is scored on:

| metric | meaning |
| --- | --- |
| `contest` | how close the top two cards are |
| `spread` | how much probability sits outside the favourite |
| `quality` | strength of the best card (a coin flip between two 9th-picks is not a puzzle) |
| `color_split` | do the two leading cards commit you to different colors |
| `upset` | crowd favourite differs from the best win-rate card |

Filters reject packs with an obvious pick (`top1 > 0.55`) or no real decision
(`top1 < 0.18`). `diversify` then caps how often the same *matchup* recurs —
keyed on the unordered top-two pair, because in a near-tie the winner alternates
and a per-card cap lets the same pairing through twice over.

Tune with `--weights 'contest=1.0,color=0.2,upset=0.1'`. Keep the binary bonuses
well below the dynamic range of `contest` (~0.43 across a set) or they stop
ranking and start filtering — at 0.30/0.20 every queued pack came back flagged.
The report prints each flag's rate in the queue against its rate in the eligible
pool so you can see this happening.

## Data notes

Source: [17Lands public datasets](https://www.17lands.com/public_datasets),
CC-BY 4.0. Card art and colors from [Scryfall](https://scryfall.com). Both are
cached under `data/`.

Three things vary across sets and are detected at runtime rather than assumed:

* **Some files are tar inside gzip** despite the `.csv.gz` name (AFR and others),
  so the CSV starts 512 bytes in.
* **Column order differs.** MSH starts `expansion, event_type, draft_id, …`;
  AFR starts `user_match_win_rate_bucket, user_n_matches_bucket, draft_id, …`.
  The player-experience column is `user_n_games_bucket` in newer sets and
  `user_n_matches_bucket` in older ones.
* **Five exports omit the opening pick — recoverably.** In `AFR, STX, TMT, ECL,
  TLA`, pack 0 starts at pick 1 holding one card fewer than a fresh pack. Arena's
  client log doesn't list P1P1 until after P1P2 is submitted, so the row always
  has to be back-filled by the collector, and for these five it never made it
  into the export. Nothing is actually lost: the second-pick row's `pool_`
  columns hold exactly the card taken first, so ingest puts it back and rebuilds
  the original pack. Not an era thing (TMT/ECL/TLA are recent), so this is
  detected per set at runtime rather than kept as a list.

That makes **32 of 32 sets usable**.

## Caveats

* **`win_rates` is a hint, not truth.** It's the mean event match wins of
  drafters who took each card first, which is heavily confounded — stronger
  players take better cards, and match wins reflect the whole deck, not the
  first pick. Good enough to surface disagreement, not to declare a pick
  correct. If you want a defensible "right answer" axis, pull GIH win rate from
  the separate game-data files.
* **The crowd is Arena Premier Draft players**, skewed toward the enfranchised.
  `--min-games` restricts further to experienced drafters, which shifts what
  "the crowd" means — worth deciding deliberately rather than by default.
* **The model has no pack context beyond card identity.** Real P1P1 has none
  either, so this is fair, but it means θ absorbs set-wide effects like a card
  being good only in one archetype.
* **Model drift within a set.** θ is fit over a set's whole lifetime; early-format
  and solved-format pick orders differ. Fitting on a date window would show that.

## Layout

```
src/p1p1/
  sets.py      set universe + S3 URLs
  ingest.py    stream 17Lands data, extract P1P1 choices
  model.py     conditional logit fit + evaluation
  score.py     contestedness metrics, filters, diversification
  scryfall.py  card art/colors for the report
  report.py    HTML + JSON output
  cli.py       batch entrypoint
web/            static playable prototype: one pack, one pick, crowd reveal
```
