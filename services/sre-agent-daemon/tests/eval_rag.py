"""
RAG regression eval for the SOP-matching pipeline.

NOT a startup check -- this calls real embeddings and (for --tier 2) the real
LLM judge, so it costs tokens and takes real time. Run it manually or in CI
after touching daemon/rag/hybrid_search.py, daemon/rag/judge.py, or
daemon/sop/synthesizer.py -- not on every daemon boot.

Two independent tiers, because a pipeline-level pass/fail hides *which* stage
broke:

  Tier 1 (retrieval only, fast, no LLM calls):
    Calls search_hybrid_kb() directly. Measures whether the correct KB is
    even in the candidate list, and how highly it ranks -- isolates the
    embedding+BM25+RRF scoring from everything downstream.
    Metrics: Recall@K, MRR (mean reciprocal rank).

  Tier 2 (end-to-end selection, slower, real LLM judge calls):
    Calls evaluate_and_get_sop() -- the full pipeline: threshold, guards,
    judge, selection or RAG-miss. Measures the outcome that actually matters
    for safety.
    Metrics: accuracy, and -- the metric plain accuracy hides -- the
    CONFIDENTLY WRONG rate: cases where the pipeline selected the wrong KB
    with a high hybrid score. That's the exact failure class found live this
    session (a "create a storage account..." ticket matched "create resource
    groups" at a perfect 1.0 score, judge skipped, auto-executed on the wrong
    SOP). Recall@K alone would never catch this -- the wrong SOP was often
    the TOP-ranked candidate, not a low-ranked miss.

Usage:
    python tests/eval_rag.py --tier 1                  # fast, no LLM cost
    python tests/eval_rag.py --tier 2                  # full pipeline, costs tokens
    python tests/eval_rag.py --tier 2 --limit 20        # smaller sample for a quick check
    python tests/eval_rag.py --tier 2 --golden adversarial_cases.json
"""
import argparse
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from daemon.rag.hybrid_search import distill_incident_query, search_hybrid_kb
from daemon.rag.vector_db import vector_db as default_vector_db
from daemon.sop.synthesizer import evaluate_and_get_sop


def load_kb_articles():
    """Pulls the live KB article list from the running backend -- same source
    the daemon itself uses, so the eval is testing against the real index."""
    import requests
    res = requests.get("http://localhost:4000/api/v1/knowledge/articles", timeout=15)
    res.raise_for_status()
    return res.json()


def run_tier1(golden_set, kb_articles, k=5):
    """Retrieval-only: does the right KB appear in the top-k candidates, and
    at what rank? No LLM calls -- pure hybrid_search.py scoring."""
    results = []
    hits_at_k = 0
    reciprocal_ranks = []

    for case in golden_set:
        dense_query, lexical_tokens = distill_incident_query(case["short_desc"], case.get("desc", ""))
        try:
            candidates = search_hybrid_kb(
                dense_query, lexical_tokens, kb_articles, default_vector_db,
                limit=k, department=case.get("department")
            )
        except Exception as e:
            results.append({**case, "error": str(e), "rank": None})
            continue

        expected = case.get("expected_kb")
        rank = None
        for idx, cand in enumerate(candidates, 1):
            if cand.get("number") == expected:
                rank = idx
                break

        if rank:
            hits_at_k += 1
            reciprocal_ranks.append(1.0 / rank)
        else:
            reciprocal_ranks.append(0.0)

        results.append({
            **case,
            "rank": rank,
            "top_candidate": candidates[0]["number"] if candidates else None,
            "top_score": round(candidates[0]["score"], 4) if candidates else None,
        })

    n = len(golden_set)
    recall_at_k = hits_at_k / n if n else 0.0
    mrr = sum(reciprocal_ranks) / n if n else 0.0

    return {
        "tier": 1,
        "n_cases": n,
        "recall_at_k": round(recall_at_k, 4),
        "mrr": round(mrr, 4),
        "misses": [r for r in results if r["rank"] is None],
        "results": results,
    }


def run_tier2(golden_set, kb_articles):
    """End-to-end: what does the FULL pipeline (threshold + guards + judge)
    actually select? Flags the dangerous case separately: wrong selection
    made with a high hybrid score (confidently wrong), vs. a low-confidence
    wrong guess, vs. a correct RAG-miss (expected_kb is null and pipeline
    correctly found nothing)."""
    results = []
    correct = 0
    confidently_wrong = []
    quietly_wrong = []
    false_misses = []  # expected a match, pipeline said RAG-miss instead
    total_commits = 0    # cases where the pipeline selected a KB at all (didn't abstain to RAG-miss)
    correct_commits = 0  # of those, how many were actually right

    for case in golden_set:
        expected = case.get("expected_kb")
        try:
            is_new, kb_num, kb_title, reasoning, sop_commands, new_sop_data = evaluate_and_get_sop(
                case["ticket_number"], case["short_desc"], case.get("desc", ""),
                case.get("ci_name", "WorkerNode1HL"), case.get("ip", "192.168.100.102"),
                kb_articles, f"eval-{case['ticket_number']}",
                department=case.get("department"),
            )
        except Exception as e:
            results.append({**case, "error": str(e)})
            continue

        selected = None if is_new else kb_num
        outcome = "correct" if selected == expected else "wrong"
        if expected is None and is_new:
            outcome = "correct"  # true negative: correctly identified as RAG-miss

        if selected is not None:
            # The pipeline committed to a KB rather than abstaining to synthesis
            # + mandatory human approval -- this is the population that matters
            # for selection_precision, since a wrong RAG-miss just costs a
            # slower path through a human, while a wrong COMMIT is a wrong
            # autonomous action. Plain accuracy blends both populations into one
            # number and hides which one is actually driving it.
            total_commits += 1
            if selected == expected:
                correct_commits += 1

        if outcome == "correct":
            correct += 1
        elif selected is not None and expected is not None:
            # Re-run tier-1 scoring just for this case to know if it was a
            # HIGH-confidence wrong pick (the dangerous class) vs low-confidence.
            dense_query, lexical_tokens = distill_incident_query(case["short_desc"], case.get("desc", ""))
            candidates = search_hybrid_kb(dense_query, lexical_tokens, kb_articles, default_vector_db, limit=5, department=case.get("department"))
            top_score = candidates[0]["score"] if candidates else 0.0
            entry = {**case, "selected": selected, "top_score": round(top_score, 4)}
            if top_score >= 0.85:
                confidently_wrong.append(entry)
            else:
                quietly_wrong.append(entry)
        elif expected is not None and selected is None:
            false_misses.append({**case, "reasoning": reasoning})

        results.append({**case, "selected": selected, "is_new_use_case": is_new, "outcome": outcome})

    n = len(golden_set)
    return {
        "tier": 2,
        "n_cases": n,
        "accuracy": round(correct / n, 4) if n else 0.0,
        "total_commits": total_commits,
        "selection_precision": round(correct_commits / total_commits, 4) if total_commits else None,
        "confidently_wrong": confidently_wrong,
        "quietly_wrong": quietly_wrong,
        "false_misses": false_misses,
        "results": results,
    }


def print_report(report):
    print(f"\n{'='*70}\nTier {report['tier']} report -- {report['n_cases']} cases\n{'='*70}")
    if report["tier"] == 1:
        print(f"Recall@K: {report['recall_at_k']:.1%}   MRR: {report['mrr']:.4f}")
        if report["misses"]:
            print(f"\n{len(report['misses'])} MISSES (expected KB not in top-K at all):")
            for m in report["misses"][:10]:
                print(f"  [{m['ticket_number']}] expected {m['expected_kb']}, got top={m['top_candidate']}: {m['short_desc'][:70]}")
    else:
        print(f"Accuracy: {report['accuracy']:.1%}")
        if report["selection_precision"] is not None:
            print(f"Selection precision: {report['selection_precision']:.1%}  ({report['total_commits']} of {report['n_cases']} cases committed to a KB rather than abstaining to RAG-miss)")
        if report["confidently_wrong"]:
            print(f"\n⚠️  {len(report['confidently_wrong'])} CONFIDENTLY WRONG (high score, wrong SOP -- the dangerous class):")
            for m in report["confidently_wrong"]:
                print(f"  [{m['ticket_number']}] expected {m['expected_kb']}, selected {m['selected']} (score={m['top_score']}): {m['short_desc'][:70]}")
        if report["quietly_wrong"]:
            print(f"\n{len(report['quietly_wrong'])} quietly wrong (low score, wrong SOP):")
            for m in report["quietly_wrong"]:
                print(f"  [{m['ticket_number']}] expected {m['expected_kb']}, selected {m['selected']} (score={m['top_score']}): {m['short_desc'][:70]}")
        if report["false_misses"]:
            print(f"\n{len(report['false_misses'])} false RAG-misses (expected a match, pipeline said miss):")
            for m in report["false_misses"]:
                print(f"  [{m['ticket_number']}] expected {m['expected_kb']}: {m['short_desc'][:70]}")
    print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--tier", type=int, choices=[1, 2], default=1, help="1 = retrieval-only (fast, free). 2 = full pipeline (real LLM judge calls, costs tokens).")
    parser.add_argument("--golden", default="rag_golden_set_real.json", help="Golden set JSON filename, relative to tests/")
    parser.add_argument("--limit", type=int, default=None, help="Only run the first N cases (useful for a quick/cheap tier-2 sanity check)")
    parser.add_argument("--out", default=None, help="Write full JSON report to this path")
    args = parser.parse_args()

    golden_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), args.golden)
    golden_set = json.load(open(golden_path, encoding="utf-8"))
    if args.limit:
        golden_set = golden_set[:args.limit]

    kb_articles = load_kb_articles()
    print(f"Loaded {len(golden_set)} golden-set cases, {len(kb_articles)} KB articles.")

    report = run_tier1(golden_set, kb_articles) if args.tier == 1 else run_tier2(golden_set, kb_articles)
    print_report(report)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, default=str)
        print(f"Full report written to {args.out}")
