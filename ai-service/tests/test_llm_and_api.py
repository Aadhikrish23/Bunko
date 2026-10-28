import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app import features, prompts
from app.llm import Llm, LlmDeclined, LlmFailed, LlmUnavailable, get_llm
from app.main import app

TOKEN = "test-internal-token-0123456789"


def chat_response(content, finish_reason="stop"):
    return {"choices": [{"finish_reason": finish_reason, "message": {"content": content}}]}


def fake_client(responses=None, status_code=200, raise_error=None):
    """responses: a single dict, or a list consumed one per call (for retry tests)."""
    calls: list[dict] = []
    queue = list(responses) if isinstance(responses, list) else ([responses] if responses is not None else [])

    def handler(request: httpx.Request) -> httpx.Response:
        if raise_error:
            raise raise_error
        calls.append(json.loads(request.content))
        body = queue.pop(0) if queue else queue[-1] if queue else {}
        return httpx.Response(status_code, json=body)

    client = httpx.Client(transport=httpx.MockTransport(handler), base_url="https://nim.example/v1")
    return client, calls


def fake_client_per_model(by_model: dict[str, tuple[int, dict]]):
    """Each model name gets its own (status_code, body) -- for fallback tests."""
    calls: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        calls.append(payload)
        status_code, body = by_model[payload["model"]]
        return httpx.Response(status_code, json=body)

    client = httpx.Client(transport=httpx.MockTransport(handler), base_url="https://nim.example/v1")
    return client, calls


def test_generate_json_parses_structured_output_and_sends_the_expected_request():
    client, calls = fake_client(chat_response('{"summary": "You loved it", "themes": ["grief"]}'))
    llm = Llm(client, ["nvidia/some-model"])

    assert llm.generate_json(system="s", prompt="p", schema={"type": "object"}) == {
        "summary": "You loved it",
        "themes": ["grief"],
    }
    call = calls[0]
    assert call["model"] == "nvidia/some-model"
    assert call["messages"][0]["role"] == "system"
    assert "type" in call["messages"][0]["content"]  # the schema got embedded
    assert call["messages"][1] == {"role": "user", "content": "p"}
    assert call["chat_template_kwargs"] == {"thinking": False}


def test_malformed_json_is_retried_once_then_parsed():
    client, calls = fake_client([chat_response("not json at all"), chat_response('{"summary": "ok", "themes": []}')])
    llm = Llm(client, ["m"])

    assert llm.generate_json(system="s", prompt="p", schema={"type": "object"}) == {"summary": "ok", "themes": []}
    assert len(calls) == 2
    # The retry includes the bad reply and a correction.
    assert calls[1]["messages"][-2]["content"] == "not json at all"


def test_json_wrapped_in_a_markdown_fence_still_parses():
    client, _ = fake_client(chat_response('```json\n{"summary": "ok", "themes": []}\n```'))
    llm = Llm(client, ["m"])
    assert llm.generate_json(system="s", prompt="p", schema={}) == {"summary": "ok", "themes": []}


def test_persistently_malformed_json_fails_after_one_retry():
    client, calls = fake_client(chat_response("still not json"))
    llm = Llm(client, ["m"])
    with pytest.raises(LlmFailed):
        llm.generate_json(system="s", prompt="p", schema={})
    assert len(calls) == 2


def test_refusal_and_truncation_are_not_read_as_content():
    with pytest.raises(LlmDeclined):
        Llm(fake_client(chat_response("", "content_filter"))[0], ["m"]).generate_json(system="s", prompt="p", schema={})
    with pytest.raises(LlmFailed):
        Llm(fake_client(chat_response('{"a":', "length"))[0], ["m"]).generate_json(system="s", prompt="p", schema={})


def test_provider_errors_become_llm_failed():
    request = httpx.Request("POST", "https://nim.example/v1/chat/completions")
    error = httpx.ConnectError("boom", request=request)
    with pytest.raises(LlmFailed):
        Llm(fake_client(raise_error=error)[0], ["m"]).generate_json(system="s", prompt="p", schema={})


def test_a_rejected_key_becomes_llm_failed():
    client, _ = fake_client(status_code=401)
    with pytest.raises(LlmFailed):
        Llm(client, ["m"]).generate_json(system="s", prompt="p", schema={})


def test_without_an_api_key_generation_is_unavailable():
    llm = Llm(None, ["nvidia/some-model"])
    assert not llm.available
    with pytest.raises(LlmUnavailable):
        llm.generate_json(system="s", prompt="p", schema={})


def test_a_model_not_found_on_this_account_falls_back_to_the_next_one():
    # Mirrors a real NVIDIA NIM response observed in manual testing: a model can
    # 404 "not found for account" while another model on the same key works fine.
    client, calls = fake_client_per_model(
        {
            "primary-model": (404, {"detail": "Function not found for account"}),
            "fallback-model": (200, chat_response('{"summary": "ok", "themes": []}')),
        }
    )
    llm = Llm(client, ["primary-model", "fallback-model"])

    assert llm.generate_json(system="s", prompt="p", schema={}) == {"summary": "ok", "themes": []}
    assert [c["model"] for c in calls] == ["primary-model", "fallback-model"]


def test_a_rejected_key_does_not_try_other_models():
    client, calls = fake_client_per_model(
        {
            "primary-model": (401, {"detail": "unauthorized"}),
            "fallback-model": (200, chat_response('{"summary": "unreachable", "themes": []}')),
        }
    )
    llm = Llm(client, ["primary-model", "fallback-model"])

    with pytest.raises(LlmFailed):
        llm.generate_json(system="s", prompt="p", schema={})
    assert [c["model"] for c in calls] == ["primary-model"]


@pytest.fixture
def client():
    app.dependency_overrides[get_llm] = lambda: Llm(None, ["nvidia/some-model"])
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


def test_translation_sends_plain_text_and_keeps_paragraphs():
    client, calls = fake_client(chat_response("Hola.\n\nAdiós <3"))
    llm = Llm(client, ["nvidia/some-model"])

    result = features.translate("Hello.\n\nBye <3", "Spanish", llm)

    assert result == {"text": "Hola.\n\nAdiós <3", "model": "nvidia/some-model"}
    call = calls[0]
    assert call["messages"][0] == {"role": "system", "content": prompts.TRANSLATE_SYSTEM}
    assert "Bye &lt;3" in call["messages"][1]["content"]


def test_translation_refusal_and_cut_off_are_failures_not_text():
    with pytest.raises(LlmDeclined):
        features.translate("x", "French", Llm(fake_client(chat_response("", "content_filter"))[0], ["m"]))
    with pytest.raises(LlmFailed):
        features.translate("x", "French", Llm(fake_client(chat_response("Bonj", "length"))[0], ["m"]))


def test_translate_route_validates_and_maps_errors(client, monkeypatch):
    headers = {"X-Internal-Token": TOKEN}
    too_long = {"userId": "u1", "text": "a" * 12_001, "targetLanguage": "French"}
    assert client.post("/internal/translate", json=too_long, headers=headers).status_code == 422

    def declined(*_args):
        raise LlmDeclined()

    monkeypatch.setattr(features, "translate", declined)
    response = client.post(
        "/internal/translate", json={"userId": "u1", "text": "Hi", "targetLanguage": "French"}, headers=headers
    )
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "DECLINED"
