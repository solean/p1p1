"""Rank packs by how good a *daily puzzle* they'd make.

A pack is only worth showing if the crowd genuinely disagrees about it. The
model gives a pick distribution per pack; from that we want packs where the top
two or three cards are close, the best card is still a real card (a coin flip
between two 9th-picks is not a puzzle), and ideally the contenders pull toward
different colors -- that's the pack that makes people argue.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from .model import PickModel

# Extra games-in-hand win rate the underdog needs before a pack counts as a
# "win-rate upset". Three points is a real gap on this axis; tighter than that
# is inside the noise of a few hundred games.
UPSET_MARGIN = 0.03


@dataclass
class Filters:
    """A pack must clear all of these to be eligible for the queue."""

    max_top: float = 0.55  # above this the pick is obvious
    min_top: float = 0.18  # below this the pack is undifferentiated mush
    min_quality: float = 0.0  # best card's theta; keeps out packs of chaff
    min_contenders: int = 2  # cards with at least `contender_floor` share
    contender_floor: float = 0.12


@dataclass
class Weights:
    """Keep the binary bonuses well under the dynamic range of `contest`.

    Across a real set, `contest` varies by about 0.43 between the closest and
    loosest eligible packs. Binary flags worth more than that stop being
    tiebreakers and start being filters -- set color+upset to 0.5 and every
    queued pack comes back flagged, which is selection, not signal.
    """

    contest: float = 1.0  # top-2 closeness
    spread: float = 0.35  # probability mass outside the favourite
    quality: float = 0.25  # strength of the best card in the pack
    color: float = 0.10  # do the contenders pull to different colors
    upset: float = 0.07  # crowd favourite != best win-rate card

    @classmethod
    def parse(cls, spec: str | None) -> "Weights":
        """Build from a `contest=1.0,color=0.2` style string."""
        w = cls()
        for part in (spec or "").split(","):
            if not part.strip():
                continue
            key, _, value = part.partition("=")
            key = key.strip()
            if not hasattr(w, key):
                raise ValueError(f"unknown weight {key!r}")
            setattr(w, key, float(value))
        return w


@dataclass
class PackScore:
    pack: list[int]
    probs: np.ndarray
    order: list[int]  # card indices, most-picked first
    top1: float
    top2: float
    gap: float
    entropy: float
    quality: float
    contenders: int
    color_split: bool
    upset: bool
    spice: float
    components: dict[str, float] = field(default_factory=dict)


def score_pack(
    pack: list[int],
    model: PickModel,
    colors: dict[int, str] | None = None,
    win_rate: np.ndarray | None = None,
    weights: Weights | None = None,
) -> PackScore:
    weights = weights or Weights()
    probs = model.probs(pack)
    rank = np.argsort(-probs)
    order = [pack[i] for i in rank]
    ranked = probs[rank]

    top1 = float(ranked[0])
    top2 = float(ranked[1]) if len(ranked) > 1 else 0.0
    gap = top1 - top2
    entropy = float(-np.sum(probs * np.log(probs + 1e-12)) / np.log(len(probs)))
    quality = float(model.theta[order[0]])
    contenders = int(np.sum(ranked >= 0.12))

    # Do the two leading cards commit you to different colors? Colorless and
    # multicolor cards don't count as a split -- they're playable anywhere.
    color_split = False
    if colors and len(order) > 1:
        a, b = colors.get(order[0], ""), colors.get(order[1], "")
        color_split = bool(a) and bool(b) and len(a) == 1 and len(b) == 1 and a != b

    # Does the crowd's favourite differ from the best-performing card among the
    # real contenders? Requires a margin -- without one, noise alone flips this
    # about half the time. See winrate for what this axis can and can't claim.
    upset = False
    if win_rate is not None:
        live = [c for c, p in zip(order, ranked) if p >= 0.12 and not np.isnan(win_rate[c])]
        if len(live) > 1 and not np.isnan(win_rate[order[0]]):
            best = max(live, key=lambda c: win_rate[c])
            upset = bool(
                best != order[0] and win_rate[best] - win_rate[order[0]] >= UPSET_MARGIN
            )

    contest = 1.0 - gap
    spread = 1.0 - top1
    quality_norm = float(np.clip(quality / 4.0, 0.0, 1.0))
    components = {
        "contest": weights.contest * contest,
        "spread": weights.spread * spread,
        "quality": weights.quality * quality_norm,
        "color": weights.color * float(color_split),
        "upset": weights.upset * float(upset),
    }

    return PackScore(
        pack=list(pack),
        probs=probs,
        order=order,
        top1=top1,
        top2=top2,
        gap=gap,
        entropy=entropy,
        quality=quality,
        contenders=contenders,
        color_split=color_split,
        upset=upset,
        spice=sum(components.values()),
        components=components,
    )


def passes(s: PackScore, f: Filters) -> bool:
    return (
        f.min_top <= s.top1 <= f.max_top
        and s.quality >= f.min_quality
        and s.contenders >= f.min_contenders
    )


def diversify(scores: list[PackScore], limit: int, max_per_card: int = 3) -> list[PackScore]:
    """Take the best packs, capping how often the same *matchup* can recur.

    Without this the queue fills with one pair of cards over and over: any two
    cards adjacent in pick order keep producing near-ties, so the highest-spice
    packs are all the same decision wearing different commons. Keying on the
    unordered top-two pair rather than the winner matters, because in a near-tie
    the winner alternates between them and a per-card cap lets each pairing
    through twice over.
    """
    used: dict[frozenset[int], int] = {}
    out: list[PackScore] = []
    for s in sorted(scores, key=lambda x: -x.spice):
        key = frozenset(s.order[:2])
        if used.get(key, 0) >= max_per_card:
            continue
        used[key] = used.get(key, 0) + 1
        out.append(s)
        if len(out) >= limit:
            break
    return out
