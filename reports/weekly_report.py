import os
import sys
import json
import argparse
from datetime import datetime

def generate_weekly_report(data_path=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data/dashboard-data.json"), css_filter=None, out_dir=os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")):
    os.makedirs(out_dir, exist_ok=True)
    if not os.path.exists(data_path):
        raise FileNotFoundError(f"Data file not found at {data_path}")

    with open(data_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    cps_plans = data.get("cps", [])
    workload_plans = data.get("workload", [])
    people = data.get("people", [])
    changes = data.get("changes", [])

    if css_filter:
        cps_plans = [p for p in cps_plans if p.get("owner") == css_filter]
        workload_plans = [p for p in workload_plans if p.get("owner") == css_filter]
        people = [p for p in people if p.get("name") == css_filter]

    # Generate Markdown Report
    title = f"Weekly Account Governance Report {'- ' + css_filter if css_filter else '(All Specialists)'}"
    md_content = f"# {title}\n"
    md_content += f"**As of:** {datetime.now().strftime('%Y-%m-%d')} | **Distribution:** Bob Baughman & Nathan Stumpe\n\n"

    md_content += "## 1. Executive Summary\n"
    md_content += f"- **Total Action Plans Audited:** {len(cps_plans) + len(workload_plans)}\n"
    md_content += f"- **CPS Action Plans:** {len(cps_plans)}\n"
    md_content += f"- **Workload Plans:** {len(workload_plans)}\n"
    md_content += f"- **Critical Red Pulses:** {len([p for p in cps_plans if p.get('pulse') == 'Red'])}\n"
    md_content += f"- **De-Risk Accounts:** {len([p for p in cps_plans if p.get('is_derisk')])}\n\n"

    md_content += "## 2. Specialist Capacity Overview\n\n"
    md_content += "| Specialist | Leader | CPS Plans | Workload Plans | De-Risk | Red Pulses | Capacity Score |\n"
    md_content += "| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n"
    for p in people:
        md_content += f"| **{p.get('name')}** | {p.get('leader')} | {p.get('cps_count')} | {p.get('workload_count')} | {p.get('derisk_count')} | {p.get('red_pulse_count')} | **{p.get('capacity_score')}** |\n"

    if changes:
        md_content += "\n## 3. Changes Since Last Refresh\n"
        for ch in changes:
            md_content += f"- **{ch.get('type')}:** {ch.get('account')} ({ch.get('details')})\n"

    md_file = os.path.join(out_dir, f"weekly_report_{css_filter.replace(' ', '_') if css_filter else 'team'}.md")
    with open(md_file, "w", encoding="utf-8") as f:
        f.write(md_content)

    print(f"Generated weekly markdown report: {md_file}")
    return md_file

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--css", help="Filter by CSS Specialist name")
    args = parser.parse_args()
    generate_weekly_report(css_filter=args.css)
