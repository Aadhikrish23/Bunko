from types import SimpleNamespace

import anthropic
import httpx
import pytest
from fastapi.testclient import TestClient

from app import features
from app.llm import FALLBACK_BETA, Llm, LlmDeclined, LlmFailed, LlmUnavailable, get_llm
from app.main import app

TOKEN = "test-internal-token-0123456789"


class FakeMessages:
    def __init__(self, response=None, error=None):
        self.response, self.error, self.calls = response, error, []

    def create(self, **kwargs):
        self.calls.append(kwargs)
        if self.error:
            raise self.error
        return self.response


def fake_client(response=None, error=None):
    messages = FakeMessages(response, error)
    return SimpleNamespace(beta=SimpleNamespace(messages=messages)), messages


def text_response(text, stop_reason="end_turn"):
    return SimpleNamespace(stop_reason=stop_reason, content=[SimpleNamespace(type="text", text=text)])


def test_generate_json_parses_structured_output_and_sends_the_expected_request():
    client, messages = fake_client(text_response('{"summary": "You loved it", "themes": ["grief"]}'))
    llm = Llm(client, "claude-opus-5-5")

    assert llm.generate_json(system="s", prompt="p", schema={"type": "object"}) == {
        "summary": "You loved it",
        "themes": ["grief"],
    }
    call = messages.calls[0]
    assert call["model"] == "claude-opus-5-5"
    assert call["betas"] == [FALLBACK_BETA]
    assert call["fallbacks"] == "default"
    assert call["output_config"]["format"] == {"type": "json_schema", "schema": {"type": "object"}}
    assert "thinking" not in call  # always on for this model; effort is the dial


def test_refusal_and_truncation_are_not_read_as_content():
    with pytest.raises(LlmDeclined):
        Llm(fake_client(text_response("{}", "refusal"))[0], "m").generate_json(system="s", prompt="p", schema={})
    with pytest.raises(LlmFailed):
        Llm(fake_client(text_response('{"a":', "max_tokens"))[0], "m").generate_json(system="s", prompt="p", schema={})


def test_provider_errors_become_llm_failed():
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    error = anthropic.APIConnectionError(request=request)
    with pytest.raises(LlmFailed):
        Llm(fake_client(error=error)[0], "m").generate_json(system="s", prompt="p", schema={})


def test_without_an_api_key_generation_is_unavailable():
    llm = Llm(None, "claude-opus-5-5")
    assert not llm.available
    with pytest.raises(LlmUnavailable):
        llm.generate_json(system="s", prompt="p", schema={})


@pytest.fixture
def client():
    app.dependency_overrides[get_llm] = lambda: Llm(None, "claude-opus-5-5")
    yield TestClient(app)
    app.dependency_overrides.clear()


def test_health_reports_generation_unavailable_without_a_key(client):
    assert client.get("/health").json() == {"status": "ok", "generative": False}


def test_internal_routes_require_the_token(client):
    assert client.post("/internal/insights", json={"userId": "u1"}).status_code == 401
    wrong = client.post("/internal/insights", json={"userId": "u1"}, headers={"X-Internal-Token": "nope"})
    assert wrong.status_code == 401


def test_generation_errors_map_to_coded_responses(client, monkeypatch):
    def no_data(*_args):
        raise features.NoData("Add some books first")

    monkeypatch.setattr(features, "insights", no_data)
    response = client.post("/internal/insights", json={"userId": "u1"}, headers={"X-Internal-Token": TOKEN})
    assert response.status_code == 422
    assert response.json()["detail"] == {"code": "NO_DATA", "message": "Add some books first"}

    def unavailable(*_args):
        raise LlmUnavailable()

    monkeypatch.setattr(features, "recommendations", unavailable)
    response = client.post("/internal/recommendations", json={"userId": "u1"}, headers={"X-Internal-Token": TOKEN})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "LLM_UNAVAILABLE"
