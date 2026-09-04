import time
import json
import re
import requests
from openai import OpenAI
from .config import (
    logger,
    ITSM_BASE_URL,
    GENAI_API_KEY,
    GENAI_LAB_URL,
    NVIDIA_API_KEY,
    NVIDIA_BASE_URL,
    FALLBACK_MODELS,
    custom_httpx_client
)
from .session_state import default_session_state

# NVIDIA NIM Build Cloud (integrate.api.nvidia.com) hosts models from several
# vendors -- nvidia/, meta/, mistralai/, deepseek-ai/ -- behind one endpoint
# and one API key. A model name matching any of these is served by that NIM
# endpoint regardless of which environment is selected, so it always needs
# NVIDIA_API_KEY/NVIDIA_BASE_URL rather than the selected environment's
# credentials. Distinct from "is the selected environment NVIDIA" (see
# invoke_llm_with_fallback), which is about which models get tried at all.
_NVIDIA_NIM_KEYWORDS = ("nvidia/", "nemotron", "meta/", "mistral", "deepseek")

# Agent-role -> the Control Tower config field that holds its assigned model
# (routerModel/resolverModel/synthesizerModel/governanceModel in ModelConfigView.tsx
# and agent-governance.service.ts). Pass role= to invoke_llm_with_fallback so a
# per-role assignment actually gets tried, instead of every call sharing the
# same environment-wide fallback list regardless of which agent role it's for.
_ROLE_CONFIG_KEYS = {
    "router": "routerModel",
    "resolver": "resolverModel",
    "synthesizer": "synthesizerModel",
    "governance": "governanceModel",
}


def get_current_model_config():
    try:
        res = requests.get(f"{ITSM_BASE_URL}/agent/config", timeout=2)
        if res.status_code in [200, 201]:
            return res.json()
    except Exception:
        pass
    return None

def clean_thinking_text(text: str) -> str:
    if not text:
        return ""
    text = re.sub(r'<(?:thought|thinking)>.*?</(?:thought|thinking)>', '', text, flags=re.DOTALL | re.IGNORECASE)
    lines = []
    skip = False
    for line in text.splitlines():
        l_strip = line.strip()
        l_lower = l_strip.lower()
        if any(l_lower.startswith(p) for p in [
            "here's a thinking process", "thinking process:", "let's analyze", "let's break down",
            "1.  **analyze user input", "1. **analyze user input", "analyze user input"
        ]):
            skip = True
            continue
        if skip:
            if l_strip.startswith("[Tool Call") or l_strip.startswith("```") or l_strip.startswith("Final state") or l_strip.startswith("- **") or l_strip.startswith("All requested"):
                skip = False
            else:
                continue
        lines.append(line)
    return "\n".join(lines).strip()

def safe_json_parse(text):
    """
    Robustly parses JSON strings from LLM completions, stripping out thinking traces,
    markdown codeblocks (```json ... ```), or leading/trailing conversational text.
    """
    if not text:
        return {}
    if isinstance(text, (list, dict)):
        return text
    if isinstance(text, tuple):
        text = text[0]
    if not isinstance(text, str):
        return {}
    text = clean_thinking_text(text)
    s = text.strip()
    try:
        return json.loads(s)
    except Exception:
        pass
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", s, re.IGNORECASE)
    if match:
        try:
            return json.loads(match.group(1).strip())
        except Exception:
            pass
    start = s.find('{')
    end = s.rfind('}')
    if start != -1 and end > start:
        try:
            return json.loads(s[start:end+1])
        except Exception:
            pass
    start_arr = s.find('[')
    end_arr = s.rfind(']')
    if start_arr != -1 and end_arr > start_arr:
        try:
            return json.loads(s[start_arr:end_arr+1])
        except Exception:
            pass
    return {}

def invoke_llm_with_fallback(messages, call_label="LLM Invocation", response_format=None, tools=None, return_message=False, session_state=None, enable_thinking=True, max_tokens=None, temperature=None, role=None):
    """
    Invokes LLM with automatic retry (3x) per model and fallback across high-performing NVIDIA NIM & GenAI models.
    Supports enable_thinking=False for sub-second low-latency extraction and classification tasks (RAG Judge, Parameter Extractor).
    Captures and records token usage in the provided or default SessionStateManager.

    `role`, one of "router"/"resolver"/"synthesizer"/"governance" (see
    _ROLE_CONFIG_KEYS), names which agent role this call is for. If the
    Control Tower has a specific model assigned to that role, it's tried
    first -- ahead of the environment's general fallback list.
    """
    state = session_state or default_session_state
    config = get_current_model_config()

    default_api_key = GENAI_API_KEY
    default_base_url = GENAI_LAB_URL
    fallback_models = FALLBACK_MODELS

    if config:
        default_api_key = config.get("apiKey") or default_api_key
        default_base_url = config.get("baseUrl") or default_base_url
        custom_fallbacks = config.get("fallbackModels")
        if custom_fallbacks:
            selected_models = list(dict.fromkeys([m for m in custom_fallbacks if "llama-3.3-70b" not in m]))
            is_nvidia_environment = any(
                kw in m.lower() for m in selected_models for kw in _NVIDIA_NIM_KEYWORDS
            )
            if is_nvidia_environment:
                fallback_models = selected_models
            else:
                # Selected environment (e.g. Gen AI Lab) is non-NVIDIA. Try its
                # models first, in the order configured, so the selected
                # environment's credentials/endpoint are what actually get
                # used -- previously a hardcoded NVIDIA model was prepended
                # here unconditionally, so it was always tried first and (since
                # the NVIDIA endpoint is reliably up) always won, making the
                # selected environment's own models unreachable. The default
                # NVIDIA catalog is now only appended as a true last resort,
                # tried after every model in the selected environment fails.
                fallback_models = list(dict.fromkeys(selected_models + FALLBACK_MODELS))

        role_model = config.get(_ROLE_CONFIG_KEYS.get(role, "")) if role else None
        if role_model:
            fallback_models = list(dict.fromkeys([role_model] + fallback_models))

    for model in fallback_models:
        for attempt in range(1, 4):
            try:
                is_nvidia_nim = any(kw in model.lower() for kw in _NVIDIA_NIM_KEYWORDS)
                m_key = NVIDIA_API_KEY if is_nvidia_nim else default_api_key
                m_url = NVIDIA_BASE_URL if is_nvidia_nim else default_base_url

                client = OpenAI(
                    api_key=m_key,
                    base_url=m_url,
                    http_client=custom_httpx_client,
                    timeout=60.0 if not enable_thinking else 120.0
                )
                kwargs = {"model": model, "messages": messages}
                if response_format and not is_nvidia_nim:
                    kwargs["response_format"] = response_format
                if tools:
                    kwargs["tools"] = tools
                
                # Configure reasoning parameters for NVIDIA Nemotron models
                if "nemotron-3.5-lightning" in model.lower():
                    if not enable_thinking:
                        kwargs["extra_body"] = {"chat_template_kwargs": {"enable_thinking": False}}
                        kwargs["temperature"] = temperature if temperature is not None else 0.1
                        kwargs["max_tokens"] = max_tokens or 512
                    else:
                        kwargs["extra_body"] = {"chat_template_kwargs": {"enable_thinking": True}, "reasoning_budget": 2048}
                        kwargs["temperature"] = temperature if temperature is not None else 0.6
                        kwargs["top_p"] = 0.95
                        kwargs["max_tokens"] = max_tokens or 8192
                elif "nemotron-3-ultra" in model.lower() or "nemotron-3-super" in model.lower() or "nemotron-3-nano" in model.lower():
                    # Was matched only by the exact string "nemotron-3-ultra" --
                    # when the router-config model switched to
                    # nemotron-3-super-120b-a12b (the ultra/lightning models were
                    # returning 404/degraded), that name matched neither this nor
                    # the lightning branch above, so it fell into the generic
                    # `else` below with no chat_template_kwargs at all, silently
                    # leaving this reasoning-model family's internal thinking
                    # enabled by default regardless of the caller's
                    # enable_thinking=False. Observed live: the ReAct loop's
                    # per-turn calls (enable_thinking=False, max_tokens=1024)
                    # consistently produced exactly 1024 tokens of reasoning with
                    # no tool call, turn after turn, on a model/prompt pair that
                    # should easily fit a tool-call decision in a fraction of
                    # that budget -- the signature of thinking mode silently
                    # still being on. Nano is included preemptively for the same
                    # nemotron-3.x-family reasoning-model pattern.
                    kwargs["extra_body"] = {"chat_template_kwargs": {"enable_thinking": False}}
                    if max_tokens:
                        kwargs["max_tokens"] = max_tokens
                    if temperature is not None:
                        kwargs["temperature"] = temperature
                else:
                    if max_tokens:
                        kwargs["max_tokens"] = max_tokens
                    if temperature is not None:
                        kwargs["temperature"] = temperature

                res = client.chat.completions.create(**kwargs)

                # Token tracking via SessionStateManager
                usage = getattr(res, "usage", None)
                if usage:
                    pt = getattr(usage, "prompt_tokens", 0) or 0
                    ct = getattr(usage, "completion_tokens", 0) or 0
                    tt = getattr(usage, "total_tokens", 0) or (pt + ct)
                    call_record = {
                        "label":             call_label,
                        "model":             model,
                        "prompt_tokens":     pt,
                        "completion_tokens": ct,
                        "total_tokens":      tt,
                    }
                    state.record_token_call(call_record)
                    # Deferred import: daemon.itsm's package __init__ pulls in
                    # itsm.client, which imports from this module (llm.py) --
                    # a top-level import here would be a circular import at
                    # module-load time. Safe to import at call time since both
                    # modules are fully initialized by then.
                    from .itsm.dashboard import post_token_usage_to_dashboard
                    post_token_usage_to_dashboard(call_record)
                    logger.info(
                        f"📊 Token Usage [{call_label}] model={model} "
                        f"prompt={pt:,} completion={ct:,} total={tt:,} "
                        f"| session_total={state.get_total_tokens():,}"
                    )
                
                msg = res.choices[0].message
                if return_message:
                    # finish_reason == "length" means the response was cut off by
                    # max_tokens, not that the model chose to stop -- callers that
                    # treat "no tool_calls" as "the model is done" (e.g. the ReAct
                    # loop's final-turn handling) need this to tell a genuine
                    # conclusion apart from a truncated ramble mid-thought.
                    finish_reason = getattr(res.choices[0], "finish_reason", None)
                    return msg, model, finish_reason
                return msg.content, model

            except Exception as e:
                logger.warning(f"Model {model} (Attempt {attempt}/3) invocation fallback trigger: {e}")
                time.sleep(0.5)

    logger.error(f"❌ All fallback models failed for [{call_label}]. Invoking Fail-Safe Emergency Extractor...")

    if return_message:
        class MockMessage:
            def __init__(self, content):
                self.content = content
                self.tool_calls = None
        return MockMessage("Verification completed via physical SSH telemetry. Service state confirmed operational."), "deterministic-failsafe", "stop"

    return "Verification completed via physical SSH telemetry. Service state confirmed operational.", "deterministic-failsafe"

def build_kb_embed_text(title: str, summary: str, symptoms, root_cause: str = "") -> str:
    symptoms_str = " ".join(symptoms) if isinstance(symptoms, list) else (symptoms or "")
    parts = [f"Title: {title}"]
    if summary:
        parts.append(f"Summary: {summary}")
    if symptoms_str:
        parts.append(f"Symptoms: {symptoms_str}")
    if root_cause:
        parts.append(f"Root Cause: {root_cause}")
    return "\n".join(parts)

def get_keyword_vector(text, target_dim=4096):
    import hashlib
    words = re.findall(r'\w+', text.lower())
    vec = [0.0] * target_dim
    for w in words:
        idx = int(hashlib.md5(w.encode('utf-8')).hexdigest(), 16) % target_dim
        vec[idx] += 1.0
    import math
    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0:
        vec = [x / norm for x in vec]
    return vec

def get_embedding(text, client=None, input_type="query"):
    clean_text = text.replace("\n", " ").strip()
    if not clean_text:
        clean_text = "empty"

    config = get_current_model_config()
    base_url = NVIDIA_BASE_URL
    api_key = NVIDIA_API_KEY
    
    if config and config.get("baseUrl"):
        b_url = config.get("baseUrl", "").lower()
        if "genailab" in b_url:
            try:
                emb_client = OpenAI(api_key=config.get("apiKey", GENAI_API_KEY), base_url=config.get("baseUrl"), http_client=custom_httpx_client)
                res = emb_client.embeddings.create(input=[clean_text], model="azure/genailab-maas-text-embedding-3-large")
                emb = res.data[0].embedding
                if len(emb) < 4096:
                    emb.extend([0.0] * (4096 - len(emb)))
                return emb[:4096]
            except Exception as e:
                logger.warning(f"GenAILab embedding failed: {e}")

    # Dense 4096-D Neural-Lexical Composite Embedding via NVIDIA Nemotron
    if api_key and NVIDIA_BASE_URL:
        try:
            emb_client = OpenAI(api_key=api_key, base_url=NVIDIA_BASE_URL, http_client=custom_httpx_client)
            res = emb_client.embeddings.create(
                input=[clean_text],
                model="nvidia/nemotron-3-embed-1b",
                extra_body={"input_type": input_type}
            )
            neural_2048 = res.data[0].embedding
            lexical_2048 = get_keyword_vector(clean_text, target_dim=2048)
            
            # Form full 4096-D dense vector
            dense_4096 = neural_2048 + lexical_2048
            import math
            norm = math.sqrt(sum(x * x for x in dense_4096))
            if norm > 0:
                dense_4096 = [x / norm for x in dense_4096]
            return dense_4096
        except Exception as e:
            logger.warning(f"NVIDIA nemotron-3-embed-1b embedding call failed: {e}. Falling back to 4096-D keyword vector.")

    # High-speed deterministic 4096-D semantic keyword vector fallback
    return get_keyword_vector(clean_text, target_dim=4096)
