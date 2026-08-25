"""
Idempotent tagging pass: assigns `capabilityTags` to every KnowledgeArticle
that doesn't already have one, using the same keyword inference rules the
running daemon uses (services/sre-agent-daemon/daemon/safety/rule_registry.json),
so the tags assigned here and the tags the daemon would infer on the fly agree.

Run this after any reseed/reset of the KB datasets, and after adding new KB
articles, so `capabilityTags` stays populated and the daemon's safety rules
(daemon/safety/rules.py) dispatch correctly instead of falling back to
keyword inference or the deprecated legacy KB-number list at request time.

Usage:
    python scripts/database/tag_kb_capabilities.py [--dry-run]

Updates, in place:
    apps/backend/data/knowledge_articles.json
    apps/backend/data/database.json           (its `knowledgeArticles` list)
    scripts/database/full_platform_data_dump.json (its itsm_db.KnowledgeArticle list)

Also attempts to update the live `itsm_db` Postgres table if `psycopg2` is
importable and DATABASE_URL is set; otherwise logs that the DB pass was
skipped (JSON datasets are still updated) and to run this again once the
driver/connection is available before relying on live capabilityTags.
"""
import argparse
import importlib.util
import json
import os

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_KB_CAPABILITIES_PATH = os.path.join(
    _REPO_ROOT, "services", "sre-agent-daemon", "daemon", "safety", "kb_capabilities.py"
)

# Loaded via importlib rather than `from daemon.safety.kb_capabilities import ...`
# because importing the `daemon` package triggers daemon/__init__.py, which
# eagerly connects to ChromaDB/Postgres as a side effect of import -- overkill
# (and environment-dependent) for a script that only needs the pure-Python
# registry-loading/inference logic in this one module (no relative imports).
_spec = importlib.util.spec_from_file_location("kb_capabilities", _KB_CAPABILITIES_PATH)
kb_capabilities = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(kb_capabilities)
load_registry = kb_capabilities.load_registry
infer_capability_tags = kb_capabilities.infer_capability_tags

JSON_TARGETS = [
    {"path": os.path.join(_REPO_ROOT, "apps", "backend", "data", "knowledge_articles.json"), "list_path": None},
    {"path": os.path.join(_REPO_ROOT, "apps", "backend", "data", "database.json"), "list_path": ["knowledgeArticles"]},
    {"path": os.path.join(_REPO_ROOT, "scripts", "database", "full_platform_data_dump.json"), "list_path": ["itsm_db", "KnowledgeArticle"]},
]


def _get_list(data, list_path):
    if not list_path:
        return data
    node = data
    for key in list_path:
        node = node[key]
    return node


def tag_articles(articles: list, registry: dict) -> int:
    """Mutates `articles` in place. Returns count of articles newly tagged."""
    tagged = 0
    for art in articles:
        existing = art.get("capabilityTags")
        if isinstance(existing, list) and existing:
            continue
        inferred = infer_capability_tags(art, registry)
        if inferred:
            art["capabilityTags"] = inferred
            tagged += 1
    return tagged


def tag_json_file(path: str, list_path, registry: dict, dry_run: bool) -> int:
    if not os.path.exists(path):
        print(f"  skip (not found): {path}")
        return 0
    with open(path, encoding="utf-8") as fh:
        data = json.load(fh)
    articles = _get_list(data, list_path)
    if not isinstance(articles, list):
        print(f"  skip (unexpected shape): {path}")
        return 0
    tagged = tag_articles(articles, registry)
    if tagged and not dry_run:
        with open(path, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2)
            fh.write("\n")
    print(f"  {path}: {tagged} article(s) tagged (of {len(articles)} total){' [dry-run, not written]' if dry_run and tagged else ''}")
    return tagged


def tag_live_db(registry: dict, dry_run: bool):
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor, Json
    except ImportError:
        print("  skip: psycopg2 not installed in this environment. JSON datasets were updated; "
              "re-run this script once psycopg2 is available (or after `pip install psycopg2-binary`) "
              "to also backfill the live database.")
        return

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        print("  skip: DATABASE_URL not set.")
        return

    conn = psycopg2.connect(database_url)
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute('SELECT id, number, title, category, "capabilityTags" FROM "KnowledgeArticle"')
            rows = cur.fetchall()
            tagged = 0
            for row in rows:
                if row.get("capabilityTags"):
                    continue
                inferred = infer_capability_tags(row, registry)
                if not inferred:
                    continue
                tagged += 1
                if not dry_run:
                    with conn.cursor() as upd:
                        upd.execute(
                            'UPDATE "KnowledgeArticle" SET "capabilityTags" = %s WHERE id = %s',
                            (Json(inferred), row["id"]),
                        )
            if not dry_run:
                conn.commit()
            print(f"  live DB: {tagged} article(s) tagged (of {len(rows)} total){' [dry-run, not written]' if dry_run and tagged else ''}")
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Report what would be tagged without writing.")
    args = parser.parse_args()

    registry = load_registry()

    print("Tagging JSON KB datasets...")
    total = 0
    for target in JSON_TARGETS:
        total += tag_json_file(target["path"], target["list_path"], registry, args.dry_run)

    print("Tagging live database (if reachable)...")
    tag_live_db(registry, args.dry_run)

    print(f"Done. {total} article(s) tagged across JSON datasets.")


if __name__ == "__main__":
    main()
