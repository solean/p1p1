"""Extract pack-1-pick-1 choice observations from the 17Lands draft datasets.

Each row of a 17Lands draft file is one pick: a few hundred `pack_card_<name>`
columns giving what was in the pack, plus the `pick` that was made. We only want
the first pick of the first pack, which is roughly 1 row in 42.

The files are 40-230 MB gzipped (multiple GB raw), so we stream them and never
land the CSV on disk. The hot loop avoids full CSV parsing for the ~98% of rows
we discard: the leading columns are comma-free, so a cheap prefix split is
enough to test pack_number/pick_number, and only surviving rows pay for a real
csv parse (card names like "Thor, God of Thunder" are quoted).

Three things vary across sets and are handled at runtime rather than assumed:

* Older files (AFR, and others of that era) are *tar* archives inside the gzip
  despite the `.csv.gz` name, so the CSV starts 512 bytes in.
* Column order differs, and so does indexing: AFR numbers picks from 1 while MSH
  numbers them from 0. We probe the first rows and take the observed minimum
  rather than hardcoding either convention.
* Some exports (AFR, STX, TMT, ECL, TLA) omit the opening pick: pack 0 starts at
  pick 1, holding one card fewer than a fresh pack. Nothing is actually lost --
  that row's `pool_` columns hold exactly the card taken first -- so we rebuild
  the original pack rather than skip the set.
"""

from __future__ import annotations

import csv
import gzip
import io
import sys
import tarfile
from collections import Counter, defaultdict
from dataclasses import dataclass
from itertools import chain
from pathlib import Path

import numpy as np
import requests

from .sets import draft_data_url

MAX_PACK = 20  # generous upper bound on P1P1 pack size across sets
PROBE_ROWS = 20_000  # rows buffered to detect the pack/pick numbering base

# Player-experience column, renamed between set eras.
EXPERIENCE_COLS = ("user_n_games_bucket", "user_n_matches_bucket")


@dataclass
class P1P1Data:
    """Observed first-pick choices for one set."""

    set_code: str
    names: list[str]  # card name per column index
    packs: np.ndarray  # (N, MAX_PACK) int16, card indices, -1 padded
    picks: np.ndarray  # (N,) int16, index into names
    wins: np.ndarray  # (N,) int8, event_match_wins for that draft
    games: np.ndarray  # (N,) int32, experience bucket

    def __len__(self) -> int:
        return len(self.picks)

    def save(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            path,
            set_code=self.set_code,
            names=np.array(self.names, dtype=object),
            packs=self.packs,
            picks=self.picks,
            wins=self.wins,
            games=self.games,
        )

    @classmethod
    def load(cls, path: Path) -> "P1P1Data":
        z = np.load(path, allow_pickle=True)
        return cls(
            set_code=str(z["set_code"]),
            names=[str(n) for n in z["names"]],
            packs=z["packs"],
            picks=z["picks"],
            wins=z["wins"],
            games=z["games"],
        )


class _ReadShim(io.RawIOBase):
    """Adapt a bare read()-only object to something BufferedReader accepts.

    Members of a non-seekable tar stream don't implement the full IO protocol,
    so wrapping them directly raises on `seekable()`.
    """

    def __init__(self, fh):
        self._fh = fh

    def readable(self) -> bool:
        return True

    def readinto(self, buf) -> int:
        data = self._fh.read(len(buf))
        if not data:
            return 0
        buf[: len(data)] = data
        return len(data)


def _untar_if_needed(binary: io.BufferedReader) -> io.BufferedReader:
    """Some sets are tar-in-gzip; unwrap to the single member if so."""
    if b"ustar" not in binary.peek(512)[:512]:
        return binary
    archive = tarfile.open(fileobj=binary, mode="r|")
    member = next((m for m in archive if m.isfile()), None)
    if member is None:
        raise ValueError("tar archive contained no file member")
    extracted = archive.extractfile(member)
    if extracted is None:
        raise ValueError("could not read tar member")
    return io.BufferedReader(_ReadShim(extracted))


def _open_stream(set_code: str, cache: Path | None) -> io.TextIOWrapper:
    """Yield a decompressed text stream, from local cache if we have it."""
    if cache and cache.exists():
        raw = io.BufferedReader(gzip.open(cache, "rb"))  # type: ignore[arg-type]
        return io.TextIOWrapper(_untar_if_needed(raw), encoding="utf-8", newline="")

    resp = requests.get(draft_data_url(set_code), stream=True, timeout=120)
    resp.raise_for_status()
    resp.raw.decode_content = False  # S3 serves the .gz as-is; we want raw bytes

    if cache:
        cache.parent.mkdir(parents=True, exist_ok=True)
        tmp = cache.with_suffix(cache.suffix + ".part")
        with open(tmp, "wb") as fh:
            for chunk in resp.iter_content(chunk_size=1 << 20):
                fh.write(chunk)
        tmp.rename(cache)
        return _open_stream(set_code, cache)

    raw = io.BufferedReader(gzip.GzipFile(fileobj=resp.raw))  # type: ignore[arg-type]
    stream = io.TextIOWrapper(_untar_if_needed(raw), encoding="utf-8", newline="")
    stream._p1p1_response = resp  # type: ignore[attr-defined]  # keep the socket alive
    return stream


def _common_values(counts: Counter, share: float = 0.25) -> list[int]:
    """Values that occur often enough to be real, ignoring stray junk rows."""
    if not counts:
        return []
    cutoff = max(counts.values()) * share
    return sorted(v for v, c in counts.items() if c >= cutoff)


def _probe_base(
    stream: io.TextIOWrapper, i_pack: int, i_pick: int, split_at: int
) -> tuple[list[str], int, int, bool]:
    """Buffer the opening rows to learn where pack/pick numbering starts.

    Returns the buffered lines, the first pack number, the first pick number
    *within that pack*, and whether the opening pick looks absent. Both the
    numbering base and the presence of the first pick vary by set, so neither
    is assumed. A handful of sets (AFR, STX, TMT, ECL, TLA) number pack 0 from
    1 while later packs start at 0 -- there the opening row was never exported
    and `extract` reconstructs it.
    """
    buffered: list[str] = []
    joint: dict[int, Counter] = defaultdict(Counter)

    for line in stream:
        buffered.append(line)
        parts = line.split(",", split_at)
        if len(parts) > i_pick:
            try:
                joint[int(parts[i_pack])][int(parts[i_pick])] += 1
            except ValueError:
                pass
        if len(buffered) >= PROBE_ROWS:
            break

    packs = _common_values(Counter({p: sum(c.values()) for p, c in joint.items()}))
    if not packs:
        return buffered, 0, 0, False

    pack_base = packs[0]
    picks_here = _common_values(joint[pack_base])
    pick_base = picks_here[0] if picks_here else 0

    # If later packs start their numbering lower than the first pack does, the
    # opening pick is simply missing from this export.
    others = [_common_values(joint[p])[0] for p in packs[1:] if _common_values(joint[p])]
    missing = bool(others) and pick_base > min(others)

    return buffered, pack_base, pick_base, missing


def extract(
    set_code: str,
    cache_dir: Path | None = None,
    verbose: bool = True,
) -> P1P1Data:
    cache = (cache_dir / f"draft_data_public.{set_code}.PremierDraft.csv.gz") if cache_dir else None
    stream = _open_stream(set_code, cache)

    header = next(csv.reader([stream.readline()]))
    col = {name: i for i, name in enumerate(header)}

    pack_cols: list[tuple[int, int]] = []  # (csv column index, card index)
    names: list[str] = []
    for i, name in enumerate(header):
        if name.startswith("pack_card_"):
            pack_cols.append((i, len(names)))
            names.append(name[len("pack_card_"):])
    name_to_idx = {n: j for j, n in enumerate(names)}
    # Cards already taken when the row was written. Only read when the opening
    # pick is missing and has to be rebuilt from the second-pick row.
    pool_cols = [
        (i, name_to_idx[name[len("pool_"):]])
        for i, name in enumerate(header)
        if name.startswith("pool_") and name[len("pool_"):] in name_to_idx
    ]

    i_pack_no, i_pick_no = col["pack_number"], col["pick_number"]
    i_pick = col["pick"]
    i_wins = col.get("event_match_wins")
    i_games = next((col[c] for c in EXPERIENCE_COLS if c in col), None)

    # pack_number/pick_number sit at fixed early offsets and no earlier column
    # can contain a comma, so we can test them without parsing the whole row.
    split_at = max(i_pack_no, i_pick_no) + 2

    buffered, pack_base, pick_base, missing = _probe_base(
        stream, i_pack_no, i_pick_no, split_at
    )
    if missing and not pool_cols:
        stream.close()
        raise ValueError(
            f"{set_code}: pack {pack_base} starts at pick {pick_base} while later packs "
            "start lower, so the opening pick is absent, and this export has no pool_ "
            "columns to rebuild it from."
        )

    first_pack, first_pick = str(pack_base), str(pick_base)
    if verbose:
        label = (
            "rebuilding the unexported first pick from the second-pick row at"
            if missing
            else "first pick at"
        )
        print(
            f"  {set_code}: {len(names)} cards; {label}"
            f" pack_number={first_pack}, pick_number={first_pick}",
            file=sys.stderr,
        )

    packs: list[list[int]] = []
    picks: list[int] = []
    wins: list[int] = []
    games: list[int] = []
    scanned = dropped = 0

    for line in chain(buffered, stream):
        scanned += 1
        parts = line.split(",", split_at)
        if (
            len(parts) <= i_pick_no
            or parts[i_pack_no] != first_pack
            or parts[i_pick_no] != first_pick
        ):
            continue

        row = next(csv.reader([line]))
        pack: list[int] = []
        for ci, card_idx in pack_cols:
            v = row[ci]
            if v and v != "0":
                pack.extend([card_idx] * int(v))

        if missing:
            # This row is the second pick, so the pool is exactly the card taken
            # at the first. Put it back: pack + pool is the opening pack, and the
            # pooled card is the choice that was made from it.
            taken: list[int] = []
            for ci, card_idx in pool_cols:
                v = row[ci]
                if v and v != "0":
                    taken.extend([card_idx] * int(v))
            if len(taken) != 1:
                dropped += 1
                continue
            pick_idx = taken[0]
            pack.append(pick_idx)
        else:
            found = name_to_idx.get(row[i_pick])
            if found is None:
                dropped += 1
                continue
            pick_idx = found

        if pick_idx not in pack or not 1 < len(pack) <= MAX_PACK:
            dropped += 1
            continue

        packs.append(pack)
        picks.append(pick_idx)
        wins.append(int(row[i_wins]) if i_wins is not None and row[i_wins] else -1)
        games.append(int(row[i_games]) if i_games is not None and row[i_games] else -1)

        if verbose and len(picks) % 25_000 == 0:
            print(f"  {set_code}: {len(picks):,} P1P1 rows ({scanned:,} scanned)", file=sys.stderr)

    stream.close()

    arr = np.full((len(packs), MAX_PACK), -1, dtype=np.int16)
    for i, pack in enumerate(packs):
        arr[i, : len(pack)] = pack

    if verbose:
        print(
            f"  {set_code}: {len(picks):,} P1P1 observations from {scanned:,} rows"
            f" ({dropped:,} dropped)",
            file=sys.stderr,
        )

    return P1P1Data(
        set_code=set_code,
        names=names,
        packs=arr,
        picks=np.array(picks, dtype=np.int16),
        wins=np.array(wins, dtype=np.int8),
        games=np.array(games, dtype=np.int32),
    )
