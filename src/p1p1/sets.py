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

# Sets whose export omits the opening pick: pack 0 is numbered from pick 1
# while later packs start at 0. Unusable for a P1P1 game. Not an era thing --
# TMT/ECL/TLA are recent -- so ingest re-detects this per set rather than
# trusting this list, which is here for planning.
NO_FIRST_PICK = {"AFR", "STX", "TMT", "ECL", "TLA"}

USABLE_SETS = [s for s in KNOWN_SETS if s not in NO_FIRST_PICK]


def draft_data_url(set_code: str, event_type: str = "PremierDraft") -> str:
    return f"{S3_BASE}/draft_data/draft_data_public.{set_code}.{event_type}.csv.gz"


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
