from __future__ import annotations

import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

from p1p1.schedule import build_schedule, stable_pack_id


def pack(answer: str, runner_up: str, extra: str) -> dict:
    cards = [answer, runner_up, extra]
    return {
        "cards": cards,
        "predicted": {answer: 0.4, runner_up: 0.35, extra: 0.25},
        "win_rate": {answer: 0.6, runner_up: 0.59, extra: 0.55},
        "answer": answer,
        "runner_up": runner_up,
        "best_win_rate": answer,
        "metrics": {},
    }


class ScheduleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.queues = self.root / "out"
        self.data = self.root / "data"
        self.output = self.root / "content" / "schedule.json"
        self.queues.mkdir()
        self.data.mkdir()

    def tearDown(self) -> None:
        self.temporary.cleanup()

    def write_set(self, set_code: str, packs: list[dict]) -> None:
        names = {name for entry in packs for name in entry["cards"]}
        queue = {"set": set_code, "packs": packs}
        metadata = {
            name: {
                "image": f"https://cards.example/{name}.jpg",
                "scryfall_uri": f"https://scryfall.example/{name}",
            }
            for name in names
        }
        (self.queues / f"queue.{set_code}.json").write_text(json.dumps(queue))
        (self.data / f"scryfall.{set_code}.json").write_text(json.dumps(metadata))

    def read_days(self) -> list[dict]:
        return json.loads(self.output.read_text())["days"]

    def test_pack_id_ignores_card_order(self) -> None:
        self.assertEqual(
            stable_pack_id("LTR", ["A", "B", "C"]),
            stable_pack_id("ltr", ["C", "A", "B"]),
        )

    def test_interleaves_sets_and_deduplicates_matchups(self) -> None:
        self.write_set(
            "LTR",
            [pack("A1", "A2", "A3"), pack("A2", "A1", "A4"), pack("A5", "A6", "A7")],
        )
        self.write_set(
            "STX",
            [pack("B1", "B2", "B3"), pack("B4", "B5", "B6")],
        )

        total, added = build_schedule(
            self.queues, self.data, self.output, date(2026, 1, 1)
        )

        self.assertEqual((total, added), (4, 4))
        days = self.read_days()
        self.assertEqual([day["set"] for day in days], ["LTR", "STX", "LTR", "STX"])
        self.assertEqual(
            [day["date"] for day in days],
            ["2026-01-01", "2026-01-02", "2026-01-03", "2026-01-04"],
        )
        self.assertEqual(days[2]["answer"], "A5")

    def test_rerun_only_appends_new_content(self) -> None:
        self.write_set("LTR", [pack("A1", "A2", "A3")])
        build_schedule(self.queues, self.data, self.output, date(2026, 1, 1))
        frozen = self.read_days()

        self.write_set("STX", [pack("B1", "B2", "B3")])
        total, added = build_schedule(self.queues, self.data, self.output)

        days = self.read_days()
        self.assertEqual((total, added), (2, 1))
        self.assertEqual(days[:1], frozen)
        self.assertEqual(days[1]["date"], "2026-01-02")
        self.assertEqual(days[1]["set"], "STX")

    def test_excludes_alchemy_queues_and_rejects_existing_days(self) -> None:
        self.write_set("HBG", [pack("H1", "H2", "H3")])
        self.write_set("LTR", [pack("L1", "L2", "L3")])

        total, added = build_schedule(
            self.queues, self.data, self.output, date(2026, 1, 1)
        )
        self.assertEqual((total, added), (1, 1))
        self.assertEqual(self.read_days()[0]["set"], "LTR")

        existing = json.loads(self.output.read_text())
        existing["days"][0]["set"] = "HBG"
        self.output.write_text(json.dumps(existing))
        with self.assertRaisesRegex(ValueError, "unsupported set HBG"):
            build_schedule(self.queues, self.data, self.output)


if __name__ == "__main__":
    unittest.main()
