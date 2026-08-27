"""
Chapter 1 of the router fine-tune: pulls resolved incidents out of itsm_db and
turns them into prompt/completion JSONL matching the exact fields
ControlTowerAIRouter.classify_ticket() already asks the hosted LLM for
(see daemon/orchestrator/router.py's CLASSIFICATION_PROMPT_TEMPLATE), so a
fine-tuned model can drop into that call site without changing the interface.

Usage:
    python export_router_training_data.py
Writes:
    router_train.jsonl, router_val.jsonl  (85/15 split, seeded)
"""
import json
import random
import re
import psycopg2
from psycopg2.extras import RealDictCursor

DSN = "postgresql://postgres:postgres@localhost:5432/itsm_db"

# Canonical department taxonomy -- expanded from router.py's original 5 to
# include SecOps and Desktop Support, which the live prompt never offered as
# options despite 118 and 117 real historical resolved tickets landing there.
VALID_DEPARTMENTS = {
    "Unix", "DevOps Ops", "DBA Team", "Network Ops",
    "App Support", "SecOps", "Desktop Support",
}

# Normalizes the dirty priority values seen in the live table
# ("HIGH", "P1 - CRITICAL", "MODERATE") onto the canonical P1-P4 scale used
# by the router's own output schema.
PRIORITY_NORMALIZE = {
    "P1": "P1", "P1 - CRITICAL": "P1", "CRITICAL": "P1",
    "P2": "P2", "HIGH": "P2",
    "P3": "P3", "MODERATE": "P3",
    "P4": "P4", "LOW": "P4",
}

SYSTEM_PROMPT = (
    "You are the Agentic AI Ticket Router for Enterprise IT Infrastructure. "
    "Classify the incident into the correct assignment group and priority. "
    f"Departments: {', '.join(sorted(VALID_DEPARTMENTS))}. Priorities: P1, P2, P3, P4. "
    'Respond as JSON: {"recommendedDepartment": "...", "priority": "..."}'
)


def fetch_rows():
    conn = psycopg2.connect(DSN)
    cur = conn.cursor(cursor_factory=RealDictCursor)
    cur.execute(
        """
        SELECT "shortDescription", description, "configurationItemName",
               department, priority
        FROM "Incident"
        WHERE state IN ('RESOLVED', 'CLOSED')
          AND department IS NOT NULL
        ORDER BY "createdAt"
        """
    )
    rows = cur.fetchall()
    cur.close()
    conn.close()
    return rows


def to_example(row):
    dept = (row["department"] or "").strip()
    if dept not in VALID_DEPARTMENTS:
        return None

    prio_raw = (row["priority"] or "").strip().upper()
    prio = PRIORITY_NORMALIZE.get(prio_raw)
    if not prio:
        return None

    short_desc = (row["shortDescription"] or "").strip()
    if not short_desc:
        return None

    desc = (row["description"] or "").strip()
    ci = (row["configurationItemName"] or "Unspecified CI").strip()

    user_prompt = (
        f"Short Description: {short_desc}\n"
        f"Description: {desc}\n"
        f"Configuration Item: {ci}"
    )
    completion = json.dumps({"recommendedDepartment": dept, "priority": prio})

    return {
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
            {"role": "assistant", "content": completion},
        ]
    }


def main():
    rows = fetch_rows()
    examples = []
    skipped = 0
    for row in rows:
        ex = to_example(row)
        if ex is None:
            skipped += 1
        else:
            examples.append(ex)

    # Dedup identical (prompt, completion) pairs -- several tickets are
    # near-identical bulk actions ("Delete 10 users..." templates) and an
    # unweighted duplicate flood would just bias the model toward memorizing
    # that one template instead of generalizing.
    seen = set()
    deduped = []
    for ex in examples:
        key = ex["messages"][1]["content"]
        if key in seen:
            continue
        seen.add(key)
        deduped.append(ex)

    random.seed(42)
    random.shuffle(deduped)
    split_idx = int(len(deduped) * 0.85)
    train, val = deduped[:split_idx], deduped[split_idx:]

    with open("router_train.jsonl", "w", encoding="utf-8") as f:
        for ex in train:
            f.write(json.dumps(ex) + "\n")
    with open("router_val.jsonl", "w", encoding="utf-8") as f:
        for ex in val:
            f.write(json.dumps(ex) + "\n")

    from collections import Counter
    dept_counts = Counter(json.loads(ex["messages"][2]["content"])["recommendedDepartment"] for ex in deduped)

    print(f"Fetched rows:        {len(rows)}")
    print(f"Skipped (bad label): {skipped}")
    print(f"Usable examples:     {len(examples)}")
    print(f"After dedup:         {len(deduped)}")
    print(f"Train / Val split:   {len(train)} / {len(val)}")
    print("Department distribution (post-clean):")
    for dept, count in dept_counts.most_common():
        print(f"  {dept:<16} {count}")


if __name__ == "__main__":
    main()
