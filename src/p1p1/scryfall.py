"""Card metadata (art, colors, rarity) from Scryfall, cached per set.

Used only to render the review report -- the pipeline itself runs on 17Lands
names. Scryfall asks for ~100ms between requests; the collection endpoint takes
75 identifiers at a time, so a whole set costs about four calls.
"""

from __future__ import annotations

import json
import time
from pathlib import Path

import requests

COLLECTION = "https://api.scryfall.com/cards/collection"
HEADERS = {"User-Agent": "p1p1-curation/0.1", "Accept": "application/json"}


def _lookup(session: requests.Session, names: list[str], set_code: str | None) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for lo in range(0, len(names), 75):
        batch = names[lo : lo + 75]
        ids = [
            {"name": n, "set": set_code.lower()} if set_code else {"name": n}
            for n in batch
        ]
        resp = session.post(COLLECTION, json={"identifiers": ids}, headers=HEADERS, timeout=60)
        resp.raise_for_status()
        for card in resp.json().get("data", []):
            face = card.get("card_faces", [{}])[0] if "card_faces" in card else card
            out[card["name"]] = {
                "name": card["name"],
                "rarity": card.get("rarity"),
                "colors": card.get("colors", face.get("colors", [])),
                "mana_cost": card.get("mana_cost", face.get("mana_cost", "")),
                "type_line": card.get("type_line", ""),
                "image": (card.get("image_uris") or face.get("image_uris") or {}).get("normal", ""),
                "scryfall_uri": card.get("scryfall_uri", ""),
            }
        time.sleep(0.12)
    return out


def fetch(names: list[str], set_code: str, cache_dir: Path) -> dict[str, dict]:
    """Resolve card metadata by name, preferring printings from `set_code`."""
    cache = cache_dir / f"scryfall.{set_code}.json"
    meta = json.loads(cache.read_text()) if cache.exists() else {}
    session = requests.Session()

    missing = [n for n in names if n not in meta]
    if missing:
        meta.update(_lookup(session, missing, set_code))

    # Bonus-sheet and special-guest cards aren't printed in the set itself.
    missing = [n for n in names if n not in meta]
    if missing:
        meta.update(_lookup(session, missing, None))

    # 17Lands writes split/adventure cards with the full "A // B" name in some
    # sets and the front face in others; index both ways so lookups hit.
    for name in list(meta):
        if " // " in name:
            meta.setdefault(name.split(" // ")[0], meta[name])

    # Arena prefixes rebalanced cards with "A-", while Scryfall indexes the
    # underlying card name. Preserve the Arena name as an alias.
    aliases = {name: name[2:] for name in names if name.startswith("A-") and name not in meta}
    if aliases:
        resolved = _lookup(session, list(aliases.values()), None)
        for arena_name, base_name in aliases.items():
            card = next(
                (
                    value
                    for scryfall_name, value in resolved.items()
                    if scryfall_name == base_name
                    or scryfall_name.startswith(f"{base_name} // ")
                ),
                None,
            )
            if card is not None:
                meta[arena_name] = card

    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(meta, indent=1))
    return meta
