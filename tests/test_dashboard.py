import unittest
import os
import sys
import json

base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, base_dir)

from ingest.salesforce_source import SalesforceSource
from ingest.build_data import build_dashboard_data

class TestDashboardIntegrity(unittest.TestCase):
    def setUp(self):
        self.source = SalesforceSource()
        self.data = self.source.fetch_records()

    def test_strict_active_isolation(self):
        """Verify no completed or closed accounts exist in active operational views."""
        active_views = [
            ("workload", self.data.get("workload", [])),
            ("active_cps", self.data.get("active_cps", [])),
            ("derisk", self.data.get("derisk", [])),
            ("aging_onboarding", self.data.get("aging_onboarding", [])),
            ("renewals", self.data.get("renewals", [])),
            ("notes_governance", self.data.get("notes_governance", []))
        ]
        
        for view_name, accts in active_views:
            for a in accts:
                st = str(a.get("status") or "").lower()
                self.assertFalse(a.get("is_completed", False), f"Error: Account {a.get('clean_acct')} in view {view_name} marked is_completed=True!")
                self.assertNotIn("completed", st, f"Error: Account {a.get('clean_acct')} in view {view_name} has status {st}!")
                self.assertNotIn("closed", st, f"Error: Account {a.get('clean_acct')} in view {view_name} has status {st}!")
                self.assertNotIn("cancelled", st, f"Error: Account {a.get('clean_acct')} in view {view_name} has status {st}!")

    def test_archived_closed_pool(self):
        """Verify completed accounts are routed exclusively to archived closed."""
        archived = self.data.get("archived_closed", [])
        self.assertGreater(len(archived), 0, "Error: Archived closed pool is empty!")
        for a in archived:
            self.assertTrue(a.get("is_completed", False), f"Error: Account {a.get('clean_acct')} in archived_closed not marked completed!")

    def test_derisk_purity(self):
        """Verify De-Risk contains only active accounts with Red pulse or At Risk status."""
        derisk = self.data.get("derisk", [])
        for a in derisk:
            self.assertFalse(a.get("is_completed", False), f"Error: Account {a.get('clean_acct')} in De-Risk is completed!")
            pulse = a.get("pulse", "")
            st = str(a.get("status") or "").lower()
            self.assertTrue(pulse == "Red" or "risk" in st or "off trajectory" in st, f"Error: Account {a.get('clean_acct')} in De-Risk has pulse {pulse} and status {st}")

    def test_build_pipeline(self):
        """Verify end to end build data pipeline generates valid artifacts."""
        bundle = build_dashboard_data()
        self.assertIsNotNone(bundle)
        self.assertIn("summary", bundle)
        self.assertIn("workload", bundle)
        self.assertIn("derisk", bundle)
        self.assertIn("archived_closed", bundle)

    def test_bobs_active_portfolio(self):
        """Verify Bob Baughman active accounts are present and zero completed accounts are in his active queue."""
        bobs_active = [a for a in self.data.get("workload", []) if a.get("owner") == "Bob Baughman"]
        self.assertGreater(len(bobs_active), 0, "Error: Bob Baughman has no active accounts!")
        for a in bobs_active:
            self.assertFalse(a.get("is_completed", False), f"Error: Bob active account {a.get('clean_acct')} is marked completed!")

if __name__ == "__main__":
    unittest.main()
