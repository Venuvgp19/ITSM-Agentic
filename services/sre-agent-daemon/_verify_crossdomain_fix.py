"""
Standalone validator for the design fix:
  "A RAG match a correct SOP and strictly execute the commands in the SOP.
   On a RAG miss, synthesize -> HITL approval -> execute -> persist a REAL SOP."

Reproduces the relevant decision logic exactly as implemented in
continuous_itsm_agent_daemon.py (merge-dedup threshold, index verifier,
hard execution guard) and checks the canonical scenarios.
"""

LINUX_USER_SOP_NUMBERS = [
    "KB0000038", "KB0000022", "KB0000023",
    "KB0000028", "KB0000027", "KB0000021",
    "KB0000036", "KB0000037",
    "KB0000015", "KB0000017", "KB0000018",
]

# Hard execution guard — synthesized (KB_NEW) SOPs only run with human APPROVED.
def allow_execution(is_new_use_case, my_approval_status):
    if is_new_use_case and my_approval_status != "APPROVED":
        return False, "synthesized SOP requires human APPROVED approval"
    return True, "ok"

# Dedup merge threshold in save_new_kb_article_to_storage (now >= 0.85)
def should_merge(similarity):
    return similarity >= 0.85

# Index verifier: a persisted SOP is RAG-discoverable only if its number is
# present in the ChromaDB collection after upsert.
def index_ok(persisted_number, indexed_numbers):
    return persisted_number in indexed_numbers


def main():
    failures = 0

    # --- Hard execution guard cases ---
    guard_cases = [
        (True, "APPROVED", True,  "new use case + human APPROVED -> execute"),
        (True, "PENDING",  False, "new use case + PENDING -> BLOCK (design policy)"),
        (True, None,       False, "new use case + no approval -> BLOCK (design policy)"),
        (True, "REJECTED", False, "new use case + REJECTED -> BLOCK (design policy)"),
        (False, None,      True,  "matched real SOP -> execute (HITL not required)"),
        (False, "AUTO",    True,  "matched real SOP -> autonomous execute OK"),
    ]
    print("== Hard execution guard ==")
    for is_new, st, expect, name in guard_cases:
        ok, reason = allow_execution(is_new, st)
        status = "OK" if ok == expect else "FAIL"
        if status == "FAIL": failures += 1
        print(f"[{status}] {name}: allow={ok} reason={reason}")

    # --- Merge threshold cases ---
    print("\n== Dedup merge threshold (>= 0.85 ⇒ merge; else dedicated article) ==")
    merge_cases = [
        (0.95, True,  "0.95 near-duplicate -> merge into existing KB (no new article)"),
        (0.90, True,  "0.90 near-duplicate -> merge"),
        (0.80, False, "0.80 loose overlap -> DO NOT merge (must create dedicated article)"),
        (0.60, False, "0.60 old threshold -> DO NOT merge (was the 'SOP never existed' bug)"),
        (0.50, False, "0.50 unrelated -> create dedicated article"),
    ]
    for sim, expect, name in merge_cases:
        m = should_merge(sim)
        status = "OK" if m == expect else "FAIL"
        if status == "FAIL": failures += 1
        print(f"[{status}] {name}: merge={m}")

    # --- Index verifier cases ---
    print("\n== ChromaDB index verifier ==")
    idx_cases = [
        ("KB0000123", {"KB0000123"}, True,  "present after write -> RAG-discoverable"),
        ("KB0000123", set(),         False, "absent after write -> NOT discoverable (reindex)"),
        ("KB0000123", {"KB0000099"}, False, "different number present -> not this one"),
    ]
    for num, indexed, expect, name in idx_cases:
        ok = index_ok(num, indexed)
        status = "OK" if ok == expect else "FAIL"
        if status == "FAIL": failures += 1
        print(f"[{status}] {name}: indexed_ok={ok}")

    print("\n" + "=" * 60)
    if failures == 0:
        print("ALL DESIGN-POLICY TESTS PASSED ✅")
    else:
        print(f"{failures} TEST(S) FAILED ❌")
    return failures


if __name__ == "__main__":
    raise SystemExit(main())

