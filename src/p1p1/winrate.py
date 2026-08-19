"""Games-in-hand win rate per card, from the 17Lands game-data export.

The draft files say what the crowd *picked*; they cannot say whether the pick
was any good. That needs the separate game-data export: one row per game played,
with a 0/1 column per card for each of opening hand, drawn, tutored, deck and
sideboard -- four of those five in older sets, which never had a tutored block.

GIH WR -- games won among games where the card was ever in hand -- is the
standard 17Lands card-strength axis. It is still confounded (better decks win
more games, and a card only enters the average once it is drawn), but it is
measured per *game* rather than per drafter, so unlike the mean event match wins
of everyone who first-picked a card it doesn't inherit the whole deck and the
whole player. That is the difference between "a hint" and something the reveal
is allowed to print.

The files are 50-100 MB gzipped and over a thousand columns wide. We stream them
and keep only two integers per card, so the download happens once per set and
the cached aggregate is a few KB.
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

import numpy as np

from .ingest import open_stream
from .sets import game_data_url

# The per-card columns, and the ones that make up 17Lands' "ever drawn". Older
# exports have no tutored block; everything here tolerates its absence.
CARD_KINDS = ("opening_hand_", "drawn_", "tutored_", "deck_", "sideboard_")
IN_HAND = ("opening_hand_", "drawn_", "tutored_")

BATCH = 4096  # rows converted to numpy at once; bounds peak memory
MIN_GIH = 200  # below this many games in hand, the rate is noise


def _layout(header: list[str]) -> tuple[int, int, int, list[str], tuple[np.ndarray, ...]]:
    """Locate the per-card columns: (start, cards, span, names, in-hand indices).

    Two layouts are in the wild. Newer exports interleave the kinds card by card
    -- `opening_hand_X, drawn_X, tutored_X, deck_X, sideboard_X` -- while the
    AFR/STX era writes one contiguous block per kind and has no `tutored_`
    columns at all. Rather than encode either shape, take the whole per-card
    region and record where each kind's columns land inside it, then prove the
    card order matches across kinds by comparing the names themselves. A
    silently misaligned column here would produce plausible, wrong win rates.
    """
    groups = {kind: [i for i, h in enumerate(header) if h.startswith(kind)] for kind in CARD_KINDS}
    present = {kind: cols for kind, cols in groups.items() if cols}
    required = [kind for kind in ("opening_hand_", "drawn_", "deck_") if kind not in present]
    if required:
        raise ValueError(f"game data has no {', '.join(required)} columns")

    sizes = {kind: len(cols) for kind, cols in present.items()}
    if len(set(sizes.values())) != 1:
        raise ValueError(f"game data has uneven per-card columns: {sizes}")

    n = sizes["deck_"]
    lo = min(cols[0] for cols in present.values())
    hi = max(cols[-1] for cols in present.values()) + 1
    if hi - lo != len(present) * n:
        raise ValueError(f"per-card columns are not one contiguous region ({lo}..{hi} for {n} cards)")

    names = [header[col][len("deck_"):] for col in present["deck_"]]
    for kind, cols in present.items():
        if [header[col][len(kind):] for col in cols] != names:
            raise ValueError(f"{kind} columns are in a different card order than deck_")

    in_hand = tuple(
        np.array([col - lo for col in present[kind]]) for kind in IN_HAND if kind in present
    )
    return lo, n, hi - lo, names, in_hand


def build(set_code: str, verbose: bool = True) -> dict:
    """Stream one set's game data and total games-in-hand and wins per card."""
    stream = open_stream(game_data_url(set_code), None)
    header = next(csv.reader([stream.readline()]))
    lo, n, span, names, in_hand = _layout(header)
    width, i_won = len(header), header.index("won")

    gih = np.zeros(n, dtype=np.int64)
    wins = np.zeros(n, dtype=np.int64)
    cards: list[list[str]] = []
    won: list[bool] = []
    games = skipped = 0

    def flush() -> None:
        block = np.array(cards, dtype=np.float32)
        drawn = np.zeros((len(cards), n), dtype=bool)
        for columns in in_hand:
            drawn |= block[:, columns] > 0
        gih[:] += drawn.sum(0)
        wins[:] += drawn[np.array(won, dtype=bool)].sum(0)

    # No column before or inside the card block can contain a comma, and every
    # row is width-checked, so a bare split is safe and much cheaper than csv.
    for line in stream:
        parts = line.rstrip("\n").split(",")
        if len(parts) != width:
            skipped += 1
            continue
        cards.append(parts[lo : lo + span])
        won.append(parts[i_won] == "True")
        games += 1
        if len(cards) == BATCH:
            flush()
            cards, won = [], []
            if verbose and games % (BATCH * 25) == 0:
                print(f"  {set_code}: {games:,} games…", file=sys.stderr)
    if cards:
        flush()
    stream.close()

    if verbose:
        print(
            f"  {set_code}: {games:,} games over {n} cards"
            f"{f' ({skipped:,} malformed rows skipped)' if skipped else ''}",
            file=sys.stderr,
        )

    return {
        "set": set_code,
        "event_type": "PremierDraft",
        "games": games,
        "cards": {
            name: {"gih": int(g), "wins": int(w)} for name, g, w in zip(names, gih, wins)
        },
    }


def fetch(
    names: list[str],
    set_code: str,
    cache_dir: Path,
    min_games: int = MIN_GIH,
    verbose: bool = True,
) -> tuple[np.ndarray, np.ndarray]:
    """GIH win rate and sample size for `names`, NaN below the sample floor.

    Raw totals are cached, not the rate, so `min_games` can change without
    re-downloading 50-100 MB.
    """
    cache = cache_dir / f"winrates.{set_code}.json"
    if cache.exists():
        payload = json.loads(cache.read_text())
    else:
        if verbose:
            print(f"[winrate] streaming {set_code} game data from 17Lands…", file=sys.stderr)
        payload = build(set_code, verbose=verbose)
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(payload, indent=1))

    totals = payload["cards"]
    # 17Lands writes split/adventure cards under the full "A // B" name in some
    # exports and the front face in others; index both ways so lookups hit.
    for name in list(totals):
        if " // " in name:
            totals.setdefault(name.split(" // ")[0], totals[name])

    wr = np.full(len(names), np.nan)
    gih = np.zeros(len(names), dtype=np.int64)
    for i, name in enumerate(names):
        entry = totals.get(name)
        if not entry:
            continue
        gih[i] = entry["gih"]
        if entry["gih"] >= min_games:
            wr[i] = entry["wins"] / entry["gih"]
    return wr, gih
