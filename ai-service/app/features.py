"""Generated insights (T-082-T-085): gather the minimum data each feature needs
for one user, then ask Claude. Nothing here is stored."""

from __future__ import annotations

from typing import Any

from . import prompts
from .db import connection
from .embeddings import Embedder
from .llm import Llm
from .search import search

ASK_EXCERPTS = 12
SUMMARY_ITEMS = 80
INSIGHT_NOTES = 30
RECOMMENDATION_BOOKS = 40


class NoData(Exception):
    """Nothing of the reader's to work from — answered without calling the model."""


def ask(user_id: str, question: str, llm: Llm, embedder: Embedder) -> dict[str, Any]:
    excerpts = search(user_id, question, ASK_EXCERPTS, embedder)
    if not excerpts:
        return {
            "answer": "You don't have any highlights, notes, or reviews indexed yet, so there's nothing of yours to answer from.",
            "citations": [],
            "coveredByNotes": False,
            "model": None,
        }
    result = llm.generate_json(
        system=prompts.ASK_SYSTEM, prompt=prompts.ask_prompt(question, excerpts), schema=prompts.ASK_SCHEMA
    )
    by_id = {e["sourceId"]: e for e in excerpts}
    # Only citations that point at excerpts actually sent count.
    citations = [
        {k: by_id[i][k] for k in ("sourceType", "sourceId", "workId", "title", "excerpt")}
        for i in dict.fromkeys(result.get("citedSourceIds", []))
        if i in by_id
    ]
    return {
        "answer": result["answer"],
        "citations": citations,
        "coveredByNotes": bool(result.get("coveredByNotes")),
        "model": llm.model,
    }


def summarize_work(user_id: str, work_id: str, llm: Llm) -> dict[str, Any]:
    with connection() as conn:
        work = conn.execute(
            """
            SELECT w.title, coalesce(array_agg(a.name) FILTER (WHERE a.name IS NOT NULL), '{}') AS authors
            FROM "Work" w
            JOIN "UserWork" uw ON uw."workId" = w.id AND uw."userId" = %(user_id)s
            LEFT JOIN "WorkAuthor" wa ON wa."workId" = w.id LEFT JOIN "Author" a ON a.id = wa."authorId"
            WHERE w.id = %(work_id)s GROUP BY w.id
            """,
            {"user_id": user_id, "work_id": work_id},
        ).fetchone()
        if work is None:
            raise NoData("This book isn't in your library.")
        params = {"user_id": user_id, "work_id": work_id, "limit": SUMMARY_ITEMS}
        items = [
            (row["kind"], row["text"])
            for row in conn.execute(
                """
                SELECT kind, text FROM (
                  SELECT lower(a.kind::text) AS kind, a.text || coalesce(' (my note: ' || a.note || ')', '') AS text,
                         a."createdAt" AS at
                  FROM "Annotation" a JOIN "Copy" c ON c.id = a."copyId" JOIN "Edition" e ON e.id = c."editionId"
                  WHERE a."userId" = %(user_id)s AND e."workId" = %(work_id)s
                  UNION ALL
                  SELECT 'note', n.body, n."createdAt" FROM "Note" n
                  WHERE n."userId" = %(user_id)s AND n."workId" = %(work_id)s
                  UNION ALL
                  SELECT 'reflection', s.reflection, s."startTime" FROM "ReadingSession" s
                  JOIN "ReadingJourney" j ON j.id = s."journeyId"
                  WHERE s."userId" = %(user_id)s AND j."workId" = %(work_id)s AND s.reflection IS NOT NULL
                ) items ORDER BY at LIMIT %(limit)s
                """,
                params,
            )
        ]
        review = conn.execute(
            'SELECT rating, body FROM "Review" WHERE "userId" = %(user_id)s AND "workId" = %(work_id)s', params
        ).fetchone()

    review_text = None
    if review and (review["body"] or review["rating"]):
        review_text = f"{review['rating']}/5. " if review["rating"] else ""
        review_text += review["body"] or ""
    if not items and not review_text:
        raise NoData("There's nothing to summarize yet — add highlights, notes, or a review first.")

    result = llm.generate_json(
        system=prompts.SUMMARY_SYSTEM,
        prompt=prompts.summary_prompt(work["title"], list(work["authors"]), items, review_text),
        schema=prompts.SUMMARY_SCHEMA,
    )
    return {"summary": result["summary"], "themes": result.get("themes", []), "model": llm.model}


LIBRARY_SQL = """
SELECT w.title, uw.status::text AS status, w.genres,
       coalesce(array_agg(DISTINCT a.name) FILTER (WHERE a.name IS NOT NULL), '{}') AS authors,
       coalesce(array_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL), '{}') AS shelves,
       r.rating, r.body AS review, coalesce(r."isFavourite", false) AS favourite
FROM "UserWork" uw
JOIN "Work" w ON w.id = uw."workId"
LEFT JOIN "WorkAuthor" wa ON wa."workId" = w.id LEFT JOIN "Author" a ON a.id = wa."authorId"
LEFT JOIN "ShelfWork" sw ON sw."userWorkId" = uw.id LEFT JOIN "Shelf" s ON s.id = sw."shelfId"
LEFT JOIN "Review" r ON r."workId" = w.id AND r."userId" = uw."userId"
WHERE uw."userId" = %(user_id)s
GROUP BY w.id, uw.status, r.rating, r.body, r."isFavourite"
ORDER BY r.rating DESC NULLS LAST, w.title
"""


def _book_line(row: dict[str, Any]) -> str:
    parts = [row["title"]]
    if row["authors"]:
        parts.append("by " + ", ".join(row["authors"]))
    parts.append(f"[{row['status'].lower().replace('_', ' ')}]")
    if row["genres"]:
        parts.append("genres: " + ", ".join(row["genres"]))
    if row.get("shelves"):
        parts.append("shelves: " + ", ".join(row["shelves"]))
    if row["rating"]:
        parts.append(f"rated {row['rating']}/5")
    if row["favourite"]:
        parts.append("a favourite")
    if row["review"]:
        parts.append("review: " + prompts.truncate(row["review"], 300))
    return " — ".join(parts)


def insights(user_id: str, llm: Llm) -> dict[str, Any]:
    with connection() as conn:
        library = conn.execute(LIBRARY_SQL, {"user_id": user_id}).fetchall()
        sessions = conn.execute(
            """
            SELECT count(*) AS sessions, coalesce(sum("durationSeconds"), 0) / 60 AS minutes,
                   count(DISTINCT date_trunc('day', "startTime")) AS days
            FROM "ReadingSession" WHERE "userId" = %(user_id)s AND status = 'ENDED'
            """,
            {"user_id": user_id},
        ).fetchone()
        notes = conn.execute(
            """
            SELECT w.title, x.text FROM (
              SELECT n."workId" AS work_id, n.body AS text, n."createdAt" AS at FROM "Note" n WHERE n."userId" = %(user_id)s
              UNION ALL
              SELECT e."workId", coalesce(a.note, a.text), a."createdAt" FROM "Annotation" a
              JOIN "Copy" c ON c.id = a."copyId" JOIN "Edition" e ON e.id = c."editionId" WHERE a."userId" = %(user_id)s
            ) x JOIN "Work" w ON w.id = x.work_id ORDER BY x.at DESC LIMIT %(limit)s
            """,
            {"user_id": user_id, "limit": INSIGHT_NOTES},
        ).fetchall()

    if not library:
        raise NoData("Add some books first — there's nothing to find patterns in yet.")
    stats = [
        f"{sessions['sessions']} reading sessions, {int(sessions['minutes'])} minutes in total, on {sessions['days']} different days",
        f"{sum(1 for row in library if row['status'] == 'FINISHED')} books finished out of {len(library)} in the library",
    ]
    result = llm.generate_json(
        system=prompts.INSIGHTS_SYSTEM,
        prompt=prompts.insights_prompt(
            [_book_line(row) for row in library[:RECOMMENDATION_BOOKS]],
            stats,
            [(row["title"], row["text"]) for row in notes],
        ),
        schema=prompts.INSIGHTS_SCHEMA,
    )
    return {"insights": result.get("insights", []), "model": llm.model}


def recommendations(user_id: str, llm: Llm) -> dict[str, Any]:
    with connection() as conn:
        library = conn.execute(LIBRARY_SQL, {"user_id": user_id}).fetchall()
    read = [row for row in library if row["status"] in ("FINISHED", "READING") or row["rating"]]
    if not read:
        raise NoData("Finish or rate a few books first, so recommendations can be based on your own taste.")
    titles = [row["title"] for row in library]
    result = llm.generate_json(
        system=prompts.RECOMMENDATIONS_SYSTEM,
        prompt=prompts.recommendations_prompt([_book_line(row) for row in read[:RECOMMENDATION_BOOKS]], titles),
        schema=prompts.RECOMMENDATIONS_SCHEMA,
    )
    owned = {title.strip().lower() for title in titles}
    picks = [item for item in result.get("recommendations", []) if item["title"].strip().lower() not in owned]
    return {"recommendations": picks, "model": llm.model}


def translate(text: str, target_language: str, llm: Llm) -> dict[str, Any]:
    """One segment of a chapter the reader owns (T-089). Nothing is stored
    here; the Express API keeps the result for that reader only."""
    translated = llm.generate_text(
        system=prompts.TRANSLATE_SYSTEM,
        prompt=prompts.translate_prompt(text, target_language),
    )
    return {"text": prompts.unescape(translated).strip(), "model": llm.model}
