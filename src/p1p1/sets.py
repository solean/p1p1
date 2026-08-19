"""The universe of Arena-drafted sets that 17Lands publishes draft data for.

17Lands hosts these as gzipped CSVs on a public S3 bucket under a predictable
path. The list below is what was present on /public_datasets; `refresh_sets`
re-scrapes it so this doesn't rot as new sets ship.
"""

from __future__ import annotations

import re

import requests

S3_BASE = "https://17lands-public.s3.amazonaws.com/analysis_data"

# Sets with PremierDraft draft data, newest first. Cube entries are excluded:
# their "packs" aren't boosters and the card pool isn't stable.
KNOWN_SETS = [
    "MSH", "SOS", "TMT", "ECL", "TLA", "EOE", "FIN", "TDM", "DFT", "PIO",
    "FDN", "DSK", "BLB", "MH3", "OTJ", "MKM", "KTK", "LCI", "WOE", "LTR",
    "MOM", "SIR", "ONE", "BRO", "DMU", "HBG", "SNC", "NEO", "VOW", "MID",
    "AFR", "STX",
]


def draft_data_url(set_code: str, event_type: str = "PremierDraft") -> str:
    return f"{S3_BASE}/draft_data/draft_data_public.{set_code}.{event_type}.csv.gz"


def game_data_url(set_code: str, event_type: str = "PremierDraft") -> str:
    """Per-game results, used for card win rates. Separate, larger download."""
    return f"{S3_BASE}/game_data/game_data_public.{set_code}.{event_type}.csv.gz"


def refresh_sets(session: requests.Session | None = None) -> list[str]:
    """Re-scrape the published set list so the universe stays current."""
    session = session or requests.Session()
    html = session.get("https://www.17lands.com/public_datasets", timeout=60).text
    found = re.findall(r"draft_data_public\.([A-Za-z0-9_-]+)\.PremierDraft", html)
    seen: list[str] = []
    for code in found:
        if "Cube" in code or code in seen:
            continue
        seen.append(code)
    return seen or list(KNOWN_SETS)


def exists(set_code: str, session: requests.Session | None = None) -> bool:
    session = session or requests.Session()
    resp = session.head(draft_data_url(set_code), timeout=30)
    return resp.status_code == 200
