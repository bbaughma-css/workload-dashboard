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

        # 3. Workload (CSW) Portfolio Source
        self.csw_snapshot = os.path.join(self.repo_root, "data/history/snapshot-2026-11-16.json")

    def fetch_records(self, as_of_date=None):
        if not as_of_date:
            as_of_date = datetime.now()

        TEAM_MEMBERS = [
            "Bob Baughman", "Jeffery Rosenberg", "Esiquio Uribe",
            "Fabiano Furlan", "Emmanuel Enumegukae", "Tanisha Gordon", "Brijesh Chauhan",
            "Elvis Ourfali", "Matt Bizer", "Stephan Bayer"
        ]

        def normalize_name(n):
            if not n:
                return "Unassigned"
            n_low = n.lower()
            if "baughman" in n_low or "bobby" in n_low:
                return "Bob Baughman"
            if "rosenberg" in n_low:
                return "Jeffery Rosenberg"
            if "uribe" in n_low:
                return "Esiquio Uribe"
            if "furlan" in n_low:
                return "Fabiano Furlan"
            if "enumegukae" in n_low:
                return "Emmanuel Enumegukae"
            if "gordon" in n_low:
                return "Tanisha Gordon"
            if "chauhan" in n_low:
                return "Brijesh Chauhan"
            if "ourfali" in n_low or "elvis" in n_low:
                return "Elvis Ourfali"
            if "bizer" in n_low:
                return "Matt Bizer"
            if "bayer" in n_low:
                return "Stephan Bayer"
            if "stumpe" in n_low:
                return "Nathan Stumpe"
            return n.strip()

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

        def determine_plan_type(plan_name, status):
            p_low = (plan_name or "").lower()
            st_low = (status or "").lower()
            if "adopt" in p_low or "adopt" in st_low:
                return "Adoption"
            return "Onboarding"

        # 1. Load WW Action Plans
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

        # 2. Ingest Live CPS Data & Build Closed Registry
        active_cps_list = []
        archived_unsuccessful_list = []
        archived_successful_list = []
        closed_registry = set()

        if os.path.exists(self.team_csv):
            with open(self.team_csv, "r", encoding="utf-8-sig", errors="replace") as f:
                reader = csv.reader(f)
                r_list = list(reader)

            if len(r_list) > 1:
                headers = [h.strip() for h in r_list[0]]
                h_map = {h: i for i, h in enumerate(headers)}

                for r in r_list[1:]:
                    if not any(r): continue
                    def g(*col_names):
                        for cn in col_names:
                            if cn in h_map and h_map[cn] < len(r):
                                val = r[h_map[cn]].strip()
                                if val: return val
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

                    clean_acct = re.sub(r"^(BU\s*-\s*|CA\s*-\s*|US\s*-\s*|LEGACY\s*-\s*)", "", acct_name, flags=re.I).strip()
                    clean_acct = re.sub(r"\s+(US|BR|CA|LTD|INC|CORP|LLC)$", "", clean_acct, flags=re.I).strip()

                    norm_key = re.sub(r"[^a-z0-9]", "", clean_acct.lower())

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

                    st_low = status.lower()
                    is_closed = "completed" in st_low or "closed" in st_low or "cancelled" in st_low or "stalled" in st_low
                    is_successful = "successful" in st_low and not ("unsuccessful" in st_low)
                    is_unsuccessful = is_closed and not is_successful

                    if is_closed:
                        closed_registry.add(norm_key)
                        if rec_id: closed_registry.add(rec_id.lower())
                        if acct_id: closed_registry.add(acct_id.lower())

                    plan_type = determine_plan_type(plan_name, status)

                    acct_url = f"https://ciscosales.lightning.force.com/lightning/r/Account/{acct_id}/view" if acct_id else "https://ciscosales.lightning.force.com/lightning/o/Account/list?filterName=Recent"
                    plan_url = f"https://ciscosales.lightning.force.com/lightning/r/C360_CS_Task__c/{rec_id}/view?ws=%2Flightning%2Fr%2FAccount%2F{acct_id}%2Fview" if (rec_id and acct_id) else (f"https://ciscosales.lightning.force.com/lightning/r/C360_CS_Task__c/{rec_id}/view" if rec_id else "")

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
                        "sfdc_account_url": acct_url,
                        "sfdc_plan_url": plan_url,
                        "last_modified": last_mod_str,
                        "created_date": created_str,
                        "days_since_touch": days_since_touch,
                        "days_open": days_open,
                        "is_unsuccessful": is_unsuccessful,
                        "is_completed": is_closed,
                        "action_items": action_items,
                        "product_milestone": product_milestone,
                        "renewal_quarter": "FY27 Q1",
                        "stage": "Implement" if "implement" in status.lower() else "Onboard",
                        "source": "CPS"
                    }

                    if is_closed:
                        if is_successful:
                            archived_successful_list.append(item)
                        else:
                            archived_unsuccessful_list.append(item)
                    else:
                        active_cps_list.append(item)

        # 3. Ingest Active CSW Workload Accounts (Strictly Excluding Closed)
        active_csw_list = []
        snap_derisk_raw = []
        if os.path.exists(self.csw_snapshot):
            try:
                with open(self.csw_snapshot, "r", encoding="utf-8") as f:
                    snap_data = json.load(f)
                raw_csw = snap_data.get("workload", [])
                snap_derisk_raw = snap_data.get("derisk", [])
                for a in raw_csw:
                    c_name = a.get("clean_acct") or a.get("account_name") or ""
                    norm_k = re.sub(r"[^a-z0-9]", "", c_name.lower())
                    
                    if "nbcu" in norm_k or "nationalbroadcasting" in norm_k:
                        continue
                    if a.get("id", "").lower() in closed_registry or norm_k in closed_registry:
                        continue
                    if a.get("is_completed"):
                        continue
                    st = str(a.get("status", "")).lower()
                    if "completed" in st or "unsuccessful" in st or "closed" in st or "cancelled" in st or "stalled" in st:
                        continue

                    a["owner"] = normalize_name(a.get("owner"))
                    a["source"] = "CSW"
                    a["is_completed"] = False
                    a["is_unsuccessful"] = False
                    active_csw_list.append(a)
            except Exception as e:
                print(f"Error loading CSW snapshot: {e}")

        # Combined Active Working Accounts (Portfolio)
        all_active_accounts = active_cps_list + active_csw_list

        # Priority De-Risk pipeline:
        # Exactly active Red pulse accounts and Priority At-Risk accounts (excluding any closed)
        derisk_records = [a for a in active_cps_list if a["pulse"] == "Red"]
        for d in snap_derisk_raw:
            c_name = d.get("clean_acct") or d.get("account_name") or ""
            norm_k = re.sub(r"[^a-z0-9]", "", c_name.lower())
            if norm_k in closed_registry or "principal" in norm_k or "nbcu" in norm_k:
                continue
            if not any(re.sub(r"[^a-z0-9]", "", (x.get("clean_acct") or "").lower()) == norm_k for x in derisk_records):
                d["is_derisk"] = True
                d["is_completed"] = False
                d["is_unsuccessful"] = False
                d["owner"] = normalize_name(d.get("owner"))
                derisk_records.append(d)

        aging_onboarding_list = [a for a in all_active_accounts if a.get("plan_type") == "Onboarding" or "onboard" in str(a.get("status") or "").lower() or "implement" in str(a.get("status") or "").lower()]

        renewals_list = []
        for item in all_active_accounts:
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
                "sfdc_plan_url": item.get("sfdc_plan_url"),
                "is_derisk": item.get("is_derisk", False),
                "source": item.get("source", "CPS")
            })

        notes_gov_list = list(all_active_accounts)

        issues_list = []
        for a in all_active_accounts:
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

        people_stats = []
        for member in TEAM_MEMBERS:
            m_all = [a for a in all_active_accounts if a["owner"] == member]
            
            total_accts = len(m_all)
            arr_total = sum(a.get("arr_num", 0.0) for a in m_all)
            
            onboard_cnt = sum(1 for a in m_all if a.get("plan_type") == "Onboarding")
            adopt_cnt = sum(1 for a in m_all if a.get("plan_type") == "Adoption")
            succ_cnt = sum(1 for a in archived_successful_list if a["owner"] == member)
            unsucc_cnt = sum(1 for a in archived_unsuccessful_list if a["owner"] == member)
            derisk_cnt = sum(1 for a in derisk_records if a["owner"] == member)
            red_cnt = sum(1 for a in m_all if a.get("pulse") == "Red")
            
            cap_score = round(onboard_cnt * 1.0 + adopt_cnt * 1.25 + derisk_cnt * 1.5 + red_cnt * 0.5, 2)
            
            people_stats.append({
                "name": member,
                "role": "CSS",
                "assigned_count": total_accts,
                "total_arr": f"${int(arr_total):,}" if arr_total > 0 else "$0",
                "total_arr_num": arr_total,
                "onboarding_count": onboard_cnt,
                "adoption_count": adopt_cnt,
                "successful_count": succ_cnt,
                "unsuccessful_count": unsucc_cnt,
                "completed_count": succ_cnt + unsucc_cnt,
                "derisk_count": derisk_cnt,
                "red_pulse_count": red_cnt,
                "capacity_score": cap_score,
                "capacity_status": "Overloaded" if cap_score >= 25 else ("Heavy" if cap_score >= 18 else ("Normal" if cap_score >= 8 else "Available"))
            })

        total_active_arr = sum(a.get("arr_num", 0.0) for a in all_active_accounts)
        summary_kpis = {
            "total_accounts": len(all_active_accounts),
            "total_arr": f"${round(total_active_arr/1e6, 2)}M" if total_active_arr >= 1e6 else (f"${int(total_active_arr):,}" if total_active_arr > 0 else "$0"),
            "total_arr_num": total_active_arr,
            "cps_accounts": len(active_cps_list),
            "cps_arr": f"${round(sum(a.get('arr_num', 0.0) for a in active_cps_list)/1e6, 2)}M",
            "csw_accounts": len(active_csw_list),
            "csw_arr": f"${round(sum(a.get('arr_num', 0.0) for a in active_csw_list)/1e6, 2)}M",
            "onboarding_count": sum(1 for a in all_active_accounts if a.get("plan_type") == "Onboarding"),
            "adoption_count": sum(1 for a in all_active_accounts if a.get("plan_type") == "Adoption"),
            "derisk_count": len(derisk_records),
            "completed_unsuccessful_count": len(archived_unsuccessful_list),
            "completed_successful_count": len(archived_successful_list),
            "archived_closed_count": len(archived_unsuccessful_list) + len(archived_successful_list),
            "issues_count": len(issues_list)
        }

        return {
            "summary": summary_kpis,
            "workload": active_csw_list,
            "cps": active_cps_list,
            "active_cps": active_cps_list,
            "derisk": derisk_records,
            "aging_onboarding": aging_onboarding_list,
            "renewals": renewals_list,
            "notes_governance": notes_gov_list,
            "archived_unsuccessful": archived_unsuccessful_list,
            "archived_successful": archived_successful_list,
            "archived_closed": archived_unsuccessful_list + archived_successful_list,
            "issues": issues_list,
            "people": people_stats
        }
