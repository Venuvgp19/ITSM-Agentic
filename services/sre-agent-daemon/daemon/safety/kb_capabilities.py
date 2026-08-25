"""
Single source of truth for "what KB article can serve what purpose."

Replaces the pattern (repeated independently in rules.py, config.py,
hybrid_search.py, and synthesizer.py) of hardcoding a literal KB number and
reasoning about what it means in a code comment. KB `number` is an
auto-increment field that gets reassigned across dataset reseeds, so a
hardcoded number can silently point at unrelated content after a reset --
see rule_registry.json's `legacy_kb_number_fallback._readme`.

Every caller in this codebase that needs to answer "is this KB article a
linux user-creation SOP?" (or any other capability question) should go
through `get_capability_tags()` / `article_has_capability()` /
`find_kb_by_capability()` instead of comparing `article["number"]` to a
literal string.
"""
import json
import os
import threading

_REGISTRY_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "rule_registry.json")
_lock = threading.Lock()
_registry_cache = None


def load_registry() -> dict:
    """Loads and caches rule_registry.json. Re-reads on file changes (dev-friendly, low volume)."""
    global _registry_cache
    with _lock:
        try:
            mtime = os.path.getmtime(_REGISTRY_PATH)
        except OSError:
            mtime = None
        if _registry_cache is not None and _registry_cache.get("_mtime") == mtime:
            return _registry_cache["_data"]
        with open(_REGISTRY_PATH, encoding="utf-8") as fh:
            data = json.load(fh)
        _registry_cache = {"_mtime": mtime, "_data": data}
        return data


def _title_and_category(article: dict) -> tuple[str, str]:
    return (article.get("title") or "").lower(), (article.get("category") or "").lower()


def infer_capability_tags(article: dict, registry: dict = None) -> list[str]:
    """Keyword-based fallback classification for a KB article with no explicit capabilityTags."""
    registry = registry or load_registry()
    title, category = _title_and_category(article)
    tags = []
    for tag, spec in registry.get("capability_inference", {}).items():
        if tag.startswith("_"):
            continue
        title_any = spec.get("title_any", [])
        title_none = spec.get("title_none", [])
        category_any = spec.get("category_any", [])
        matches_title = any(k in title for k in title_any) if title_any else False
        matches_category = any(k in category for k in category_any) if category_any else False
        if not (matches_title or matches_category):
            continue
        if title_none and any(k in title for k in title_none):
            continue
        tags.append(tag)
    return tags


def get_capability_tags(article: dict, registry: dict = None) -> list[str]:
    """
    Returns the capability tags for a KB article: its explicit `capabilityTags`
    field if present (set by the tagging pipeline / SOP author), otherwise a
    keyword-inferred best guess.
    """
    if not article:
        return []
    explicit = article.get("capabilityTags")
    if isinstance(explicit, list) and explicit:
        return explicit
    return infer_capability_tags(article, registry)


def article_has_capability(article: dict, capability: str, registry: dict = None) -> bool:
    registry = registry or load_registry()
    if capability in get_capability_tags(article, registry):
        return True
    # Legacy fallback: honor pre-migration hardcoded number lists so KBs that
    # haven't been tagged yet (and don't match inference) keep prior behavior.
    legacy = registry.get("legacy_kb_number_fallback", {}).get(capability, [])
    return article.get("number") in legacy


def find_kb_by_capability(kb_articles: list, capability: str, registry: dict = None):
    """Returns the first KB article carrying `capability`, or None."""
    registry = registry or load_registry()
    for art in kb_articles or []:
        if article_has_capability(art, capability, registry):
            return art
    return None


def is_blocked_for_domain(article: dict, domain: str, registry: dict = None) -> bool:
    """E.g. domain='k8s' -> True if this KB carries a capability the k8s guard blocks."""
    registry = registry or load_registry()
    guard = registry.get("cross_domain_guards", {}).get(domain, {})
    blocked = set(guard.get("blocked_capabilities", []))
    if not blocked:
        return False
    return bool(blocked.intersection(get_capability_tags(article, registry)))


def is_allowed_for_domain(article: dict, domain: str, registry: dict = None) -> bool:
    """E.g. domain='db2' -> True if this KB carries a capability the db2 guard requires."""
    registry = registry or load_registry()
    guard = registry.get("cross_domain_guards", {}).get(domain, {})
    required_any = set(guard.get("required_capability_any", []))
    if not required_any:
        return True
    return bool(required_any.intersection(get_capability_tags(article, registry)))
