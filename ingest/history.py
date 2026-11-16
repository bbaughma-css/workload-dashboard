import os
import json
from datetime import datetime

class SnapshotHistory:
    def __init__(self, history_dir=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data/history")):
        self.history_dir = history_dir
        os.makedirs(self.history_dir, exist_ok=True)

    def save_snapshot(self, data, date_str=None):
        if not date_str:
            date_str = datetime.now().strftime("%Y-%m-%d")
        file_path = os.path.join(self.history_dir, f"snapshot-{date_str}.json")
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        return file_path

    def get_latest_snapshots(self):
        files = sorted([f for f in os.listdir(self.history_dir) if f.startswith("snapshot-") and f.endswith(".json")])
        if len(files) < 2:
            return None, (os.path.join(self.history_dir, files[0]) if files else None)
        return os.path.join(self.history_dir, files[-2]), os.path.join(self.history_dir, files[-1])

    def detect_changes(self, old_data, new_data):
        changes = []
        if not old_data or not new_data:
            return changes

        old_cps_map = {item.get("id") or item.get("accountKey"): item for item in old_data.get("cps", [])}
        new_cps_map = {item.get("id") or item.get("accountKey"): item for item in new_data.get("cps", [])}

        # Check for status or owner changes in CPS
        for key, new_item in new_cps_map.items():
            if key not in old_cps_map:
                changes.append({
                    "type": "NEW_ACCOUNT",
                    "account": new_item.get("account_name"),
                    "owner": new_item.get("owner"),
                    "details": f"Net new CPS account assigned to {new_item.get('owner')}"
                })
            else:
                old_item = old_cps_map[key]
                if old_item.get("owner") != new_item.get("owner"):
                    changes.append({
                        "type": "REASSIGNMENT",
                        "account": new_item.get("account_name"),
                        "old_owner": old_item.get("owner"),
                        "new_owner": new_item.get("owner"),
                        "details": f"Reassigned from {old_item.get('owner')} to {new_item.get('owner')}"
                    })
                if old_item.get("status") != new_item.get("status"):
                    changes.append({
                        "type": "STATUS_CHANGE",
                        "account": new_item.get("account_name"),
                        "old_status": old_item.get("status"),
                        "new_status": new_item.get("status"),
                        "details": f"Status shifted from {old_item.get('status')} to {new_item.get('status')}"
                    })
                if old_item.get("pulse") != new_item.get("pulse"):
                    changes.append({
                        "type": "PULSE_SHIFT",
                        "account": new_item.get("account_name"),
                        "old_pulse": old_item.get("pulse"),
                        "new_pulse": new_item.get("pulse"),
                        "details": f"Pulse changed from {old_item.get('pulse')} to {new_item.get('pulse')}"
                    })

        return changes
