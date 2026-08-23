"""Batch job: 17Lands draft data in, ranked queue of daily packs out."""

from __future__ import annotations

import argparse
import pickle
import sys
from datetime import date
from pathlib import Path

import numpy as np

from . import ingest, model as model_mod, report, schedule as schedule_mod, score, sets, winrate

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
OUT = ROOT / "out"
CONTENT = ROOT / "content"


def _p1p1(set_code: str, keep_raw: bool) -> ingest.P1P1Data:
    path = DATA / f"p1p1.{set_code}.npz"
    if path.exists():
        return ingest.P1P1Data.load(path)
    print(f"[ingest] streaming {set_code} draft data from 17Lands…", file=sys.stderr)
    data = ingest.extract(set_code, cache_dir=DATA / "raw" if keep_raw else None)
    data.save(path)
    return data


def _model(set_code: str, data: ingest.P1P1Data, l2: float, min_games: int | None) -> model_mod.PickModel:
    path = DATA / f"model.{set_code}.pkl"
    if path.exists():
        return pickle.loads(path.read_bytes())
    print(f"[fit] conditional logit over {len(data):,} choices…", file=sys.stderr)
    m = model_mod.fit(data, l2=l2, min_games=min_games)
    path.write_bytes(pickle.dumps(m))
    return m


def _rate(queue, pool, predicate) -> str:
    """Share of the queue with a property, against its rate in the eligible pool.

    If these two numbers are far apart the scoring weights are selecting on the
    flag rather than ranking by it.
    """
    q = sum(1 for s in queue if predicate(s)) / max(len(queue), 1)
    p = sum(1 for s in pool if predicate(s)) / max(len(pool), 1)
    return f"{q:.0%} of queue (pool {p:.0%})"


def cmd_curate(args: argparse.Namespace) -> None:
    from .scryfall import fetch

    data = _p1p1(args.set, args.keep_raw)

    m = _model(args.set, data, args.l2, args.min_games)
    print(
        f"[fit] held-out top-1 {m.heldout_top1:.1%} vs {m.baseline_top1:.1%} random"
        f" · log loss {m.heldout_logloss:.3f}",
        file=sys.stderr,
    )

    meta = fetch(m.names, args.set, DATA)
    colors = {
        i: "".join(sorted((meta.get(n) or {}).get("colors") or []))
        for i, n in enumerate(m.names)
    }
    wr, gih = winrate.fetch(m.names, args.set, DATA)
    known = int((~np.isnan(wr)).sum())
    print(
        f"[winrate] {known} of {len(m.names)} cards clear the"
        f" {winrate.MIN_GIH}-game floor",
        file=sys.stderr,
    )

    # Candidate pool: real packs that were actually opened, deduped. No need to
    # synthesise collation when the dataset is full of genuine boosters.
    seen: set[tuple[int, ...]] = set()
    candidates: list[list[int]] = []
    rng = np.random.default_rng(args.seed)
    for idx in rng.permutation(len(data)):
        pack = [int(c) for c in data.packs[idx] if c >= 0]
        key = tuple(sorted(pack))
        if key in seen:
            continue
        seen.add(key)
        candidates.append(pack)
        if len(candidates) >= args.candidates:
            break

    print(f"[score] scoring {len(candidates):,} distinct packs…", file=sys.stderr)
    weights = score.Weights.parse(args.weights)
    filters = score.Filters(max_top=args.max_top, min_top=args.min_top)
    scored = [score.score_pack(p, m, colors, wr, weights) for p in candidates]
    eligible = [s for s in scored if score.passes(s, filters)]
    queue = score.diversify(eligible, args.limit, args.max_per_card)

    print(
        f"[score] {len(eligible):,} of {len(scored):,} packs eligible"
        f" ({len(eligible) / max(len(scored), 1):.1%}); queued {len(queue)}",
        file=sys.stderr,
    )

    report.write_queue(queue, m, wr, OUT / f"queue.{args.set}.json")
    report.render(
        queue,
        m,
        meta,
        wr,
        OUT / f"review.{args.set}.html",
        notes={
            "Set": args.set,
            "P1P1 observations": f"{len(data):,}",
            "Held-out top-1": f"{m.heldout_top1:.1%} (random {m.baseline_top1:.1%})",
            "Distinct packs scored": f"{len(scored):,}",
            "Eligible": f"{len(eligible):,} ({len(eligible) / max(len(scored), 1):.1%})",
            "Queued": str(len(queue)),
            "Distinct matchups": str(len({frozenset(s.order[:2]) for s in queue})),
            "Color split": _rate(queue, eligible, lambda s: s.color_split),
            "Win-rate upset": _rate(queue, eligible, lambda s: s.upset),
            "Win rates": f"{known}/{len(m.names)} cards over {gih.max():,} games max",
        },
    )
    print(f"[done] out/queue.{args.set}.json · out/review.{args.set}.html", file=sys.stderr)


def cmd_validate(args: argparse.Namespace) -> None:
    data = _p1p1(args.set, False)
    m = _model(args.set, data, args.l2, args.min_games)
    print(f"{args.set}: {len(data):,} first picks · {len(m.names)} cards")
    print(
        f"  held-out top-1 {m.heldout_top1:.1%} (random {m.baseline_top1:.1%})"
        f" · log loss {m.heldout_logloss:.3f}"
    )
    print("  calibration (held out):")
    for lo, pred, actual, n in model_mod.calibration(m, data):
        print(f"    p>={lo:<4.2f}  predicted {pred:.3f}  actual {actual:.3f}  n={n:,}")


def cmd_schedule(args: argparse.Namespace) -> None:
    total, added = schedule_mod.build_schedule(
        OUT, DATA, CONTENT / "schedule.json", start_date=args.start
    )
    print(
        f"[done] content/schedule.json · {total} days ({added} added)",
        file=sys.stderr,
    )


def cmd_sets(args: argparse.Namespace) -> None:
    for code in sets.refresh_sets():
        print(code)


def cmd_winrates(args: argparse.Namespace) -> None:
    data = _p1p1(args.set, False)
    m = _model(args.set, data, args.l2, args.min_games)
    wr, gih = winrate.fetch(m.names, args.set, DATA)
    order = [i for i in np.argsort(-np.nan_to_num(wr, nan=-1)) if not np.isnan(wr[i])]
    print(f"{args.set}: {len(order)} of {len(m.names)} cards over the {winrate.MIN_GIH}-game floor")
    for label, rows in (("best", order[:10]), ("worst", order[-10:])):
        print(f"  {label}:")
        for i in rows:
            print(f"    {wr[i] * 100:5.1f}%  n={gih[i]:>7,}  {m.names[i]}")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="p1p1", description=__doc__)
    sub = ap.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("curate", help="build a ranked pack queue for one set")
    c.add_argument("set", help="set code, e.g. BLB")
    c.add_argument("--limit", type=int, default=90, help="packs to queue (default: a season)")
    c.add_argument("--candidates", type=int, default=60_000, help="distinct packs to score")
    c.add_argument("--max-per-card", type=int, default=3, help="cap on repeats of the same answer")
    c.add_argument("--max-top", type=float, default=0.55, help="reject packs with an obvious pick")
    c.add_argument("--min-top", type=float, default=0.18, help="reject undifferentiated packs")
    c.add_argument(
        "--weights",
        default=None,
        help="override scoring weights, e.g. 'contest=1.0,color=0.2,upset=0.1'",
    )
    c.add_argument("--l2", type=float, default=2.0)
    c.add_argument("--min-games", type=int, default=None, help="restrict to experienced drafters")
    c.add_argument("--keep-raw", action="store_true", help="cache the 40-230MB source .gz")
    c.add_argument("--seed", type=int, default=0)
    c.set_defaults(func=cmd_curate)

    v = sub.add_parser("validate", help="check the fitted model is accurate and calibrated")
    v.add_argument("set")
    v.add_argument("--l2", type=float, default=2.0)
    v.add_argument("--min-games", type=int, default=None)
    v.set_defaults(func=cmd_validate)

    w = sub.add_parser("winrates", help="games-in-hand win rate per card")
    w.add_argument("set")
    w.add_argument("--l2", type=float, default=2.0)
    w.add_argument("--min-games", type=int, default=None)
    w.set_defaults(func=cmd_winrates)

    schedule_parser = sub.add_parser(
        "schedule", help="append curated queues to the immutable daily schedule"
    )
    schedule_parser.add_argument(
        "--start",
        type=date.fromisoformat,
        default=None,
        metavar="YYYY-MM-DD",
        help="first UTC date when creating a schedule (default: today)",
    )
    schedule_parser.set_defaults(func=cmd_schedule)

    s = sub.add_parser("sets", help="list sets with published draft data")
    s.set_defaults(func=cmd_sets)

    args = ap.parse_args(argv)
    args.func(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
