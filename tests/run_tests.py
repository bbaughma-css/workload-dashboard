import os
import sys
import unittest

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(base_dir, "ingest"))
sys.path.insert(0, os.path.join(base_dir, "reports"))

from salesforce_source import SalesforceSource
from history import SnapshotHistory
from build_data import build_dashboard_data
from weekly_report import generate_weekly_report

class TestDashboard(unittest.TestCase):
    def test_salesforce_source_shape(self):
        src = SalesforceSource()
        res = src.fetch_records()
        self.assertIn("people", res)
        self.assertIn("cps", res)
        self.assertIn("workload", res)
        self.assertIn("issues", res)
        self.assertTrue(len(res["people"]) > 0)

    def test_roster_members(self):
        src = SalesforceSource()
        res = src.fetch_records()
        people_names = {p["name"] for p in res["people"]}
        self.assertEqual(len(people_names), 10)
        self.assertIn("Bob Baughman", people_names)
        self.assertIn("Stephan Bayer", people_names)

    def test_capacity_score_calculation(self):
        src = SalesforceSource()
        res = src.fetch_records()
        for p in res["people"]:
            self.assertGreaterEqual(p["capacity_score"], 0)

    def test_build_pipeline_and_bundle(self):
        data = build_dashboard_data(output_dir=base_dir)
        self.assertTrue(os.path.exists(os.path.join(base_dir, "data/dashboard-data.json")))
        self.assertTrue(os.path.exists(os.path.join(base_dir, "app/data.js")))
        self.assertTrue(os.path.exists(os.path.join(base_dir, "dist/workload-dashboard.html")))

    def test_weekly_report_generation(self):
        rep_file = generate_weekly_report(
            data_path=os.path.join(base_dir, "data/dashboard-data.json"),
            out_dir=os.path.join(base_dir, "reports/out")
        )
        self.assertTrue(os.path.exists(rep_file))

if __name__ == "__main__":
    unittest.main()
