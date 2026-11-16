import unittest
import os
import json
import re
from bs4 import BeautifulSoup

class TestWorkloadDashboard(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        cls.data_json_path = os.path.join(cls.repo_root, "data/dashboard-data.json")
        cls.index_html_path = os.path.join(cls.repo_root, "index.html")

        with open(cls.data_json_path, "r", encoding="utf-8") as f:
            cls.data = json.load(f)

        with open(cls.index_html_path, "r", encoding="utf-8") as f:
            cls.html = f.read()

        cls.soup = BeautifulSoup(cls.html, "html.parser")

    def test_zero_em_dashes(self):
        """Ensure zero em dashes or en dashes in generated HTML deliverable."""
        em_count = self.html.count("—") + self.html.count("–")
        self.assertEqual(em_count, 0, f"Found {em_count} em/en dashes in HTML!")

    def test_data_collections_integrity(self):
        """Verify all 9 collections are properly populated and non-empty."""
        self.assertGreaterEqual(len(self.data.get("cps", [])), 52)
        self.assertGreaterEqual(len(self.data.get("workload", [])), 134)
        self.assertEqual(len(self.data.get("derisk", [])), 15)
        self.assertEqual(len(self.data.get("aging_onboarding", [])), 129)
        self.assertEqual(len(self.data.get("renewals", [])), 201)
        self.assertEqual(len(self.data.get("notes_governance", [])), 201)
        self.assertEqual(len(self.data.get("archived_unsuccessful", [])), 65)
        self.assertEqual(len(self.data.get("issues", [])), 83)
        self.assertEqual(len(self.data.get("people", [])), 10)

    def test_topbar_structure(self):
        """Verify topbar layout, single-line buttons, and no leftover spacer divs."""
        topbar = self.soup.find("header", class_="topbar")
        self.assertIsNotNone(topbar)
        grow_divs = topbar.find_all("div", class_="grow")
        self.assertEqual(len(grow_divs), 0)

        navgroup = topbar.find("nav", class_="navgroup")
        self.assertIsNotNone(navgroup)
        buttons = navgroup.find_all("button", class_="navbtn")
        self.assertEqual(len(buttons), 8)

    def test_row_top_alignment_css(self):
        """Verify top alignment is enforced on all grid and table rows."""
        style_tag = self.soup.find("style")
        self.assertIsNotNone(style_tag)
        css = style_tag.string or ""
        self.assertIn("align-items: start !important", css)
        self.assertIn("vertical-align: top !important", css)

    def test_archived_count_badge(self):
        """Verify Archived / Closed count badge is initialized to 65."""
        badge = self.soup.find("span", id="nav-archived-count")
        self.assertIsNotNone(badge)
        self.assertEqual(badge.get_text(strip=True), "65")

    def test_dom_ids_match_js(self):
        """Verify all DOM IDs referenced in JS exist in HTML."""
        script_tag = self.soup.find("script")
        self.assertIsNotNone(script_tag)
        js = script_tag.string or ""

        all_dom_ids = set()
        for tag in self.soup.find_all(True):
            if tag.get("id"):
                all_dom_ids.add(tag["id"])

        js_get_el = set(re.findall(r"getElementById\(['\"]([^'\"]+)['\"]\)", js))
        missing_dom = js_get_el - all_dom_ids
        self.assertEqual(len(missing_dom), 0, f"Missing DOM IDs: {missing_dom}")

if __name__ == "__main__":
    unittest.main()
