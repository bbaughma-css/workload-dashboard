import os
import sys
import json
import re
from datetime import datetime

current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

from salesforce_source import SalesforceSource
from history import SnapshotHistory

def build_dashboard_data(output_dir=None):
    if output_dir is None:
        output_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    print("=== INGESTING & BUILDING DASHBOARD DATA ===")
    
    # 1. Fetch raw canonical records from source
    source = SalesforceSource()
    raw_data = source.fetch_records()
    
    # SAFETY GUARD: Ensure dataset is never empty
    if not raw_data or len(raw_data.get("renewals", [])) < 50:
        print("WARNING: Ingest returned fewer than 50 records. Falling back to cached dashboard-data.json...")
        cached_json = os.path.join(output_dir, "data/dashboard-data.json")
        if os.path.exists(cached_json):
            with open(cached_json, "r", encoding="utf-8") as f:
                raw_data = json.load(f)
                
    if not raw_data or len(raw_data.get("renewals", [])) < 50:
        raise ValueError("FATAL: Ingestion failed and no valid data cache available. Aborting build to protect live data.")

    # 2. History & Change Detection
    history = SnapshotHistory(os.path.join(output_dir, "data/history"))
    old_snap_path, new_snap_path = history.get_latest_snapshots()
    
    old_data = None
    if old_snap_path and os.path.exists(old_snap_path):
        try:
            with open(old_snap_path, "r", encoding="utf-8") as f:
                old_data = json.load(f)
        except Exception as e:
            print("Warning: Could not load old snapshot " + str(old_snap_path) + ": " + str(e))
            
    changes = history.detect_changes(old_data, raw_data)
    raw_data["changes"] = changes
    
    # Save today's snapshot
    snapshot_file = history.save_snapshot(raw_data)
    print("Saved snapshot to " + str(snapshot_file))
    
    # 3. Save JSON
    json_path = os.path.join(output_dir, "data/dashboard-data.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(raw_data, f, indent=2)
    print("Wrote normalized data to " + str(json_path))
    
    # 4. Save app/data.js
    data_js_path = os.path.join(output_dir, "app/data.js")
    with open(data_js_path, "w", encoding="utf-8") as f:
        f.write("window.DASHBOARD_DATA = " + json.dumps(raw_data, indent=2) + ";\n")
    print("Wrote frontend data bundle to " + str(data_js_path))
    
    # 5. Compile single-file dist/workload-dashboard.html and root index.html
    bundle_single_file(output_dir, raw_data)
    
    return raw_data

def bundle_single_file(output_dir, data):
    app_dir = os.path.join(output_dir, "app")
    dist_dir = os.path.join(output_dir, "dist")
    os.makedirs(dist_dir, exist_ok=True)

    with open(os.path.join(app_dir, "index.html"), "r", encoding="utf-8") as f:
        html = f.read()
    with open(os.path.join(app_dir, "styles.css"), "r", encoding="utf-8") as f:
        css = f.read()
    with open(os.path.join(app_dir, "app.js"), "r", encoding="utf-8") as f:
        js = f.read()

    # Inline CSS
    css_block = "<style>\n" + css + "\n</style>"
    html = re.sub(r'<link[^>]*stylesheet[^>]*>', lambda m: css_block, html, count=1)

    # Inline Data & JS
    data_json_str = json.dumps(data)
    scripts_block = "<script>\nwindow.DASHBOARD_DATA = " + data_json_str + ";\n</script>\n  <script>\n" + js + "\n</script>"
    html = re.sub(r'<script[^>]*data\.js[^>]*>.*?</script>\s*<script[^>]*app\.js[^>]*>.*?</script>', lambda m: scripts_block, html, flags=re.DOTALL)

    # Write dist/workload-dashboard.html
    dist_file = os.path.join(dist_dir, "workload-dashboard.html")
    with open(dist_file, "w", encoding="utf-8") as f:
        f.write(html)
    print("Successfully generated standalone bundle: " + str(dist_file) + " (" + str(len(html)) + " bytes)")

    
    # Ironclad Safety Check: Verify compiled HTML integrity before writing
    if len(html) < 500000 or "window.DASHBOARD_DATA" not in html or '"renewals"' not in html:
        print("ERROR: Generated HTML failed integrity check (too small or missing data). Aborting to preserve working index.html.")
        return dist_file

    # Write root index.html for GitHub Pages hosting
    root_index = os.path.join(output_dir, "index.html")
    with open(root_index, "w", encoding="utf-8") as f:
        f.write(html)
    print("Successfully updated root index.html for GitHub Pages: " + str(root_index))

    return dist_file

if __name__ == "__main__":
    build_dashboard_data()
