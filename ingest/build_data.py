import os
import sys
import json
import re

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INGEST_DIR = os.path.join(BASE_DIR, "ingest")
sys.path.insert(0, INGEST_DIR)

from salesforce_source import SalesforceSource
from history import SnapshotHistory

def build_dashboard_data(workspace_root=None):
    base_dir = workspace_root or BASE_DIR
    print("=== INGESTING & BUILDING DASHBOARD DATA ===")
    
    source = SalesforceSource(base_dir)
    data = source.build_dataset()
    
    history_mgr = SnapshotHistory(base_dir)
    history_mgr.save_snapshot(data)
    
    out_json = os.path.join(base_dir, "data", "dashboard-data.json")
    os.makedirs(os.path.dirname(out_json), exist_ok=True)
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Wrote normalized data to {out_json}")
    
    index_path = os.path.join(base_dir, "index.html")
    if os.path.exists(index_path):
        with open(index_path, "r", encoding="utf-8") as f:
            html = f.read()
        
        data_json_str = json.dumps(data)
        new_html = re.sub(
            r'window\.DASHBOARD_DATA\s*=\s*\{.*?\};',
            f'window.DASHBOARD_DATA = {data_json_str};',
            html,
            flags=re.DOTALL
        )
        with open(index_path, "w", encoding="utf-8") as f:
            f.write(new_html)
        print("Successfully updated index.html with latest dashboard data!")
        
    return data

if __name__ == "__main__":
    build_dashboard_data()
