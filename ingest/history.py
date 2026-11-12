import os
import json
from datetime import datetime

class SnapshotHistory:
    def __init__(self, workspace_root=None):
        self.workspace_root = workspace_root or os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.history_dir = os.path.join(self.workspace_root, "data", "history")
        os.makedirs(self.history_dir, exist_ok=True)

    def save_snapshot(self, data, date_str=None):
        if not date_str:
            date_str = datetime.now().strftime("%Y-%m-%d")
        file_path = os.path.join(self.history_dir, f"snapshot-{date_str}.json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return file_path
