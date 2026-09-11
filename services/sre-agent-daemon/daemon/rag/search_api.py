"""
Lightweight, read-only HTTP endpoint exposing the daemon's own hybrid
dense+BM25+RRF RAG search (search_hybrid_kb) to other processes -- built so
the SRE Assistant chatbot (Node.js, apps/sre-control-tower/server.js) can run
the SAME real RAG search the daemon uses for incident remediation, instead of
only being able to run raw SQL LIKE queries against the KnowledgeArticle
table (its only prior option).

Runs in a background thread inside the existing daemon process using only
the standard library (http.server) -- no new dependency, no separate service
to deploy, and it reuses the already-initialized ChromaDB vector_db instance
rather than paying a cold-start cost per request. Binds to 127.0.0.1 only:
this is an internal tool for trusted local services, not a public API.
"""
import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from ..config import logger
from .hybrid_search import distill_incident_query, search_hybrid_kb
from .vector_db import vector_db as default_vector_db
from .judge import verify_rag_match_intent_with_llm
from ..itsm.client import fetch_kb_articles

RAG_SEARCH_HOST = "127.0.0.1"
RAG_SEARCH_PORT = 8008
# How many top-ranked candidates get judged per request. The live daemon
# pipeline judges every threshold-passing candidate (sub-second per call,
# thinking disabled) -- this tool caps it lower since it's answering an
# interactive chat request, not an autonomous decision, and doesn't need to
# exhaustively rank a long tail the same way.
JUDGE_TOP_N = 3


class _RagSearchHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Suppress http.server's default per-request stderr logging -- the
        # daemon's own logger below covers what's worth recording.
        pass

    def do_POST(self):
        if self.path != "/rag/search":
            self._send_json(404, {"error": "Not found. POST /rag/search."})
            return
        try:
            length = int(self.headers.get("Content-Length", 0) or 0)
            raw = self.rfile.read(length) if length else b"{}"
            body = json.loads(raw or b"{}")

            short_desc = str(body.get("short_desc", ""))
            # Default desc to short_desc rather than leaving it empty when the
            # caller doesn't supply extra detail (this chatbot tool is often
            # called with only a one-line symptom, unlike real tickets). This
            # is not cosmetic: verified live that an empty desc flips the
            # judge's own verdict on the SAME real SOP + SAME symptom from a
            # correct APPROVE to an incorrect REJECT, purely because desc was
            # thinner than what the judge normally sees -- real tickets from
            # the n8n generator always populate desc identically to
            # short_desc, so this restores that same shape rather than
            # feeding the judge an artificially impoverished input.
            desc = str(body.get("desc") or "") or short_desc
            department = body.get("department")
            limit = int(body.get("limit", 5))

            if not short_desc and not desc:
                self._send_json(400, {"error": "short_desc or desc is required."})
                return

            # publishedOnly=true is already the default for this call (see
            # itsm/client.py's fetch_kb_articles) -- the same correctness gate
            # that keeps unreviewed autonomously-synthesized SOPs out of the
            # daemon's own retrieval applies here too, so the chatbot can
            # never surface a not-yet-human-reviewed article as if it were a
            # trusted match.
            kb_articles = fetch_kb_articles(None)
            dense_query, lexical_tokens = distill_incident_query(short_desc, desc)
            candidates = search_hybrid_kb(
                dense_query, lexical_tokens, kb_articles, default_vector_db,
                limit=limit, department=department
            )

            # A raw hybrid score alone is not proof of relevance -- it's
            # corpus-relative rank, not a correctness guarantee (the exact
            # reason the live incident pipeline runs every threshold-passing
            # candidate through an LLM judge rather than trusting score
            # alone; see judge.py). Without this, the tool can hand back a
            # confidently-wrong top match at score 1.0 for a query with no
            # real corresponding SOP -- observed live: "install docker"
            # against a KB with zero Docker content matched a Python venv
            # SOP at a perfect score. Judging here closes that gap for this
            # tool the same way it's already closed for autonomous execution.
            results = []
            for c in candidates:
                article = c.get("article") or {}
                sop_commands = article.get("resolutionSteps") or []
                entry = {
                    "number": c.get("number"),
                    "title": c.get("title"),
                    "score": round(float(c.get("score", 0.0)), 4),
                    "source": c.get("source", "hybrid_rag"),
                }
                if len(results) < JUDGE_TOP_N:
                    try:
                        approved, reason = verify_rag_match_intent_with_llm(
                            short_desc, desc, c.get("number"), c.get("title"), sop_commands
                        )
                        entry["judge_approved"] = approved
                        entry["judge_reason"] = reason
                    except Exception as judge_err:
                        entry["judge_approved"] = None
                        entry["judge_reason"] = f"Judge unavailable: {judge_err}"
                else:
                    entry["judge_approved"] = None
                    entry["judge_reason"] = "Not judged (beyond top candidates for this request)."
                results.append(entry)

            any_approved = any(r.get("judge_approved") for r in results)
            logger.info(f"🔎 [RAG Search API] Query: '{dense_query[:80]}' -> {len(results)} candidate(s), any judge-approved={any_approved}")
            self._send_json(200, {
                "distilled_query": dense_query,
                "any_judge_approved_match": any_approved,
                "results": results,
            })
        except Exception as e:
            logger.error(f"RAG Search API error: {e}")
            self._send_json(500, {"error": str(e)})

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def start_rag_search_server():
    server = ThreadingHTTPServer((RAG_SEARCH_HOST, RAG_SEARCH_PORT), _RagSearchHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True, name="rag-search-api")
    thread.start()
    logger.info(f"🔎 RAG Search API listening on http://{RAG_SEARCH_HOST}:{RAG_SEARCH_PORT}/rag/search (internal-only, for the SRE Assistant chatbot)")
    return server
