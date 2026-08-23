"""Build the immutable UTC schedule consumed by the daily game."""

from __future__ import annotations

import hashlib
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

SCHEDULE_VERSION = 1
ATTRIBUTION = {
    "draft_data": {
        "name": "17Lands",
        "url": "https://www.17lands.com/public_datasets",
        "license": "CC BY 4.0",
    },
    "card_data": {
        "name": "Scryfall",
        "url": "https://scryfall.com",
    },
}


def stable_pack_id(set_code: str, cards: list[str]) -> str:
    """Content-derived identity, independent of card order or queue position."""
    identity = json.dumps(
        [set_code.upper(), sorted(cards)], ensure_ascii=False, separators=(",", ":")
    )
    return hashlib.sha256(identity.encode()).hexdigest()[:20]


def _load_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text())
    if not isinstance(value, dict):
        raise ValueError(f"{path}: expected a JSON object")
    return value


def _why(pack: dict[str, Any]) -> str:
    answer = str(pack["answer"])
    runner_up = str(pack["runner_up"])
    best_win_rate = pack.get("best_win_rate")
    if best_win_rate and best_win_rate != answer:
        return (
            f"Arena favored {answer}, while {best_win_rate} had the pack's "
            "highest 17Lands games-in-hand win rate."
        )

    predicted = pack["predicted"]
    gap = abs(float(predicted[answer]) - float(predicted[runner_up])) * 100
    return (
        f"The Arena model put {answer} and {runner_up} only "
        f"{gap:.1f} percentage points apart."
    )


def _candidate(
    set_code: str, pack: dict[str, Any], metadata: dict[str, Any]
) -> dict[str, Any]:
    cards = pack.get("cards")
    predicted = pack.get("predicted")
    win_rate = pack.get("win_rate")
    answer = pack.get("answer")
    runner_up = pack.get("runner_up")
    if not isinstance(cards, list) or not cards:
        raise ValueError(f"{set_code}: queue entry has no cards")
    if not isinstance(predicted, dict) or not isinstance(win_rate, dict):
        raise ValueError(f"{set_code}: queue entry is missing card statistics")
    if answer not in cards or runner_up not in cards:
        raise ValueError(f"{set_code}: answer and runner-up must be in the pack")

    card_payload = []
    for name in cards:
        card = metadata.get(name)
        if not isinstance(card, dict) or not card.get("image"):
            raise ValueError(f"{set_code}: missing Scryfall image for {name}")
        card_payload.append(
            {
                "name": name,
                "image": card["image"],
                "scryfall_uri": card.get("scryfall_uri"),
                "arena_share": float(predicted[name]),
                "win_rate": win_rate.get(name),
            }
        )

    matchup = sorted((str(answer), str(runner_up)))
    return {
        "pack_id": stable_pack_id(set_code, cards),
        "set": set_code,
        "matchup": matchup,
        "cards": card_payload,
        "answer": answer,
        "runner_up": runner_up,
        "best_win_rate": pack.get("best_win_rate"),
        "why": _why(pack),
    }


def _load_candidates(queue_dir: Path, data_dir: Path) -> dict[str, list[dict[str, Any]]]:
    queues: dict[str, list[dict[str, Any]]] = {}
    for queue_path in sorted(queue_dir.glob("queue.*.json")):
        queue = _load_json(queue_path)
        set_code = str(queue.get("set") or "").upper()
        packs = queue.get("packs")
        if not set_code or not isinstance(packs, list):
            raise ValueError(f"{queue_path}: expected set and packs")
        metadata_path = data_dir / f"scryfall.{set_code}.json"
        if not metadata_path.exists():
            raise ValueError(f"{queue_path}: missing {metadata_path}")
        metadata = _load_json(metadata_path)
        queues[set_code] = [_candidate(set_code, pack, metadata) for pack in packs]
    if not queues:
        raise ValueError(f"{queue_dir}: no queue.*.json files found")
    return queues


def _validate_existing(schedule: dict[str, Any]) -> list[dict[str, Any]]:
    if schedule.get("version") != SCHEDULE_VERSION:
        raise ValueError("existing schedule has an unsupported version")
    days = schedule.get("days")
    if not isinstance(days, list):
        raise ValueError("existing schedule has no days array")

    previous: date | None = None
    for day in days:
        current = date.fromisoformat(day["date"])
        if previous is not None and current != previous + timedelta(days=1):
            raise ValueError("existing schedule dates must be contiguous and ascending")
        previous = current
    return days


def build_schedule(
    queue_dir: Path,
    data_dir: Path,
    out_path: Path,
    start_date: date | None = None,
) -> tuple[int, int]:
    """Append every unseen pack without changing an existing scheduled day."""
    queues = _load_candidates(queue_dir, data_dir)
    if out_path.exists():
        existing = _load_json(out_path)
        days = _validate_existing(existing)
        if start_date is not None:
            raise ValueError("--start is only valid when creating a new schedule")
    else:
        days = []

    frozen_count = len(days)
    seen_packs = {day["pack_id"] for day in days}
    seen_matchups = {tuple(day["matchup"]) for day in days}
    next_date = (
        date.fromisoformat(days[-1]["date"]) + timedelta(days=1)
        if days
        else start_date or datetime.now(timezone.utc).date()
    )

    positions = {set_code: 0 for set_code in queues}
    while True:
        added_this_round = False
        for set_code in sorted(queues):
            candidates = queues[set_code]
            while positions[set_code] < len(candidates):
                candidate = candidates[positions[set_code]]
                positions[set_code] += 1
                matchup = tuple(candidate["matchup"])
                if candidate["pack_id"] in seen_packs or matchup in seen_matchups:
                    continue
                days.append({"date": next_date.isoformat(), **candidate})
                next_date += timedelta(days=1)
                seen_packs.add(candidate["pack_id"])
                seen_matchups.add(matchup)
                added_this_round = True
                break
        if not added_this_round:
            break

    payload = {
        "version": SCHEDULE_VERSION,
        "attribution": ATTRIBUTION,
        "days": days,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = out_path.with_suffix(f"{out_path.suffix}.tmp")
    temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    temporary.replace(out_path)
    return len(days), len(days) - frozen_count
