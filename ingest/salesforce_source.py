import os
import json
import csv
import re
from datetime import datetime

TEAM_MEMBERS = {
    "Bob Baughman", "Emmanuel Enumegukae", "Tanisha Gordon", "Todd Sleeme",
    "Jacob Gray", "Laura Carder", "Andrea Mink", "Stephan Bayer",
    "Tonya Farinha", "Ben Meyer"
}

def normalize_name(raw_name):
    if not raw_name:
        return ""
    name_clean = raw_name.strip()
    for tm in TEAM_MEMBERS:
        if tm.lower() in name_clean.lower() or name_clean.lower() in tm.lower():
            return tm
    return name_clean

class SalesforceSource:
    def __init__(self, workspace_root=None):
        self.workspace_root = workspace_root or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.data_file = os.path.join(self.workspace_root, "data", "dashboard-data.json")
        self.mapping_file = os.path.join(self.workspace_root, "ingest", "sfdc_mapping.json")
        self.raw_dir = os.path.join(self.workspace_root, "data", "raw")

    def build_dataset(self):
        data = {"cps": [], "workload": [], "notes_governance": [], "derisk": []}
        if os.path.exists(self.data_file):
            with open(self.data_file, "r", encoding="utf-8") as f:
                data = json.load(f)

        # Check for any new CSV in data/raw/
        if os.path.exists(self.raw_dir):
            raw_csvs = sorted([os.path.join(self.raw_dir, f) for f in os.listdir(self.raw_dir) if f.endswith(".csv")], reverse=True)
            if raw_csvs:
                latest_csv = raw_csvs[0]
                print(f"Ingesting latest raw CSV: {latest_csv}")

        return data
