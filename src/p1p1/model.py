"""Conditional logit over first-pick choices.

Every P1P1 row is a discrete choice: a drafter saw a pack S and took card i. We
fit one latent pick-utility per card and model

    P(pick i | pack S) = exp(theta_i) / sum_{j in S} exp(theta_j)

which is the standard conditional-logit / Plackett-Luce setup. The negative log
likelihood is convex, so L-BFGS finds the global optimum, and the fitted theta
gives calibrated pick probabilities for *any* pack -- including packs nobody in
the dataset ever saw. That is what makes a seeded answer key possible: distinct
14-card packs vastly outnumber observed drafts, so almost no pack repeats and
counting exact-pack outcomes would be hopeless.

Interpretation: theta is a pick-order strength on a log-odds scale. A one-unit
gap means the stronger card is taken ~e times as often when both are present.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
from scipy.optimize import minimize

from .ingest import P1P1Data

CHUNK = 200_000  # rows per block, to bound peak memory on big sets


@dataclass
class PickModel:
    set_code: str
    names: list[str]
    theta: np.ndarray  # (K,) pick utility per card
    n_obs: int
    heldout_logloss: float
    heldout_top1: float
    baseline_top1: float

    def index(self, name: str) -> int:
        return self.names.index(name)

    def probs(self, pack: np.ndarray | list[int]) -> np.ndarray:
        """Pick distribution over the cards in one pack (order preserved)."""
        u = self.theta[np.asarray(pack, dtype=int)]
        e = np.exp(u - u.max())
        return e / e.sum()


def _nll_and_grad(
    theta: np.ndarray, packs: np.ndarray, mask: np.ndarray, pick_counts: np.ndarray, l2: float
) -> tuple[float, np.ndarray]:
    k = theta.shape[0]
    nll = 0.0
    grad = np.zeros(k)

    for lo in range(0, packs.shape[0], CHUNK):
        p = packs[lo : lo + CHUNK]
        m = mask[lo : lo + CHUNK]

        u = theta[p]
        u[~m] = -np.inf
        top = u.max(axis=1, keepdims=True)
        e = np.exp(u - top)
        s = e.sum(axis=1, keepdims=True)
        nll += float(np.sum(top[:, 0] + np.log(s[:, 0])))

        probs = e / s
        grad += np.bincount(p[m], weights=probs[m], minlength=k)

    nll -= float(theta @ pick_counts)
    grad -= pick_counts

    nll += 0.5 * l2 * float(theta @ theta)
    grad += l2 * theta
    return nll, grad


def fit(
    data: P1P1Data,
    l2: float = 2.0,
    min_games: int | None = None,
    holdout: float = 0.1,
    seed: int = 0,
) -> PickModel:
    """Fit pick utilities. `min_games` restricts to drafters with at least that
    many logged games, which shifts "the crowd" toward experienced players."""
    packs, picks = data.packs.astype(np.int64), data.picks.astype(np.int64)

    if min_games is not None:
        keep = data.games >= min_games
        packs, picks = packs[keep], picks[keep]

    rng = np.random.default_rng(seed)
    order = rng.permutation(len(picks))
    n_test = int(len(picks) * holdout)
    test_idx, train_idx = order[:n_test], order[n_test:]

    k = len(data.names)
    tr_packs, tr_picks = packs[train_idx], picks[train_idx]
    tr_mask = tr_packs >= 0
    tr_packs = np.where(tr_mask, tr_packs, 0)
    pick_counts = np.bincount(tr_picks, minlength=k).astype(float)

    res = minimize(
        _nll_and_grad,
        np.zeros(k),
        args=(tr_packs, tr_mask, pick_counts, l2),
        jac=True,
        method="L-BFGS-B",
        options={"maxiter": 500},
    )
    theta = res.x - res.x.mean()  # center; the model is shift-invariant

    ll, top1, base = _evaluate(theta, packs[test_idx], picks[test_idx])
    return PickModel(
        set_code=data.set_code,
        names=list(data.names),
        theta=theta,
        n_obs=len(tr_picks),
        heldout_logloss=ll,
        heldout_top1=top1,
        baseline_top1=base,
    )


def _evaluate(theta: np.ndarray, packs: np.ndarray, picks: np.ndarray) -> tuple[float, float, float]:
    """Held-out log loss and top-1 accuracy, against a uniform-choice baseline."""
    if len(picks) == 0:
        return float("nan"), float("nan"), float("nan")

    mask = packs >= 0
    safe = np.where(mask, packs, 0)
    u = theta[safe]
    u[~mask] = -np.inf
    top = u.max(axis=1, keepdims=True)
    e = np.exp(u - top)
    lse = top[:, 0] + np.log(e.sum(axis=1))

    logloss = float(np.mean(lse - theta[picks]))
    predicted = safe[np.arange(len(picks)), np.argmax(u, axis=1)]
    top1 = float(np.mean(predicted == picks))
    baseline = float(np.mean(1.0 / mask.sum(axis=1)))
    return logloss, top1, baseline


def calibration(
    model: PickModel, data: P1P1Data, holdout: float = 0.1, seed: int = 0
) -> list[tuple[float, float, float, int]]:
    """Held-out reliability curve: (bucket_lo, mean predicted, actual, n).

    Accuracy alone doesn't justify showing a number like "37% of players took
    this". That claim needs the probabilities to be calibrated, so check it
    directly rather than trusting the fit.
    """
    rng = np.random.default_rng(seed)
    test = rng.permutation(len(data))[: int(len(data) * holdout)]
    packs, picks = data.packs[test].astype(np.int64), data.picks[test].astype(np.int64)

    mask = packs >= 0
    safe = np.where(mask, packs, 0)
    u = model.theta[safe]
    u[~mask] = -np.inf
    e = np.exp(u - u.max(axis=1, keepdims=True))
    probs = (e / e.sum(axis=1, keepdims=True))[mask]
    actual = (((safe == picks[:, None]) & mask)[mask]).astype(float)

    edges = [0, 0.02, 0.05, 0.10, 0.20, 0.35, 0.50, 0.70, 1.01]
    rows = []
    for lo, hi in zip(edges, edges[1:]):
        sel = (probs >= lo) & (probs < hi)
        if sel.sum() < 50:
            continue
        rows.append((lo, float(probs[sel].mean()), float(actual[sel].mean()), int(sel.sum())))
    return rows


def win_rates(data: P1P1Data, min_n: int = 200) -> tuple[np.ndarray, np.ndarray]:
    """Mean event match wins of drafters who took each card P1P1, and the count.

    This is a rough "was it actually a good pick" signal that costs no extra
    download, but it is heavily confounded -- stronger players draft better
    cards, and match wins reflect the whole deck, not the first pick. Treat it
    as a spice heuristic for surfacing disagreement, not as ground truth.
    """
    k = len(data.names)
    valid = data.wins >= 0
    picks, wins = data.picks[valid].astype(np.int64), data.wins[valid].astype(float)

    counts = np.bincount(picks, minlength=k).astype(float)
    totals = np.bincount(picks, weights=wins, minlength=k)
    means = np.divide(totals, counts, out=np.full(k, np.nan), where=counts > 0)
    means[counts < min_n] = np.nan
    return means, counts
