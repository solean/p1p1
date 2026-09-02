from __future__ import annotations

import unittest

from p1p1 import sets


class FakeResponse:
    def __init__(self, text: str = "", status_code: int = 200) -> None:
        self.text = text
        self.status_code = status_code


class FakeSession:
    def __init__(self, html: str, available: set[str] | None = None) -> None:
        self.html = html
        self.available = available
        self.head_called = False

    def get(self, url: str, timeout: int) -> FakeResponse:
        return FakeResponse(self.html)

    def head(self, url: str, timeout: int) -> FakeResponse:
        self.head_called = True
        available = self.available is None or any(
            f".{code}." in url for code in self.available
        )
        return FakeResponse(status_code=200 if available else 403)


class SetPolicyTests(unittest.TestCase):
    def test_hobbit_is_approved(self) -> None:
        self.assertEqual(sets.KNOWN_SETS[0], "HOB")
        self.assertTrue(sets.is_supported("hob"))
        self.assertEqual(sets.require_supported("hob"), "HOB")
        self.assertIn("draft_data_public.HOB.PremierDraft", sets.draft_data_url("HOB"))

    def test_alchemy_only_sets_are_rejected(self) -> None:
        self.assertNotIn("HBG", sets.KNOWN_SETS)
        self.assertFalse(sets.is_supported("hbg"))
        with self.assertRaisesRegex(ValueError, "Alchemy-only"):
            sets.require_supported("HBG")
        with self.assertRaisesRegex(ValueError, "Alchemy-only"):
            sets.draft_data_url("hbg")
        self.assertFalse(sets.is_supported("NEW"))
        with self.assertRaisesRegex(ValueError, "approved non-Alchemy"):
            sets.require_supported("NEW")

    def test_refresh_filters_alchemy_and_cube_sets(self) -> None:
        html = " ".join(
            [
                "draft_data_public.LTR.PremierDraft",
                "draft_data_public.HOB.PremierDraft",
                "draft_data_public.HBG.PremierDraft",
                "draft_data_public.Arena_Cube.PremierDraft",
                "draft_data_public.STX.PremierDraft",
                "draft_data_public.NEW.PremierDraft",
            ]
        )
        session = FakeSession(html)

        self.assertEqual(sets.refresh_sets(session), ["LTR", "HOB", "STX"])
        self.assertFalse(sets.exists("HBG", session))
        self.assertFalse(session.head_called)

    def test_refresh_probes_exports_when_catalog_has_no_static_links(self) -> None:
        session = FakeSession("", available={"LTR", "STX"})
        self.assertEqual(sets.refresh_sets(session), ["LTR", "STX"])
        self.assertTrue(session.head_called)



if __name__ == "__main__":
    unittest.main()
