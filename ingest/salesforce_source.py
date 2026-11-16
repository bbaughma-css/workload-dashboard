import os
import glob
import json
import csv
import re
from datetime import datetime

class SalesforceSource:
    def __init__(self, team_csv_path=None, action_plans_csv_path=None):
        self.repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        
        # 1. Flexible Team Overview File Resolution (CSV or HTML Email)
        if team_csv_path and os.path.exists(team_csv_path):
            self.team_csv = team_csv_path
        else:
            candidates = glob.glob(os.path.join(self.repo_root, "data/source/*Team*Account*Overview*.*")) +                          glob.glob(os.path.join(self.repo_root, "data/source/Team_Account_Overview*.*")) +                          glob.glob(os.path.join(self.repo_root, "data/source/*.csv"))
            self.team_csv = candidates[0] if candidates else os.path.join(self.repo_root, "data/source/Team_Account_Overview.csv")

        # 2. Flexible Action Plans File Resolution (CSV or HTML Email)
        if action_plans_csv_path and os.path.exists(action_plans_csv_path):
            self.ww_csv = action_plans_csv_path
        else:
            candidates = glob.glob(os.path.join(self.repo_root, "data/source/*Action*Plan*.*")) +                          glob.glob(os.path.join(self.repo_root, "data/source/WW_Action_Plans*.*"))
            self.ww_csv = candidates[0] if candidates else os.path.join(self.repo_root, "data/source/WW_Action_Plans.csv")

        self.base_snap_path = os.path.join(self.repo_root, "data/history/snapshot-2026-10-22.json")
        self.mapping_path = os.path.join(self.repo_root, "ingest/sfdc_mapping.json")

    def load_rows_from_file(self, file_path):
        """Load structured rows from either CSV or HTML email table format."""
        if not file_path or not os.path.exists(file_path):
            return []
        if file_path.endswith((".html", ".htm")):
            try:
                from bs4 import BeautifulSoup
                with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                    soup = BeautifulSoup(f.read(), "html.parser")
                tables = soup.find_all("table")
                if not tables:
                    return []
                # Pick table with most rows
                target_table = max(tables, key=lambda t: len(t.find_all("tr")))
                rows = target_table.find_all("tr")
                if not rows:
                    return []
                headers = [th.get_text(strip=True) for th in rows[0].find_all(["th", "td"])]
                data = []
                for r in rows[1:]:
                    cells = [c.get_text(strip=True) for c in r.find_all(["td", "th"])]
                    if cells:
                        row_dict = {headers[i] if i < len(headers) else f"col_{i}": cells[i] for i in range(len(cells))}
                        data.append(row_dict)
                return data
            except Exception as e:
                print(f"Error parsing HTML {file_path}: {e}")
                return []
        else:
            with open(file_path, "r", encoding="utf-8-sig", errors="replace") as f:
                return list(csv.DictReader(f))


    def fetch_records(self, as_of_date=None):
        if not as_of_date:
            as_of_date = datetime.now()

        TEAM_MEMBERS = [
            "Bob Baughman", "Jeffery Rosenberg", "Esiquio Uribe",
            "Fabiano Furlan", "Emmanuel Enumegukae", "Tanisha Gordon", "Brijesh Chauhan",
            "Elvis Ourfali", "Matt Bizer", "Stephan Bayer"
        ]

        DERISK_CONFIG = {
            "PRUDENTIAL FINANCIAL": {"owner": "Bob Baughman", "notes": "De-risk and executive retention review. Partnering with account team (Scott Poole, Samantha Brown) to address renewal runway and evaluate active CSW cluster telemetry.", "arr": "$1,420,000", "renewal_qtr": "FY27 Q1"},
            "TRUIST FINANCIAL CORPORATION US": {"owner": "Emmanuel Enumegukae", "notes": "Active CSW cluster deployment onboarding. Addressing telemetry ingestion requirements and policy discovery cadence.", "arr": "$657,624", "renewal_qtr": "FY27 Q1"},
            "GRADY HOSPITAL": {"owner": "Bob Baughman", "notes": "Active de-risk technical assistance. Partnering with SecOps on agent health and cluster telemetry monitoring.", "arr": "$280,000", "renewal_qtr": "FY27 Q2"},
            "IL-STATE OF ILLINOIS DEPARTMENT OF INNOVATION AND TECHNOLOGY": {"owner": "Bob Baughman", "notes": "De-risk technical review. Working with DoIT architecture leads on enterprise cluster stability and policy validation.", "arr": "$540,000", "renewal_qtr": "FY26 Q4"},
            "PRINCIPAL FINANCIAL GROUP INC US": {"owner": "Bob Baughman", "notes": "Technical engagement and policy modeling review across hybrid infrastructure.", "arr": "$320,000", "renewal_qtr": "FY27 Q2"},
            "MEDAVIE INC": {"owner": "Tanisha Gordon", "notes": "Customer requested cancellation. CSW cluster offline. Account team aligning on retention options.", "arr": "$180,000", "renewal_qtr": "FY26 Q4"},
            "FIRST FINANCIAL CORPORATION": {"owner": "Tanisha Gordon", "notes": "Renewal risk identified. Lack of customer resource allocation for policy management.", "arr": "$150,000", "renewal_qtr": "FY27 Q1"},
            "GREAT NORTHERN CORPORATION": {"owner": "Tanisha Gordon", "notes": "Critical escalation regarding agent compatibility during OS upgrade cycle.", "arr": "$210,000", "renewal_qtr": "FY27 Q1"},
            "AMERICAN EXPRESS COMPANY US": {"owner": "Tanisha Gordon", "notes": "Security team evaluating alternative vendor tooling. Renewal at risk in FY27 Q2.", "arr": "$850,000", "renewal_qtr": "FY27 Q2"},
            "TRAVELPORT HOLDINGS LTD US": {"owner": "Tanisha Gordon", "notes": "Executive turnover in SecOps leadership. Stalled deployment cadence.", "arr": "$310,000", "renewal_qtr": "FY27 Q1"}
        }

        sfdc_acct_map = {}
        sfdc_plan_map = {}
        if os.path.exists(self.mapping_path):
            try:
                with open(self.mapping_path, "r", encoding="utf-8") as f:
                    m = json.load(f)
                    sfdc_acct_map = m.get("accounts", {})
                    sfdc_plan_map = m.get("plans", {})
            except Exception as e:
                print(f"Warning: could not load sfdc_mapping.json: {e}")

        base_snap = {}
        if os.path.exists(self.base_snap_path):
            try:
                with open(self.base_snap_path, "r", encoding="utf-8") as f:
                    base_snap = json.load(f)
            except Exception as e:
                print(f"Warning: could not load base snapshot: {e}")

        base_workload = base_snap.get("workload", [])
        base_derisk = base_snap.get("derisk", [])

        def normalize_name(n):
            if not n:
                return ""
            if "elvis" in n.lower() or "ourfali" in n.lower():
                return "Elvis Ourfali"
            if "baughman" in n.lower():
                return "Bob Baughman"
            if "rosenberg" in n.lower():
                return "Jeffery Rosenberg"
            if "schaffner" in n.lower():
                return "Miranda Schaffner"
            if "uribe" in n.lower():
                return "Esiquio Uribe"
            if "furlan" in n.lower():
                return "Fabiano Furlan"
            if "enumegukae" in n.lower():
                return "Emmanuel Enumegukae"
            if "gordon" in n.lower():
                return "Tanisha Gordon"
            if "chauhan" in n.lower():
                return "Brijesh Chauhan"
            if "bizer" in n.lower():
                return "Matt Bizer"
            if "stumpe" in n.lower():
                return "Nathan Stumpe"
            return n

        def parse_arr(val):
            if val is None:
                return 0.0
            if isinstance(val, (int, float)):
                return float(val)
            s = str(val).replace("$", "").replace(",", "").strip()
            try:
                return float(s)
            except:
                return 0.0

        def format_quarter(fq_str):
            if not fq_str:
                return "FY27 Q1"
            s = str(fq_str).upper().strip()
            if "FY" in s:
                m = re.search(r"FY(\d{2})[ -]?Q([1-4])", s)
                if m:
                    return f"FY{m.group(1)} Q{m.group(2)}"
            if "202" in s:
                m = re.search(r"20(\d{2})[ -]?Q([1-4])", s)
                if m:
                    return f"FY{m.group(1)} Q{m.group(2)}"
            return "FY27 Q1"

        def determine_plan_type(plan_name, status):
            p_low = (plan_name or "").lower()
            st_low = (status or "").lower()
            if "adopt" in p_low or "adopt" in st_low:
                return "Adoption"
            if "onboard" in p_low or "onboard" in st_low or "implement" in st_low:
                return "Onboarding"
            return "Onboarding"

        def enrich_sfdc_links(item):
            clean = (item.get("clean_acct") or item.get("account_name") or "").strip()
            clean_up = clean.upper()
            raw_nm = (item.get("account_name") or "").upper().strip()

            sfdc_acct_id = ""
            if clean_up in sfdc_acct_map:
                sfdc_acct_id = sfdc_acct_map[clean_up]
            elif raw_nm in sfdc_acct_map:
                sfdc_acct_id = sfdc_acct_map[raw_nm]
            elif item.get("account_id") and str(item.get("account_id")).startswith("001"):
                sfdc_acct_id = str(item.get("account_id"))
            elif item.get("sfdc_account_id") and str(item.get("sfdc_account_id")).startswith("001"):
                sfdc_acct_id = str(item.get("sfdc_account_id"))

            item["sfdc_account_id"] = sfdc_acct_id
            if sfdc_acct_id and sfdc_acct_id.startswith("001"):
                item["sfdc_account_url"] = f"https://ciscosales.lightning.force.com/lightning/r/Account/{sfdc_acct_id}/view"
            else:
                item["sfdc_account_url"] = "https://ciscosales.lightning.force.com/lightning/o/Account/list?filterName=Recent"

            sfdc_plan_id = ""
            if item.get("id") and (str(item.get("id")).startswith("aGt") or str(item.get("id")).startswith("aIC")):
                sfdc_plan_id = str(item.get("id"))
            elif item.get("sfdc_plan_id") and (str(item.get("sfdc_plan_id")).startswith("aGt") or str(item.get("sfdc_plan_id")).startswith("aIC")):
                sfdc_plan_id = str(item.get("sfdc_plan_id"))
            elif clean_up in sfdc_plan_map:
                sfdc_plan_id = sfdc_plan_map[clean_up]
            elif raw_nm in sfdc_plan_map:
                sfdc_plan_id = sfdc_plan_map[raw_nm]

            item["sfdc_plan_id"] = sfdc_plan_id
            if sfdc_plan_id and sfdc_plan_id.startswith("aIC"):
                if sfdc_acct_id and sfdc_acct_id.startswith("001"):
                    item["sfdc_plan_url"] = f"https://ciscosales.lightning.force.com/lightning/r/C360_Mitigation_Action_Plan__c/{sfdc_plan_id}/view?ws=%2Flightning%2Fr%2FAccount%2F{sfdc_acct_id}%2Fview"
                else:
                    item["sfdc_plan_url"] = f"https://ciscosales.lightning.force.com/lightning/r/C360_Mitigation_Action_Plan__c/{sfdc_plan_id}/view"
            elif sfdc_plan_id and sfdc_plan_id.startswith("aGt"):
                if sfdc_acct_id and sfdc_acct_id.startswith("001"):
                    item["sfdc_plan_url"] = f"https://ciscosales.lightning.force.com/lightning/r/C360_CS_Task__c/{sfdc_plan_id}/view?ws=%2Flightning%2Fr%2FAccount%2F{sfdc_acct_id}%2Fview"
                else:
                    item["sfdc_plan_url"] = f"https://ciscosales.lightning.force.com/lightning/r/C360_CS_Task__c/{sfdc_plan_id}/view"
            else:
                item["sfdc_plan_url"] = ""

            return item

        # 1. Load WW Action Plans CSV (Granular task items)
        ww_map = {}
        if os.path.exists(self.ww_csv):
            with open(self.ww_csv, "r", encoding="utf-8-sig", errors="replace") as f:
                reader = csv.DictReader(f)
                for r in reader:
                    rec_id = r.get("Record ID", "").strip()
                    if not rec_id:
                        continue
                    if rec_id not in ww_map:
                        ww_map[rec_id] = []
                    ww_map[rec_id].append({
                        "action": r.get("Action", "").strip(),
                        "status": r.get("Status", "").strip(),
                        "notes": r.get("Notes", "").strip(),
                        "last_modified": r.get("Last Modified Date", "").strip(),
                        "created": r.get("Created Date", "").strip()
                    })

        # 2. Load Team Account Overview CSV
        active_cps_map = {}
        archived_closed_map = {}

        if os.path.exists(self.team_csv):
            with open(self.team_csv, "r", encoding="utf-8-sig", errors="replace") as f:
                reader = csv.reader(f)
                r_list = list(reader)

            if len(r_list) > 1:
                headers = [h.strip() for h in r_list[0]]
                h_map = {h: i for i, h in enumerate(headers)}

                for r in r_list[1:]:
                    if not any(r):
                        continue
                    def g(*col_names):
                        for cn in col_names:
                            if cn in h_map and h_map[cn] < len(r):
                                val = r[h_map[cn]].strip()
                                if val:
                                    return val
                        return ""

                    rec_id = g("Record ID", "C360 CS Task ID")
                    raw_owner = g("Plan Owner", "Owner")
                    norm_owner = normalize_name(raw_owner)
                    plan_name = g("Name", "Plan Name").replace("?", "-").replace("—", "-").replace("–", "-").strip()
                    status = g("Status")
                    pulse_raw = g("C360 Action Plan Customer Pulse Junction : Customer Pulse Name : Customer Pulse", "Customer Pulse")
                    pulse_comments = g("C360 Action Plan Customer Pulse Junction : Customer Pulse Name : Comments", "Comments")
                    acct_id = g("Account ID", "Account Id", "SFDC Account ID")
                    acct_name = g("Account Name")
                    arr_val = g("Total Program ARR (converted)", "Total Program ARR")
                    next_act = g("Next Action")
                    last_mod_str = g("Last Modified Date")
                    created_str = g("Created Date")
                    product_milestone = g("C360 Action Plan Customer Pulse Junction : Customer Pulse Name : Product")

                    clean_acct = re.sub(r"^(BU\s*-\s*|CA\s*-\s*|US\s*-\s*)", "", acct_name, flags=re.I).strip()
                    clean_acct = re.sub(r"\s+(US|BR|CA|LTD|INC|CORP|LLC)$", "", clean_acct, flags=re.I).strip()

                    days_since_touch = 0
                    if last_mod_str:
                        for fmt in ["%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y"]:
                            try:
                                d = datetime.strptime(last_mod_str.split()[0], fmt)
                                days_since_touch = max(0, (as_of_date - d).days)
                                break
                            except:
                                pass

                    days_open = 0
                    if created_str:
                        for fmt in ["%m/%d/%Y", "%Y-%m-%d", "%m/%d/%y"]:
                            try:
                                d = datetime.strptime(created_str.split()[0], fmt)
                                days_open = max(0, (as_of_date - d).days)
                                break
                            except:
                                pass

                    action_items = ww_map.get(rec_id, [])
                    step_notes = []
                    for ai in action_items:
                        if ai["notes"]:
                            step_notes.append(f"[{ai['action']} - {ai['status']}]:\n{ai['notes']}")

                    full_operational_notes = pulse_comments
                    if step_notes:
                        if full_operational_notes:
                            full_operational_notes = full_operational_notes + "\n\n" + "\n\n".join(step_notes)
                        else:
                            full_operational_notes = "\n\n".join(step_notes)

                    pulse_clean = "Green"
                    if "yellow" in pulse_raw.lower() or "yellow" in pulse_comments.lower():
                        pulse_clean = "Yellow"
                    elif "red" in pulse_raw.lower() or "red" in pulse_comments.lower():
                        pulse_clean = "Red"
                    elif "green" in pulse_raw.lower():
                        pulse_clean = "Green"

                    is_completed = "completed" in status.lower() or "closed" in status.lower() or "cancelled" in status.lower()
                    is_unsuccessful = "unsuccessful" in status.lower()

                    plan_type_slug = "cps" if "cloud protection" in plan_name.lower() else "csw"
                    unique_key = f"{rec_id}_{plan_type_slug}"

                    plan_type = determine_plan_type(plan_name, status)

                    item = {
                        "id": rec_id,
                        "clean_acct": clean_acct,
                        "account_name": acct_name,
                        "plan_name": plan_name,
                        "plan_type": plan_type,
                        "owner": norm_owner,
                        "status": status,
                        "pulse": pulse_clean,
                        "customer_pulse_comments": pulse_comments,
                        "action_item_notes": step_notes,
                        "combined_notes": full_operational_notes,
                        "comments": full_operational_notes or pulse_comments or "Active engagement in progress.",
                        "notes": full_operational_notes or pulse_comments or "Active engagement in progress.",
                        "next_action": next_act,
                        "arr": parse_arr(arr_val),
                        "arr_num": parse_arr(arr_val),
                        "arr_formatted": f"${int(parse_arr(arr_val)):,}" if parse_arr(arr_val) > 0 else "$0",
                        "account_id": acct_id,
                        "last_modified": last_mod_str,
                        "created_date": created_str,
                        "days_since_touch": days_since_touch,
                        "days_open": days_open,
                        "is_unsuccessful": is_unsuccessful,
                        "is_completed": is_completed,
                        "action_items": action_items,
                        "product_milestone": product_milestone,
                        "renewal_quarter": "FY27 Q1",
                        "stage": "Implement" if "implement" in status.lower() else "Onboard"
                    }
                    item = enrich_sfdc_links(item)

                    if is_completed:
                        archived_closed_map[unique_key] = item
                    else:
                        active_cps_map[unique_key] = item

        active_cps_list = list(active_cps_map.values())
        archived_closed_list = list(archived_closed_map.values())

        active_workload_list = []
        for w in base_workload:
            st_low = (w.get("status") or "").lower()
            p_name = w.get("plan_name") or ""
            if "completed" in st_low or "closed" in st_low or "cancelled" in st_low or "unsuccessful" in st_low:
                w_item = dict(w)
                w_item["is_completed"] = True
                w_item["is_unsuccessful"] = "unsuccessful" in st_low
                w_item["plan_type"] = determine_plan_type(p_name, w.get("status"))
                archived_closed_list.append(w_item)
            else:
                w_item = dict(w)
                w_item["arr_num"] = parse_arr(w_item.get("arr"))
                w_item["arr_formatted"] = w_item.get("arr") if "$" in str(w_item.get("arr")) else f"${int(parse_arr(w_item.get('arr'))):,}"
                w_item["days_since_touch"] = 12
                w_item["days_open"] = 94
                w_item["plan_type"] = determine_plan_type(p_name, w.get("status"))
                w_item = enrich_sfdc_links(w_item)
                active_workload_list.append(w_item)

        derisk_records = []
        for d in base_derisk:
            clean = d.get("clean_acct") or d.get("account_name") or ""
            clean = clean.replace("BU - ", "").replace("LEGACY - ", "").strip()
            clean_norm = clean.upper()

            cfg = DERISK_CONFIG.get(clean_norm, {})
            owner = cfg.get("owner") or normalize_name(d.get("owner"))
            notes = cfg.get("notes") or d.get("comments")
            arr_val = cfg.get("arr") or d.get("arr") or "$0"
            ren_qtr = cfg.get("renewal_qtr") or format_quarter(d.get("renewal_quarter"))

            rec = dict(d)
            rec["clean_acct"] = clean
            rec["owner"] = owner
            rec["comments"] = notes
            rec["notes"] = notes
            rec["arr"] = arr_val
            rec["arr_num"] = parse_arr(arr_val)
            rec["arr_formatted"] = arr_val
            rec["renewal_quarter"] = ren_qtr
            rec["days_since_touch"] = 8
            rec["days_open"] = 112
            rec["pulse"] = "Red"
            rec["is_derisk"] = True
            rec["plan_type"] = "Adoption" if "adopt" in (rec.get("plan_name") or "").lower() else "Onboarding"
            rec = enrich_sfdc_links(rec)
            derisk_records.append(rec)

        aging_onboarding_list = []
        for item in active_cps_list + active_workload_list:
            st_low = (item.get("status") or "").lower()
            p_low = (item.get("plan_name") or "").lower()
            if "onboard" in st_low or "onboard" in p_low or "implement" in st_low or "track" in st_low:
                aging_onboarding_list.append(item)

        renewals_list = []
        for item in active_cps_list + active_workload_list + derisk_records:
            renewals_list.append({
                "clean_acct": item.get("clean_acct"),
                "account_name": item.get("account_name"),
                "id": item.get("id"),
                "owner": item.get("owner"),
                "status": item.get("status"),
                "pulse": item.get("pulse"),
                "arr": item.get("arr_formatted") or item.get("arr"),
                "arr_num": item.get("arr_num", 0),
                "renewal_quarter": item.get("renewal_quarter") or "FY27 Q1",
                "comments": item.get("comments") or item.get("notes"),
                "sfdc_account_url": item.get("sfdc_account_url"),
                "sfdc_plan_url": item.get("sfdc_plan_url")
            })

        notes_gov_list = active_cps_list + active_workload_list + derisk_records

        issues_list = []
        for a in active_cps_list + active_workload_list:
            if not a.get("pulse") or a.get("pulse") == "None":
                issues_list.append({
                    "severity": "MEDIUM",
                    "type": "Missing Pulse",
                    "account": a.get("clean_acct") or a.get("account_name"),
                    "owner": a.get("owner"),
                    "action": "Link Customer Pulse status in C360",
                    "account_id": a.get("account_id"),
                    "id": a.get("id"),
                    "sfdc_account_url": a.get("sfdc_account_url"),
                    "sfdc_plan_url": a.get("sfdc_plan_url")
                })
            elif a.get("pulse") == "Red":
                issues_list.append({
                    "severity": "HIGH",
                    "type": "Red Customer Pulse",
                    "account": a.get("clean_acct") or a.get("account_name"),
                    "owner": a.get("owner"),
                    "action": "Review De-Risk engagement and executive cadence",
                    "account_id": a.get("account_id"),
                    "id": a.get("id"),
                    "sfdc_account_url": a.get("sfdc_account_url"),
                    "sfdc_plan_url": a.get("sfdc_plan_url")
                })
            elif (a.get("days_since_touch") or 0) > 28:
                issues_list.append({
                    "severity": "HIGH",
                    "type": "Stalled Governance (>28d)",
                    "account": a.get("clean_acct") or a.get("account_name"),
                    "owner": a.get("owner"),
                    "action": f"Account untouched for {a.get('days_since_touch')} days - log update in C360",
                    "account_id": a.get("account_id"),
                    "id": a.get("id"),
                    "sfdc_account_url": a.get("sfdc_account_url"),
                    "sfdc_plan_url": a.get("sfdc_plan_url")
                })

        all_active = active_cps_list + active_workload_list
        people_stats = []
        for member in TEAM_MEMBERS:
            m_cps = [a for a in active_cps_list if a["owner"] == member]
            m_workload = [a for a in active_workload_list if a["owner"] == member]
            m_all = m_cps + m_workload
            
            total_accts = len(m_all)
            arr_total = sum(a.get("arr_num", 0.0) for a in m_all)
            
            onboard_cnt = sum(1 for a in m_all if a.get("plan_type") == "Onboarding")
            adopt_cnt = sum(1 for a in m_all if a.get("plan_type") == "Adoption")
            succ_cnt = sum(1 for a in archived_closed_list if a["owner"] == member and "successful" in (a.get("status") or "").lower() and "unsuccessful" not in (a.get("status") or "").lower())
            derisk_cnt = sum(1 for a in derisk_records if a["owner"] == member)
            red_cnt = sum(1 for a in m_all if a.get("pulse") == "Red")
            
            cap_score = round(onboard_cnt * 1.0 + adopt_cnt * 1.25 + derisk_cnt * 1.5 + red_cnt * 0.5, 2)
            arr_m = f"${arr_total / 1_000_000:.2f}M" if arr_total >= 1_000_000 else f"${int(arr_total):,}"
            
            people_stats.append({
                "name": member,
                "total_accounts": total_accts,
                "total_arr": arr_m,
                "total_arr_num": arr_total,
                "cps_count": len(m_cps),
                "workload_count": len(m_workload),
                "onboarding_count": onboard_cnt,
                "adoption_count": adopt_cnt,
                "completed_successful_count": succ_cnt,
                "derisk_count": derisk_cnt,
                "red_pulse_count": red_cnt,
                "capacity_score": cap_score
            })

        return {
            "as_of_date": as_of_date.strftime("%Y-%m-%d"),
            "summary": {
                "total_accounts": len(active_cps_list) + len(active_workload_list),
                "total_arr": sum(p.get("arr", 0) for p in active_cps_list) + sum(parse_arr(w.get("arr", 0)) for w in active_workload_list),
                "active_onboarding": sum(1 for p in active_cps_list if p.get("plan_type") == "Onboarding"),
                "active_adoption": sum(1 for p in active_cps_list if p.get("plan_type") == "Adoption"),
                "derisk_count": len(derisk_records),
                "archived_count": len(archived_closed_list)
            },
            "cps": active_cps_list,
            "workload": active_workload_list,
            "derisk": derisk_records,
            "aging_onboarding": aging_onboarding_list,
            "renewals": renewals_list,
            "notes_governance": notes_gov_list,
            "archived_unsuccessful": archived_closed_list,
            "issues": issues_list,
            "people": people_stats
        }
