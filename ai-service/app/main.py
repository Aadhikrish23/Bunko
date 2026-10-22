"""Bunko ai-service (Phase 10). Internal only: the Express API is the sole
caller (ARCHITECTURE.md §8), so there's no user auth here — just the shared
internal token, and a user id the API has already authenticated."""

from __future__ import annotations

from typing import Any

from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field

from . import features
from .embeddings import Embedder, get_embedder
from .indexing import index_user
from .llm import Llm, LlmDeclined, LlmFailed, LlmUnavailable, get_llm
from .search import search
from .security import require_internal_token

app = FastAPI(title="Bunko AI service", docs_url=None, redoc_url=None, openapi_url=None)
internal = [Depends(require_internal_token)]


class UserRequest(BaseModel):
    userId: str = Field(min_length=1, max_length=64)


class SearchRequest(UserRequest):
    query: str = Field(min_length=1, max_length=200)
    limit: int = Field(default=20, ge=1, le=50)


class AskRequest(UserRequest):
    question: str = Field(min_length=1, max_length=1_000)


class SummaryRequest(UserRequest):
    workId: str = Field(min_length=1, max_length=64)


def _error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def _generated(run) -> dict[str, Any]:
    try:
        return run()
    except features.NoData as err:
        raise _error(422, "NO_DATA", str(err)) from err
    except LlmUnavailable as err:
        raise _error(503, "LLM_UNAVAILABLE", "Generated insights are not configured") from err
    except LlmDeclined as err:
        raise _error(422, "DECLINED", "The model declined this request") from err
    except LlmFailed as err:
        raise _error(502, "LLM_ERROR", str(err)) from err


@app.get("/health")
def health(llm: Llm = Depends(get_llm)) -> dict[str, Any]:
    return {"status": "ok", "generative": llm.available}


@app.post("/internal/index", dependencies=internal)
def index(request: UserRequest, embedder: Embedder = Depends(get_embedder)) -> dict[str, int]:
    return index_user(request.userId, embedder)


@app.post("/internal/search", dependencies=internal)
def semantic_search(request: SearchRequest, embedder: Embedder = Depends(get_embedder)) -> dict[str, Any]:
    return {"results": search(request.userId, request.query, request.limit, embedder)}


@app.post("/internal/ask", dependencies=internal)
def ask(request: AskRequest, llm: Llm = Depends(get_llm), embedder: Embedder = Depends(get_embedder)) -> dict[str, Any]:
    return _generated(lambda: features.ask(request.userId, request.question, llm, embedder))


@app.post("/internal/summary", dependencies=internal)
def summary(request: SummaryRequest, llm: Llm = Depends(get_llm)) -> dict[str, Any]:
    return _generated(lambda: features.summarize_work(request.userId, request.workId, llm))


@app.post("/internal/insights", dependencies=internal)
def insights(request: UserRequest, llm: Llm = Depends(get_llm)) -> dict[str, Any]:
    return _generated(lambda: features.insights(request.userId, llm))


@app.post("/internal/recommendations", dependencies=internal)
def recommendations(request: UserRequest, llm: Llm = Depends(get_llm)) -> dict[str, Any]:
    return _generated(lambda: features.recommendations(request.userId, llm))
