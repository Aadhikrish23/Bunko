# Bunko ai-service

The Phase 10 AI layer (`docs/ARCHITECTURE.md` §8, `docs/AI_DATA_POLICY.md`):
semantic search over a reader's own highlights, notes, and reviews
(local embeddings in pgvector), generated insights from the Claude API, and
(Phase 11) chapter translation, also through the Claude API. For translation
the API sends the chapter text itself, so this service reads nothing extra.

It is **internal only**. The Express API is its sole caller and enforces
authentication, per-user consent, and the daily generation cap; this
service trusts the user id it's given and checks only the shared
`X-Internal-Token`.

## Configuration

| Variable | Required | Purpose |
|---|---|---|
| `AI_DATABASE_URL` | yes | The `bunko_ai` role from `scripts/create_ai_role.sql` — never the API's credentials |
| `AI_SERVICE_TOKEN` | yes | Shared secret (16+ chars); the API's `AI_SERVICE_TOKEN` must match |
| `ANTHROPIC_API_KEY` | no | Without it, semantic search works, and generated insights and translation report unavailable |
| `CLAUDE_MODEL` | no | Defaults to `claude-opus-5-5` |
| `EMBEDDING_MODEL` | no | Defaults to `BAAI/bge-small-en-v1.5` (384 dimensions — must match the migration) |

## Running

```bash
psql "$DATABASE_URL" -v ai_password="$AI_DB_PASSWORD" -f ai-service/scripts/create_ai_role.sql
docker compose --profile ai up ai-service
```

Then set `AI_SERVICE_URL=http://localhost:8001` and the same `AI_SERVICE_TOKEN`
for the API. The first indexing run downloads the embedding model (cached in
the `ai-models` volume).

## Tests

```bash
cd ai-service
python -m venv .venv && .venv/Scripts/python -m pip install -r requirements-dev.txt
.venv/Scripts/python -m pytest
```

The suite needs neither a database nor a model; the database-backed paths
are exercised through the API's integration tests.
