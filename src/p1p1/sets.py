"""Non-Alchemy Arena draft sets with public 17Lands data.

17Lands hosts these as gzipped CSVs on a public S3 bucket under a predictable
path. `KNOWN_SETS` is the reviewed non-Alchemy allowlist; `refresh_sets`
intersects live 17Lands data with it so new products require explicit approval.
"""

from __future__ import annotations

import re

import requests

S3_BASE = "https://17lands-public.s3.amazonaws.com/analysis_data"

# Alchemy-only products are deliberately excluded from curation and scheduling.
ALCHEMY_ONLY_SETS = frozenset({"HBG"})

# Sets with PremierDraft draft data, newest first. Cube entries are excluded:
# their "packs" aren't boosters and the card pool isn't stable.
KNOWN_SETS = [
    "MSH", "SOS", "TMT", "ECL", "TLA", "EOE", "FIN", "TDM", "DFT", "PIO",
    "FDN", "DSK", "BLB", "MH3", "OTJ", "MKM", "KTK", "LCI", "WOE", "LTR",
    "MOM", "SIR", "ONE", "BRO", "DMU", "SNC", "NEO", "VOW", "MID", "AFR",
    "STX",
]
SUPPORTED_SETS = frozenset(KNOWN_SETS)


def is_supported(set_code: str) -> bool:
    return set_code.upper() in SUPPORTED_SETS


def require_supported(set_code: str) -> str:
    code = set_code.upper()
    if not code:
        raise ValueError("set code is required")
    if code in ALCHEMY_ONLY_SETS:
        raise ValueError(f"{code} is Alchemy-only and is not supported")
    if code not in SUPPORTED_SETS:
        raise ValueError(f"{code} is not an approved non-Alchemy draft set")
    return code


def draft_data_url(set_code: str, event_type: str = "PremierDraft") -> str:
    set_code = require_supported(set_code)
    return f"{S3_BASE}/draft_data/draft_data_public.{set_code}.{event_type}.csv.gz"


def game_data_url(set_code: str, event_type: str = "PremierDraft") -> str:
    """Per-game results, used for card win rates. Separate, larger download."""
    set_code = require_supported(set_code)
    return f"{S3_BASE}/game_data/game_data_public.{set_code}.{event_type}.csv.gz"


def refresh_sets(session: requests.Session | None = None) -> list[str]:
    """Re-scrape the published set list so the universe stays current."""
    session = session or requests.Session()
    html = session.get("https://www.17lands.com/public_datasets", timeout=60).text
    found = re.findall(r"draft_data_public\.([A-Za-z0-9_-]+)\.PremierDraft", html)
    seen: list[str] = []
    for code in found:
        code = code.upper()
        if "cube" in code.lower() or code in seen or not is_supported(code):
            continue
        seen.append(code)
    return seen or list(KNOWN_SETS)


def exists(set_code: str, session: requests.Session | None = None) -> bool:
    if not is_supported(set_code):
        return False
    session = session or requests.Session()
    resp = session.head(draft_data_url(set_code), timeout=30)
    return resp.status_code == 200
