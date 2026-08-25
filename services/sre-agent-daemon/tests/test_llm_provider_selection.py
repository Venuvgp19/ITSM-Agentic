"""
Regression test for the Gen AI Lab / NVIDIA environment-switching bug in
daemon/llm.py::invoke_llm_with_fallback. Previously, selecting "Gen AI Lab"
in the Agent Control Tower had no effect on chat completions: a hardcoded
"nvidia/nemotron-3.5-lightning-30b-a3b" was unconditionally prepended to
whatever fallback list the selected environment provided, so the NVIDIA
model was always tried first, always succeeded (NVIDIA's endpoint being
reliably up), and the function returned before any Gen AI Lab model was ever
reached -- regardless of what was selected.

These tests stub out the OpenAI client and get_current_model_config() to
verify, without any real network calls, which (api_key, base_url, model)
combination actually gets used for a given selected environment.
"""
import os
import sys
import types

_HERE = os.path.dirname(os.path.abspath(__file__))
_DAEMON_ROOT = os.path.dirname(_HERE)
sys.path.insert(0, _DAEMON_ROOT)

if "daemon" not in sys.modules:
    _stub = types.ModuleType("daemon")
    _stub.__path__ = [os.path.join(_DAEMON_ROOT, "daemon")]
    sys.modules["daemon"] = _stub

import pytest  # noqa: E402
import daemon.llm as llm  # noqa: E402


class _FakeMessage:
    def __init__(self, content):
        self.content = content
        self.tool_calls = None


class _FakeChoice:
    def __init__(self, content):
        self.message = _FakeMessage(content)


class _FakeCompletionResponse:
    def __init__(self, content):
        self.choices = [_FakeChoice(content)]
        self.usage = None


def _make_fake_openai(recorder, fail_models=frozenset()):
    """`recorder` collects one (api_key, base_url, model) tuple per `.create()` call."""
    class _FakeCompletions:
        def __init__(self, api_key, base_url):
            self._api_key = api_key
            self._base_url = base_url

        def create(self, **kwargs):
            model = kwargs["model"]
            recorder.append((self._api_key, self._base_url, model))
            if model in fail_models:
                raise RuntimeError(f"simulated failure for {model}")
            return _FakeCompletionResponse("ok")

    class _FakeChat:
        def __init__(self, api_key, base_url):
            self.completions = _FakeCompletions(api_key, base_url)

    class _FakeOpenAI:
        def __init__(self, api_key=None, base_url=None, **kwargs):
            self.api_key = api_key
            self.base_url = base_url
            self.chat = _FakeChat(api_key, base_url)

    return _FakeOpenAI


@pytest.fixture(autouse=True)
def _no_sleep(monkeypatch):
    monkeypatch.setattr(llm.time, "sleep", lambda *_a, **_kw: None)


def test_genai_lab_environment_uses_genai_lab_credentials_first(monkeypatch):
    calls = []
    monkeypatch.setattr(llm, "OpenAI", _make_fake_openai(calls))
    monkeypatch.setattr(llm, "get_current_model_config", lambda: {
        "apiKey": "genai-lab-key",
        "baseUrl": "https://genailab.tcs.in/v1",
        "fallbackModels": ["genailab-maas-gpt-4o", "azure/genailab-maas-gpt-4o-mini"],
    })

    content, model_used = llm.invoke_llm_with_fallback([{"role": "user", "content": "hi"}])

    assert content == "ok"
    assert model_used == "genailab-maas-gpt-4o"
    # Only call made must use the selected Gen AI Lab credentials/base_url
    # for the selected Gen AI Lab model, not NVIDIA's.
    assert calls == [("genai-lab-key", "https://genailab.tcs.in/v1", "genailab-maas-gpt-4o")]
    # The old bug: a hardcoded NVIDIA model got tried (and won) before this.
    assert not any(kw in str(c) for c in calls for kw in ("nvapi-", "integrate.api.nvidia.com"))


def test_nvidia_environment_uses_nvidia_credentials(monkeypatch):
    calls = []
    monkeypatch.setattr(llm, "OpenAI", _make_fake_openai(calls))
    monkeypatch.setattr(llm, "get_current_model_config", lambda: {
        "apiKey": "should-be-ignored-for-nvidia-models",
        "baseUrl": "https://integrate.api.nvidia.com/v1",
        "fallbackModels": ["nvidia/nemotron-3.5-lightning-30b-a3b", "meta/llama-3.3-70b-instruct"],
    })

    content, model_used = llm.invoke_llm_with_fallback([{"role": "user", "content": "hi"}])

    assert content == "ok"
    assert model_used == "nvidia/nemotron-3.5-lightning-30b-a3b"
    first_api_key, first_base_url, _ = calls[0]
    assert first_api_key == llm.NVIDIA_API_KEY
    assert first_base_url == llm.NVIDIA_BASE_URL
    # The (deliberately wrong) apiKey in config must NOT have been used --
    # NVIDIA-branded models always route through NVIDIA's own credentials.
    assert first_api_key != "should-be-ignored-for-nvidia-models"


def test_genai_lab_falls_back_to_nvidia_only_after_its_own_models_are_exhausted(monkeypatch):
    calls = []
    fail = {"genailab-maas-gpt-4o", "azure/genailab-maas-gpt-4o-mini"}
    monkeypatch.setattr(llm, "OpenAI", _make_fake_openai(calls, fail_models=fail))
    monkeypatch.setattr(llm, "get_current_model_config", lambda: {
        "apiKey": "genai-lab-key",
        "baseUrl": "https://genailab.tcs.in/v1",
        "fallbackModels": ["genailab-maas-gpt-4o", "azure/genailab-maas-gpt-4o-mini"],
    })

    content, model_used = llm.invoke_llm_with_fallback([{"role": "user", "content": "hi"}])

    # Both Gen AI Lab models must have been tried (3 attempts each) before
    # degrading to the default NVIDIA catalog as a last resort.
    tried_models = [model for _, _, model in calls]
    assert tried_models.count("genailab-maas-gpt-4o") == 3
    assert tried_models.count("azure/genailab-maas-gpt-4o-mini") == 3
    assert "nvidia/nemotron-3.5-lightning-30b-a3b" in tried_models
    assert content == "ok"
    assert model_used == "nvidia/nemotron-3.5-lightning-30b-a3b"


def test_no_config_falls_back_to_default_nvidia_catalog(monkeypatch):
    calls = []
    monkeypatch.setattr(llm, "OpenAI", _make_fake_openai(calls))
    monkeypatch.setattr(llm, "get_current_model_config", lambda: None)

    content, model_used = llm.invoke_llm_with_fallback([{"role": "user", "content": "hi"}])

    assert content == "ok"
    assert model_used == llm.FALLBACK_MODELS[0]


# ── Per-agent-role model assignment ─────────────────────────────────────────
# routerModel/resolverModel/synthesizerModel/governanceModel: Control Tower
# fields that were previously saved and returned by /agent/config but never
# read by the daemon (see _ROLE_CONFIG_KEYS in llm.py).

@pytest.mark.parametrize("role,config_key", [
    ("router", "routerModel"),
    ("resolver", "resolverModel"),
    ("synthesizer", "synthesizerModel"),
    ("governance", "governanceModel"),
])
def test_role_model_is_tried_first(monkeypatch, role, config_key):
    calls = []
    monkeypatch.setattr(llm, "OpenAI", _make_fake_openai(calls))
    monkeypatch.setattr(llm, "get_current_model_config", lambda: {
        "apiKey": "genai-lab-key",
        "baseUrl": "https://genailab.tcs.in/v1",
        "fallbackModels": ["genailab-maas-gpt-4o", "azure/genailab-maas-gpt-4o-mini"],
        config_key: "gemini-3.1-pro-preview",
    })

    content, model_used = llm.invoke_llm_with_fallback(
        [{"role": "user", "content": "hi"}], role=role
    )

    assert content == "ok"
    assert model_used == "gemini-3.1-pro-preview"
    # Role model must use the selected environment's credentials (it's not an
    # NVIDIA-branded name), and must be the very first call made.
    assert calls[0] == ("genai-lab-key", "https://genailab.tcs.in/v1", "gemini-3.1-pro-preview")


def test_unassigned_role_field_does_not_affect_dispatch(monkeypatch):
    calls = []
    monkeypatch.setattr(llm, "OpenAI", _make_fake_openai(calls))
    monkeypatch.setattr(llm, "get_current_model_config", lambda: {
        "apiKey": "genai-lab-key",
        "baseUrl": "https://genailab.tcs.in/v1",
        "fallbackModels": ["genailab-maas-gpt-4o", "azure/genailab-maas-gpt-4o-mini"],
        # no routerModel key at all
    })

    content, model_used = llm.invoke_llm_with_fallback(
        [{"role": "user", "content": "hi"}], role="router"
    )

    assert model_used == "genailab-maas-gpt-4o"


def test_no_role_passed_behaves_as_before(monkeypatch):
    calls = []
    monkeypatch.setattr(llm, "OpenAI", _make_fake_openai(calls))
    monkeypatch.setattr(llm, "get_current_model_config", lambda: {
        "apiKey": "genai-lab-key",
        "baseUrl": "https://genailab.tcs.in/v1",
        "fallbackModels": ["genailab-maas-gpt-4o"],
        "routerModel": "gemini-3.1-pro-preview",
    })

    content, model_used = llm.invoke_llm_with_fallback([{"role": "user", "content": "hi"}])

    # role=None (default) -- an unrelated role assignment must not leak in.
    assert model_used == "genailab-maas-gpt-4o"


def test_role_model_respects_nvidia_credential_routing(monkeypatch):
    # A role model that happens to be NVIDIA-branded must still use NVIDIA's
    # own credentials, even inside a Gen AI Lab environment (mirrors how
    # fallbackModels entries are already routed per-model).
    calls = []
    monkeypatch.setattr(llm, "OpenAI", _make_fake_openai(calls))
    monkeypatch.setattr(llm, "get_current_model_config", lambda: {
        "apiKey": "genai-lab-key",
        "baseUrl": "https://genailab.tcs.in/v1",
        "fallbackModels": ["genailab-maas-gpt-4o"],
        "resolverModel": "nvidia/nemotron-3.5-lightning-30b-a3b",
    })

    content, model_used = llm.invoke_llm_with_fallback(
        [{"role": "user", "content": "hi"}], role="resolver"
    )

    assert model_used == "nvidia/nemotron-3.5-lightning-30b-a3b"
    assert calls[0] == (llm.NVIDIA_API_KEY, llm.NVIDIA_BASE_URL, "nvidia/nemotron-3.5-lightning-30b-a3b")
