import os
import sys
import json
import shutil
from datetime import datetime

# Path resolution
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INGEST_DIR = os.path.join(BASE_DIR, "ingest")
DATA_DIR = os.path.join(BASE_DIR, "data")
APP_DIR = os.path.join(BASE_DIR, "app")
DIST_DIR = os.path.join(BASE_DIR, "dist")

sys.path.insert(0, INGEST_DIR)
from salesforce_source import SalesforceSource
from history import SnapshotHistory

def build_dashboard_data(workspace_root=None):
    base_dir = workspace_root or BASE_DIR
    print("=== INGESTING & BUILDING DASHBOARD DATA ===")
    
    source = SalesforceSource(base_dir)
    data = source.build_dataset()
    
    # Save daily history snapshot
    history_mgr = SnapshotHistory(base_dir)
    history_mgr.save_snapshot(data)
    
    # Save normalized data json
    out_json = os.path.join(base_dir, "data", "dashboard-data.json")
    os.makedirs(os.path.dirname(out_json), exist_ok=True)
    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    print(f"Wrote normalized data to {out_json}")
    
    # Generate standalone index.html
    generate_dist_bundle(base_dir, data)
    return data

def generate_dist_bundle(base_dir, data):
    dist_dir = os.path.join(base_dir, "dist")
    os.makedirs(dist_dir, exist_ok=True)
    
    # Load app files
    app_html_path = os.path.join(base_dir, "app", "index.html")
    app_css_path = os.path.join(base_dir, "app", "styles.css")
    app_js_path = os.path.join(base_dir, "app", "app.js")
    
    with open(app_html_path, "r", encoding="utf-8") as f:
        html = f.read()
    with open(app_css_path, "r", encoding="utf-8") as f:
        css = f.read()
    with open(app_js_path, "r", encoding="utf-8") as f:
        js = f.read()
        
    data_json_str = json.dumps(data)
    
    # Replace stylesheets and scripts with inline content
    html = html.replace('<link rel="stylesheet" href="styles.css">', f"<style>
{css}
</style>")
    html = html.replace('<script src="data.js"></script>', f"<script>
window.DASHBOARD_DATA = {data_json_str};
</script>")
    html = html.replace('<script src="app.js"></script>', f"<script>
{js}
</script>")
    
    out_dist = os.path.join(dist_dir, "workload-dashboard.html")
    with open(out_dist, "w", encoding="utf-8") as f:
        f.write(html)
        
    # Also overwrite root index.html for GitHub Pages
    root_index = os.path.join(base_dir, "index.html")
    with open(root_index, "w", encoding="utf-8") as f:
        f.write(html)
    print(f"Successfully generated standalone bundle: {out_dist}")

if __name__ == "__main__":
    build_dashboard_data()
